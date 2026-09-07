from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import os
import time
import random
import re
import logging
import traceback
from collections import defaultdict
from difflib import get_close_matches

import google.generativeai as genai
from pydantic import BaseModel
from dotenv import load_dotenv

import faiss
import spacy
from sentence_transformers import SentenceTransformer

from course_db_data import get_courses_data

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# --- Utility to extract query from various formats ---
async def get_user_query(request: Request):
    try:
        data = await request.json()
        # Check common keys used by Dialogflow and custom frontends
        query = data.get("query") or data.get("queryText") or data.get("user_query") or ""
        # Case is preserved here because spaCy parses this text for the roadmap
        # topic and does a noticeably worse job on all-lowercase input.
        return str(query).strip(), data
    except Exception:
        return "", {}

@app.get("/")
async def root():
    return {"message": "Hello, User!"}

@app.get("/healthz")
async def health_check():
    return {"status": "ok"}

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://nexgenie.vercel.app", 
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://nexgenie.onrender.com",
        "https://localhost:8000",
        "http://127.0.0.1:8000",
        "https://learnnexus.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set your Gemini API key from environment variable
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Configure the Gemini API client
genai.configure(api_key=GEMINI_API_KEY)

# Google retires these every few months, so the name is an env var - a retired
# model can be swapped on the host without touching the code.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

# Define Pydantic models for request validation
class Parameters(BaseModel):
    code: str
    programminglanguage: str

class QueryResult(BaseModel):
    parameters: Parameters

class RequestBody(BaseModel):
    queryResult: QueryResult

# Configure logging
logging.basicConfig(level=logging.INFO)


# The model copies punctuation from the prompt, so every prose prompt repeats
# this. Without it the replies come back full of long dashes.
PLAIN_TEXT = "Never use em dashes or en dashes. Use a plain hyphen '-' instead."

# The prompt rule above is a request, not a guarantee - the model still slips a
# long dash in now and then. generate() strips them, so this is the guarantee.
# — is the em dash, – the en dash.
DASHES = str.maketrans({"—": "-", "–": "-"})


# --- Answer styles ---
# One is picked at random per request so the same question comes back worded
# differently each time - sometimes short, sometimes detailed, sometimes bullets.
STYLES = [
    "Answer in 2-3 short lines. Keep it crisp.",
    "Answer in detail, with a real example.",
    "Answer as bullet points using '•'.",
    "Explain casually, like talking to a friend.",
    "Give a one-line answer first, then 2-3 supporting points.",
    "Start with a simple analogy, then explain.",
]

# Greetings only need tone variation, not length or structure.
GREET_STYLES = [
    "Keep it to one short line.",
    "Reply in two friendly sentences.",
    "Be playful and a little witty.",
    "Open with a light question back to the user.",
]

# The roadmap keeps its Phase headings - the chat widget formats on them.
# Only depth and tone vary here.
ROADMAP_STYLES = [
    "Keep each step to one line. Lean and scannable.",
    "Go deep - add tools, example projects and certifications per step.",
    "Keep the tone beginner-friendly and encouraging.",
    "Be direct and practical, no filler.",
]


# --- Gemini ---
def generate(prompt: str, source: str = "gemini"):
    """Returns the model's text, or None if the call failed.
    Callers use their own fallback text on None.
    source names the endpoint so a failure in the logs points somewhere."""
    started = time.time()
    try:
        response = genai.GenerativeModel(GEMINI_MODEL).generate_content(prompt)
        if response and response.text:
            logging.info(f"{source}: replied in {time.time() - started:.1f}s")
            return response.text.strip().translate(DASHES)
        logging.warning(f"{source}: model returned no text")
    except Exception as e:
        logging.error(f"{source}: {e}")
        logging.error(traceback.format_exc())
    return None


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """One line per request. Health checks are skipped - they run constantly
    and would bury everything else."""
    started = time.time()
    response = await call_next(request)
    if request.url.path not in ("/", "/healthz"):
        logging.info(f"{request.url.path} -> {response.status_code} in {time.time() - started:.1f}s")
    return response


# --- Rate limiting ---
# In-memory counter. Works because the Procfile runs a single gunicorn worker;
# with more than one worker this would not be shared and would need Redis.
# Counts per IP, so everyone behind a campus or mobile NAT is treated as one user.
# 20 per minute is far above what a person can type and well below a script.
_hits = defaultdict(list)

def rate_limit(request: Request, limit: int = 20, window: int = 60):
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    _hits[ip] = [t for t in _hits[ip] if now - t < window]
    if len(_hits[ip]) >= limit:
        raise HTTPException(429, "Too many requests. Please wait a minute and try again.")
    _hits[ip].append(now)


# --- Handle User Greetings ---
@app.post("/greet")
async def greet(request: Request):
    rate_limit(request)
    user_input, _ = await get_user_query(request)
    
    # Default fallback greeting
    reply = "Hi there! I'm NexGenie. I can help you with coding, tech questions, learning roadmaps, and course advice. How can I assist you today?"
    
    if not user_input:
        user_input = "hello" # Default to hello if empty

    prompt = (
        f"The user said: '{user_input}'.\n"
        f"{random.choice(GREET_STYLES)}\n"
        "Reply with a warm, casual greeting. Sound human, not robotic. "
        "You are NexGenie, an AI that helps with coding, tech questions, roadmaps, and course advice. "
        "Casually mention 1 or 2 of those in your reply. Do not explain what the user said. "
        f"{PLAIN_TEXT}"
    )
    reply = await asyncio.to_thread(generate, prompt, "greet") or reply

    return {
        "fulfillmentMessages": [
            {
                "text": {
                    "text": [reply]
                }
            }
        ]
    }


# --- Process General Query and Coding Questions ---
@app.post("/process_query")
async def process_query(request: Request, request_body: RequestBody):
    rate_limit(request)
    code = request_body.queryResult.parameters.code
    programminglanguage = request_body.queryResult.parameters.programminglanguage

    prompt = (
        f"Generate a {programminglanguage} code snippet that performs the following task: '{code}'. "
        "Put the code in a fenced block and always write the language right after "
        "the opening fence, like ```python - the chat widget uses that name to "
        "colour the code. Keep any explanation outside the fence, short. "
        f"{PLAIN_TEXT}"
    )
    reply = await asyncio.to_thread(generate, prompt, "process_query") or (
        "I couldn't generate that code right now. Please try again in a moment."
    )

    return {
        "fulfillmentMessages": [
            {
                "text": {
                    "text": [reply]
                }
            }
        ]
    }


# --- Embed Courses Data ---
embedder = SentenceTransformer("paraphrase-MiniLM-L6-v2")

# Store data and index
course_chunks = []
course_metadata = []
index = None

def load_courses_data():
    global course_chunks, course_metadata, index
    try:
        courses = get_courses_data()  # Fetch courses from MongoDB
        course_chunks = []
        course_metadata = []

        for row in courses:
            chunk = f"""Course: {row['Name']}
Description: {row['Description']}
Tags: {row['Tags']}
Category: {row['Category']}
Level: {row['Level']}
Price: {row['Price']}
Benefits: {row['Benefits']}
Prerequisites: {row['Prerequisites']}"""
            course_chunks.append(chunk)
            # Keep the whole row so requests can answer from memory instead of
            # querying Mongo again. Index positions match course_chunks.
            course_metadata.append(row)

        if course_chunks:
            embeddings = embedder.encode(course_chunks, convert_to_tensor=False)
            dim = embeddings[0].shape[0]
            index = faiss.IndexFlatL2(dim)
            index.add(embeddings)
            logging.info(f"✅ Indexed {len(course_chunks)} courses ({dim}-dim).")
        else:
            logging.warning("No courses came back from the database - /ask_course will be empty.")
    except Exception as e:
        logging.error(f"Failed to load course data: {e}")
        logging.error(traceback.format_exc())

# Call once on startup
load_courses_data()

def format_price(price):
    try:
        if isinstance(price, (int, float)) and price == 0:
            return "Free"
        if isinstance(price, str) and price.strip().lower() in ["0", "free"]:
            return "Free"
        return str(price)
    except:
        return str(price)


# --- Course search ---
# The general STYLES are wrong here - "start with an analogy" or "answer in
# detail" turns a one-line intro into an essay above the course cards. Only the
# tone varies.
SUMMARY_STYLES = [
    "Keep it warm and encouraging.",
    "Be direct and practical.",
    "Sound genuinely enthusiastic.",
    "Keep it plain and matter-of-fact.",
]


def course_summary(query: str, names: str) -> str:
    """One friendly line above the results. Falls back to a fixed line."""
    return generate(
        f"Write ONE sentence, at most 20 words, introducing these courses to "
        f"someone interested in '{query}': {names}. "
        f"{random.choice(SUMMARY_STYLES)} "
        f"Plain text only - no markdown, no bullet points, no headings. "
        f"{PLAIN_TEXT}",
        "ask_course",
    ) or "Here are some courses that match what you're looking for."


def course_result(row: dict) -> dict:
    return {
        "name": str(row["Name"]),
        "price": format_price(row["Price"]),
        "level": str(row["Level"]),
        "thumbnail": str(row.get("Thumbnail", "")),
    }


def search_courses(query: str, k: int = 3) -> dict:
    """Semantic search over the index built at startup. Blocking - call it in a
    thread. Always returns the response shape, so callers need no unpacking."""
    if index is None or not course_metadata:
        return {"summary": "Course data is currently unavailable.", "courses": []}

    query_vec = embedder.encode([query])
    _, positions = index.search(query_vec, min(k, len(course_metadata)))

    courses = [course_result(course_metadata[i]) for i in positions[0]]
    if not courses:
        return {"summary": "No courses found matching your query.", "courses": []}

    names = ", ".join(c["name"] for c in courses)
    return {"summary": course_summary(query, names), "courses": courses}


# The widget sends misspelt queries here now, so word checks allow a typo.
def fuzzy_in(word: str, options) -> bool:
    return word in options or bool(get_close_matches(word, options, n=1, cutoff=0.8))


SHOW_ALL_WORDS = {"course", "courses", "list", "available"}
FILLER_WORDS = {"what", "which", "show", "me", "find", "give", "tell", "about",
                "the", "a", "an", "all", "your", "our", "are", "is", "there",
                "do", "you", "have", "any", "on", "portal", "please"}


# --- Ask Course Route ---
@app.post("/ask_course")
async def ask_course(request: Request):
    rate_limit(request)
    query, _ = await get_user_query(request)

    if not query:
        return {"summary": "Please let me know what you'd like to learn about!", "courses": []}

    # "courses" on its own means "show me everything". Anything with an actual
    # topic in it ("python course", "web development course") goes to search -
    # the old rule sent any two-word query to the full list instead.
    words = [w for w in re.findall(r"\w+", query.lower()) if w not in FILLER_WORDS]

    if words and all(fuzzy_in(w, SHOW_ALL_WORDS) for w in words):
        return {
            "summary": "Here are all the available courses on our portal.",
            "courses": [course_result(row) for row in course_metadata],
        }

    # Embedding plus a Gemini call - both block, so keep them off the loop.
    return await asyncio.to_thread(search_courses, query)

# --- Roadmap Logic ---
nlp = spacy.load("en_core_web_sm")

def says_roadmap(text: str) -> bool:
    """The word "roadmap" itself, however spelt. It must not become the topic."""
    return any(fuzzy_in(w, {"roadmap", "roadmaps"})
               for w in re.findall(r"\w+", text.lower()))


def extract_occupation(query: str) -> str:
    doc = nlp(query)
    target_phrases = []
    for chunk in doc.noun_chunks:
        chunk_text = chunk.text.strip().lower()
        if says_roadmap(chunk_text): continue
        if any(keyword in chunk_text for keyword in ["developer", "engineer", "scientist", "designer", "manager", "specialist", "analyst", "architect"]):
            target_phrases.append(chunk.text.strip())
    
    if target_phrases: return target_phrases[0]
    
    noun_chunks = [chunk.text.strip() for chunk in doc.noun_chunks
                   if not says_roadmap(chunk.text)]
    return noun_chunks[0] if noun_chunks else "professional"


@app.post("/get_roadmap")
async def get_roadmap(request: Request):
    rate_limit(request)
    query, _ = await get_user_query(request)
    if not query:
        return {"error": "No query provided."}

    occupation = extract_occupation(query)
    topic = re.sub(r"^(a|an|the)\s+", "", occupation, flags=re.IGNORECASE)
    
    # Default fallback roadmap text
    roadmap_text = f"1. Start with foundations of {topic}.\n2. Build basic projects to apply knowledge.\n3. Learn advanced concepts and tools.\n4. Build an industry-ready portfolio."
    
    roadmap_prompt = (
        f"Create a structured step-by-step learning roadmap to become a {topic}. "
        f"{random.choice(ROADMAP_STYLES)} "
        f"Begin with a one-sentence introduction like 'This roadmap outlines the steps to becoming a proficient {topic}. Timeframes are estimates and depend on prior experience and learning pace.' "
        f"Organize it into three main phases: Phase 1 - Foundational Knowledge, Phase 2 - Building Projects, and Phase 3 - Advanced Concepts & Specialization. "
        f"Each phase should include numbered steps, important skills, tools, projects, certifications, and estimated timeframes. "
        f"Use clear formatting with section headers like 'Phase 1: Foundational Knowledge (2-4 months)' and numbered steps underneath. "
        f"Use bullet points '•' (instead of * or -) for points. "
        f"Use bullet points inside steps where helpful. End with a 'Tools & Resources:' section listing recommended platforms (starting with the LearnNexus portal), documentation, and editors. in points using bullets '•'. "
        f"Do not use any Markdown formatting or symbols. Only return the roadmap content. "
        f"{PLAIN_TEXT}"
    )
    roadmap_text = await asyncio.to_thread(generate, roadmap_prompt, "get_roadmap") or roadmap_text

    return {
        "roadmap_title": f"Roadmap for {topic.title()}",
        "roadmap": roadmap_text
    }


# --- Ask General Route ---
@app.post("/ask_general")
async def ask_general_question(request: Request):
    rate_limit(request)
    user_query, _ = await get_user_query(request)
    if not user_query:
        return {"answer": "I'm here to help! Please ask a question."}

    # Default fallback answer
    answer = f"I'm sorry, I couldn't generate a detailed answer for '{user_query}' right now. It seems to be a complex topic or my AI service is busy. Please try asking again shortly!"

    prompt = (
        f"{random.choice(STYLES)}\n\n"
        f"Question: '{user_query}'\n\n"
        f"Use plain, simple language. Do not repeat the question. "
        f"Do not use markdown symbols such as *, _ or #. "
        f"The one exception: if code helps, put it in a fenced block with the "
        f"language after the opening fence, like ```python. "
        f"{PLAIN_TEXT}"
    )
    answer = await asyncio.to_thread(generate, prompt, "ask_general") or answer

    return {
        "question": user_query,
        "answer": answer
    }
