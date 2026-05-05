from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import google.generativeai as genai
from pydantic import BaseModel
from dotenv import load_dotenv
import logging
# from fastapi.staticfiles import StaticFiles
# from fastapi.responses import FileResponse

# --- Imports for DB QA System ---
import faiss
from sentence_transformers import SentenceTransformer
from fastapi import Request
from course_db_data import get_courses_data
import re

# --- Imports for Roadmap Generation ---
import spacy
from typing import List

# --- Imports for executing .py files within same directory ---
import threading
import subprocess
import sys
import logging
import traceback

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
        return str(query).strip().lower(), data
    except Exception:
        return "", {}

# --- Execute .py files within same directory ---
@app.on_event("startup")
def startup_tasks():
    logging.info("✅ Startup tasks initialized.")

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
        "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set your Gemini API key from environment variable
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')

# Configure the Gemini API client
genai.configure(api_key=GEMINI_API_KEY)

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

# --- Handle User Greetings ---
@app.post("/greet")
async def greet(request: Request):
    user_input, _ = await get_user_query(request)
    
    # Default fallback greeting
    reply = "Hi there! I'm NexGenie. I can help you with coding, tech questions, learning roadmaps, and course advice. How can I assist you today?"
    
    if not user_input:
        user_input = "hello" # Default to hello if empty

    try:
        # Gemini prompt to detect and respond to any kind of greeting
        prompt = (
            f"The user said: '{user_input}'.\n"
            "If it's a greeting or friendly message (like hi, hello, hey, good morning, etc), reply with a warm, casual 1–2 sentence greeting. (e.g., 'Hi User! How can I help you today?') "
            "Sound human, not robotic. Vary responses. "
            "You’re NexGenie — an AI that helps with coding, tech questions, roadmaps, and course advice. "
            "Casually mention 1–2 of those in your reply. Don’t explain what the user said."
        )

        model = genai.GenerativeModel("gemini-2.5-flash")
        response = model.generate_content(prompt)
        if response and response.text:
            reply = response.text.strip()
    except Exception as e:
        logging.error(f"Greeting Generation Error: {str(e)}")
        logging.error(traceback.format_exc())

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
async def process_query(request_body: RequestBody):
    code = request_body.queryResult.parameters.code
    programminglanguage = request_body.queryResult.parameters.programminglanguage

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = (
            f"Generate a {programminglanguage} code snippet that performs the following task: '{code}'. "
            "The response should be formatted as a clean, well-structured code snippet, similar to how it would appear in a code editor."
        )
        response = model.generate_content(prompt)
        reply = response.text.strip()
    except Exception as e:
        logging.error(f"Process Query Error: {str(e)}")
        reply = f"I encountered an error generating the {programminglanguage} code for you. Please try again in a moment."

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
            course_metadata.append(row['Name'])

        if course_chunks:
            embeddings = embedder.encode(course_chunks, convert_to_tensor=False)
            dim = embeddings[0].shape[0]
            index = faiss.IndexFlatL2(dim)
            index.add(embeddings)
            logging.info("✅ Course data loaded and indexed.")
    except Exception as e:
        logging.error(f"Failed to load course data: {e}")

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


def extract_keywords(query: str) -> list:
    query = query.lower()
    stop_words = set([
        "what", "which", "tell", "me", "about", "find", "show", "give", "available", 
        "courses", "course", "are", "on", "our", "portal", "the", "is", "for", 
        "do", "you", "have", "any", "a", "an", "i", "want", "to", "learn", "best"
    ])
    tokens = re.findall(r'\w+', query)
    keywords = [token for token in tokens if token not in stop_words]
    return keywords

# --- Helper: Answer based on MongoDB ---
def answer_from_db(query: str, k: int = 3) -> list:
    if index is None or not course_chunks:
        return {"summary": "Course data is currently unavailable.", "courses": []}
    
    query_keywords = extract_keywords(query)
    if len(query_keywords) == 1 and query_keywords[0] in ["courses", "course"]:
        courses = get_courses_data()
        results = []
        model = genai.GenerativeModel("gemini-2.5-flash")

        for row in courses:
            try:
                description_prompt = f"Summarize the following course description in 2 lines max:\n\n{row['Description']}"
                summarized_description = model.generate_content(description_prompt).text.strip()
            except Exception:
                summarized_description = row['Description'][:150] + "..."
            
            course_data = {
                "name": str(row['Name']),
                "description": summarized_description,
                "price": format_price(row['Price']),
                "level": str(row['Level']),
                "benefits": str(row['Benefits'])[:100] + "...",
                "prerequisites": str(row['Prerequisites'])[:100] + "..."
            }
            results.append(course_data)

        return ["Here are the available courses on our portal.", *results]

    else:
        courses = get_courses_data()
        keywords = extract_keywords(query)
        filtered_courses = []
        for keyword in keywords:
            temp = [course for course in courses if keyword.lower() in str(course['Tags']).lower()]
            filtered_courses.extend(temp)

        # Remove duplicates
        seen_names = set()
        unique_filtered = []
        for c in filtered_courses:
            if c['Name'] not in seen_names:
                seen_names.add(c['Name'])
                unique_filtered.append(c)
        
        filtered_courses = unique_filtered

        if not filtered_courses:
            return {"summary": "I couldn't find any courses matching those specific keywords. You can browse all our courses by asking for 'all courses'.", "courses": []}

        filtered_course_chunks = []
        for row in filtered_courses:
            chunk = f"Course: {row['Name']}\nDescription: {row['Description']}\nTags: {row['Tags']}"
            filtered_course_chunks.append(chunk)

        embeddings = embedder.encode(filtered_course_chunks, convert_to_tensor=False)
        temp_index = faiss.IndexFlatL2(embeddings[0].shape[0])
        temp_index.add(embeddings)

        query_vec = embedder.encode([query])
        D, I = temp_index.search(query_vec, min(k, len(filtered_course_chunks)))

        results = []
        for idx in I[0]:
            if idx >= len(filtered_courses): continue
            row = filtered_courses[idx]
            results.append({
                "name": str(row['Name']),
                "price": format_price(row['Price']),
                "level": str(row['Level']),
                "thumbnail": str(row.get("Thumbnail", "")),
            })

        summary_text = "Here are some top course recommendations based on your interest."
        try:
            model = genai.GenerativeModel("gemini-2.5-flash")
            course_names = ", ".join([c['name'] for c in results])
            summary_prompt = f"Write a 1-line friendly summary for someone interested in '{query}' based on these courses: {course_names}"
            summary_text = model.generate_content(summary_prompt).text.strip()
        except Exception:
            pass

        return [summary_text, *results]


# --- Ask Course Route ---
@app.post("/ask_course")
async def ask_course(request: Request):
    query, _ = await get_user_query(request)

    if not query:
        return {"summary": "Please let me know what you'd like to learn about!", "courses": []}

    query_tokens = [word for word in query.split() if word not in ["what", "show", "me", "find", "the", "a"]]

    if "course" in query_tokens or "courses" in query_tokens:
        if len(query_tokens) <= 2: # e.g., "show courses" or "courses"
            courses = get_courses_data()
            course_data = [{
                "name": str(row['Name']),
                "price": format_price(row['Price']),
                "level": str(row['Level']),
                "thumbnail": str(row.get("Thumbnail", "")),
            } for row in courses]

            return {
                "summary": "Here are all the available courses on our portal.",
                "courses": course_data
            }
        
    raw = answer_from_db(query)
    if isinstance(raw, dict): return raw
    if not raw or len(raw) < 2:
        return {"summary": "No courses found matching your query.", "courses": []}

    return {
        "summary": raw[0],
        "courses": raw[1:]
    }

# --- Roadmap Logic ---
nlp = spacy.load("en_core_web_sm")

def extract_occupation(query: str) -> str:
    doc = nlp(query)
    target_phrases = []
    for chunk in doc.noun_chunks:
        chunk_text = chunk.text.strip().lower()
        if "roadmap" in chunk_text: continue
        if any(keyword in chunk_text for keyword in ["developer", "engineer", "scientist", "designer", "manager", "specialist", "analyst", "architect"]):
            target_phrases.append(chunk.text.strip())
    
    if target_phrases: return target_phrases[0]
    
    noun_chunks = [chunk.text.strip() for chunk in doc.noun_chunks if "roadmap" not in chunk.text.lower()]
    return noun_chunks[0] if noun_chunks else "professional"


@app.post("/get_roadmap")
async def get_roadmap(request: Request):
    query, _ = await get_user_query(request)
    if not query:
        return {"error": "No query provided."}

    occupation = extract_occupation(query)
    topic = re.sub(r"^(a|an|the)\s+", "", occupation, flags=re.IGNORECASE)
    
    # Default fallback roadmap text
    roadmap_text = f"1. Start with foundations of {topic}.\n2. Build basic projects to apply knowledge.\n3. Learn advanced concepts and tools.\n4. Build an industry-ready portfolio."
    
    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        roadmap_prompt = (
            f"Create a complete, detailed, and structured step-by-step learning roadmap to become a {topic}. "
            f"Begin with a one-sentence introduction like 'This roadmap outlines the steps to becoming a proficient {topic}. Timeframes are estimates and depend on prior experience and learning pace.' "
            f"Organize it into three main phases: Phase 1 - Foundational Knowledge, Phase 2 - Building Projects, and Phase 3 - Advanced Concepts & Specialization. "
            f"Each phase should include numbered steps, important skills, tools, projects, certifications, and estimated timeframes. "
            f"Use clear formatting with section headers like 'Phase 1: Foundational Knowledge (2-4 months)' and numbered steps underneath. "
            f"Use bullet points '•' (instead of * or -) for points"
            f"Use bullet points inside steps where helpful. End with a 'Tools & Resources:' section listing recommended platforms (starting with the LearnNexus portal), documentation, and editors. in points using bullets '•'. "
            f"Do not use any Markdown formatting or symbols. Only return the roadmap content."
        )

        response = model.generate_content(roadmap_prompt)
        if response and response.text:
            roadmap_text = response.text.strip()
    except Exception as e:
        logging.error(f"Roadmap Error: {e}")

    return {
        "roadmap_title": f"Roadmap for {topic.title()}",
        "roadmap": roadmap_text
    }


# --- Ask General Route ---
@app.post("/ask_general")
async def ask_general_question(request: Request):
    user_query, _ = await get_user_query(request)
    if not user_query:
        return {"answer": "I'm here to help! Please ask a question."}

    # Default fallback answer
    answer = f"I'm sorry, I couldn't generate a detailed answer for '{user_query}' right now. It seems to be a complex topic or my AI service is busy. Please try asking again shortly!"

    try:
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = (
            f"Provide a clear, structured answer to the following question:\n\n"
            f"'{user_query}'\n\n"
            f"Use this consistent structure regardless of question type:\n"
            f"1. Core Explanation or Definition\n"
            f"   • Provide a simple and clear explanation or definition\n"
            f"   • If the question is about differences, start with a brief context\n"
            f"2. Key Details or Breakdown\n"
            f"   • List essential points, steps, or comparisons as bullet points\n"
            f"   • Use '•' as bullet symbol, not *, -, or markdown\n"
            f"3. Examples or Applications\n"
            f"   • Give real-world use-cases, analogies, or brief examples (if applicable) \n"
            f"4. Quick Summary\n"
            f"   • Wrap up in 1–2 sentences with a neutral conclusion\n"
            f"Formatting Rules:\n"
            f"• Use plain and simple language — avoid jargon unless necessary\n"
            f"• Do NOT include the original question in the answer\n"
            f"• Do NOT use markdown symbols (*, _, #, etc.)\n"
            f"• Avoid unnecessary repetition\n"
            f"• Maintain a neutral, informative tone"
        )
        response = model.generate_content(prompt)
        if response and response.text:
            answer = response.text.strip()
    except Exception as e:
        logging.error(f"General Query Error: {e}")

    return {
        "question": user_query,
        "answer": answer
    }
