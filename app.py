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

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# --- Excecute .py files within same directory ---
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


# --- Process General Query and Coding Questions ---
@app.post("/process_query")
async def process_query(request_body: RequestBody):
    code = request_body.queryResult.parameters.code
    programminglanguage = request_body.queryResult.parameters.programminglanguage

    try:
        # Create a generative model
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        # Generate content based on the user's input
        prompt = (
            f"Generate a {programminglanguage} code snippet that performs the following task: '{code}'. "
            "The response should be formatted as a clean, well-structured code snippet, similar to how it would appear in a code editor."
        )
        response = model.generate_content(prompt)
        
        # Return the generated text as a text message for Dialogflow
        return {
            "fulfillmentMessages": [
                {
                    "text": {
                        "text": [
                            response.text.strip()
                        ]
                    }
                }
            ]
        }
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Embed Courses Data ---
embedder = SentenceTransformer("paraphrase-MiniLM-L6-v2")

# Store data and index
course_chunks = []
course_metadata = []
index = None

def load_courses_data():
    global course_chunks, course_metadata, index
    courses = get_courses_data()  # Fetch courses from MongoDB

    # Convert each course to a "chunk" of information
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

    # Embed the chunks
    embeddings = embedder.encode(course_chunks, convert_to_tensor=False)

    # Create FAISS index
    dim = embeddings[0].shape[0]
    index = faiss.IndexFlatL2(dim)
    index.add(embeddings)

# Call once on startup
load_courses_data()

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
        return {"summary": "Course data not loaded.", "courses": []}
    
    # Check if the query is just asking for "courses"
    query_keywords = extract_keywords(query)
    if len(query_keywords) == 1 and query_keywords[0] in ["courses", "course"]:
        # User is asking for all courses, so return all without filtering
        courses = get_courses_data()  # Fetch data from MongoDB

        results = []
        # Initialize Gemini model (done only once for reuse)
        model = genai.GenerativeModel("gemini-1.5-flash")

        for row in courses:
            try:
                description_prompt = f"Summarize the following course description in 2 lines max:\n\n{row['Description']}"
                benefits_prompt = f"Summarize the following course benefits in 2 lines max:\n\n{row['Benefits']}"
                prerequisites_prompt = f"Summarize the prerequisites below briefly:\n\n{row['Prerequisites']}"

                summarized_description = model.generate_content(description_prompt).text.strip()
                summarized_benefits = model.generate_content(benefits_prompt).text.strip()
                summarized_prerequisites = model.generate_content(prerequisites_prompt).text.strip()
            except Exception as e:
                summarized_description = row['Description']
                summarized_benefits = row['Benefits']
                summarized_prerequisites = row['Prerequisites']

            course_data = {
                "name": str(row['Name']),
                "description": summarized_description,
                "price": str(row['Price']),
                "level": str(row['Level']),
                "benefits": summarized_benefits,
                "prerequisites": summarized_prerequisites
            }
            results.append(course_data)

        # --- Add a brief summary of the matched courses using Gemini ---
        try:
            course_list_text = "\n\n".join([f"{c['name']}: {c['benefits']}" for c in results])
            summary_prompt = (
                f"Write a 1-2 line summary for someone interested in 'courses', "
                f"based on the following course benefits:\n\n{course_list_text}.\n\n"
            )
            summary_text = model.generate_content(summary_prompt).text.strip()
        except Exception:
            summary_text = "Here are some top course recommendations."

        return [summary_text, *results]

    else:
        # If the query contains keywords, filter the courses based on the keywords
        courses = get_courses_data()  # Fetch data from MongoDB

        # Step 1: First extract keywords
        keywords = extract_keywords(query)

        # Step 2: Filter courses based on Tags
        filtered_courses = []
        for keyword in keywords:
            temp = [course for course in courses if keyword.lower() in course['Tags'].lower()]
            filtered_courses.extend(temp)

        filtered_courses = [dict(t) for t in {tuple(d.items()) for d in filtered_courses}]  # Remove duplicates

        if not filtered_courses:
            return {"summary": "No courses found matching your query.", "courses": []}

        # Step 3: Now embed filtered courses
        filtered_course_chunks = []
        filtered_metadata = []
        for row in filtered_courses:
            chunk = f"""Course: {row['Name']}
Description: {row['Description']}
Tags: {row['Tags']}
Category: {row['Category']}
Level: {row['Level']}
Price: {row['Price']}
Benefits: {row['Benefits']}
Prerequisites: {row['Prerequisites']}"""
            filtered_course_chunks.append(chunk)
            filtered_metadata.append(row['Name'])

        if not filtered_course_chunks:
            return {"summary": "No relevant courses found.", "courses": []}

        embeddings = embedder.encode(filtered_course_chunks, convert_to_tensor=False)
        temp_index = faiss.IndexFlatL2(embeddings[0].shape[0])
        temp_index.add(embeddings)

        query_vec = embedder.encode([query])
        D, I = temp_index.search(query_vec, min(k, len(filtered_course_chunks)))

        results = []

        # Initialize Gemini model (done only once for reuse)
        model = genai.GenerativeModel("gemini-1.5-flash")

        for idx in I[0]:
            if idx >= len(filtered_courses):
                continue
            row = filtered_courses[idx]

            course_data = {
                "name": str(row['Name']),
                    "price": str(row['Price']),
                    "level": str(row['Level']),
                    "thumbnail": str(row.get("Thumbnail", "")),

            }
            results.append(course_data)

        try:
            course_list_text = "\n\n".join([f"{c['name']}: {c['benefits']}" for c in results])
            summary_prompt = (
                f"Write a 1-2 line summary for someone interested in '{' '.join(query_keywords)}', "
                f"based on the following course benefits:\n\n{course_list_text}.\n\n"
                f"Make sure to clearly mention '{' '.join(query_keywords)}' in the summary."
            )

            summary_text = model.generate_content(summary_prompt).text.strip()
        except Exception:
            summary_text = "Here are some top course recommendations based on your query."

        return [summary_text, *results]


# --- Ask Course Route ---
@app.post("/ask_course")
async def ask_course(request: Request):
    # Step 1: Parse the query from the request
    data = await request.json()
    query = data.get("query", "").strip().lower()  # Normalize query input by stripping spaces and converting to lowercase

    if not query:
        return {"error": "No query provided."}  # If no query is provided, return an error response

    # Step 2: Clean the query to remove unnecessary words
    simple_words = [
        "what", "which", "tell", "me", "about", "find", "show", "give", "available",
        "are", "on", "our", "portal", "the", "is", "for", "do", "you", "have", "any",
        "a", "an", "i", "want", "to", "learn", "best"
    ]
    query_tokens = [word for word in query.split() if word not in simple_words]  # Remove simple words

    # Step 3: Check if query is asking for a general "course" or "courses"
    if "course" in query_tokens or "courses" in query_tokens:
        if len(query_tokens) == 1:  # If the query contains only "course" or "courses"
            courses = get_courses_data()  # Fetch all courses from MongoDB

            course_data = []
            for row in courses:
                # Append the summarized or original course details
                course_data.append({
                    "name": str(row['Name']),
                    "price": str(row['Price']),
                    "level": str(row['Level']),
                    "thumbnail": str(row.get("Thumbnail", "")),
                })

            return {
                "summary": "Here are all the available courses on our portal.",
                "courses": course_data
            }
        
        else:
            # If the query contains a keyword, filter the courses
            raw = answer_from_db(query)  # Call the function to get courses based on the query
            
            if isinstance(raw, dict):  # Error checking, if no courses were found
                return raw

            if not raw or len(raw) < 2:
                return {"summary": "No courses found matching your query.", "courses": []}

            summary = raw[0]  # First element is the summary
            courses = raw[1:]  # Remaining elements are the filtered courses

            # Process and return filtered courses
            seen = set()
            unique_courses = [] 

            for course in courses:
                if course["name"] not in seen:
                    seen.add(course["name"])
                    unique_courses.append(course)

            return {
                "summary": summary,
                "courses": unique_courses  # Only include unique courses in the response
            }

def get_memory_usage():
    process = os.popen(f'tasklist /FI "PID eq {os.getpid()}"').read()
    return process

# print(f"Memory Usage: {get_memory_usage()}")


# Load spaCy English model
nlp = spacy.load("en_core_web_sm")

# Extract occupation from query
def extract_occupation(query: str) -> str:
    doc = nlp(query)
    target_phrases = []

    # Check noun chunks for likely occupations
    for chunk in doc.noun_chunks:
        chunk_text = chunk.text.strip().lower()
        if "roadmap" in chunk_text:
            continue
        if any(keyword in chunk_text for keyword in ["developer", "engineer", "scientist", "designer", "manager", "specialist", "analyst", "architect"]):
            target_phrases.append(chunk.text.strip())

    if target_phrases:
        occupation = target_phrases[0]
    else:
        # Fallback to longest noun chunk excluding 'roadmap'
        noun_chunks = [chunk.text.strip() for chunk in doc.noun_chunks if "roadmap" not in chunk.text.lower()]
        occupation = noun_chunks[0] if noun_chunks else "professional"

    # Remove leading articles like "a", "an", "the"
    occupation = re.sub(r"^(a|an|the)\s+", "", occupation, flags=re.IGNORECASE)
    return occupation


# --- Get Roadmap Route ---
@app.post("/get_roadmap")
async def get_roadmap(request: Request):
    data = await request.json()
    query = data.get("query", "").strip().lower()

    if not query:
        return {"error": "No query provided."}

    # Extract key occupation keyword
    important_keywords = extract_occupation(query)
    print("Extracted:", important_keywords)

    topic = important_keywords if important_keywords else "this career"

    roadmap_prompt = (
        f"Create a complete, detailed, and structured step-by-step learning roadmap to become a {topic}. "
        f"Organize it by stages like beginner, intermediate, and advanced. Include skills, tools, projects, certifications, and estimated timeframes where applicable. "
        f"Format clearly using bullet points or numbered steps."
    )

    roadmap_prompt = (
        f"Create a complete, detailed, and structured step-by-step learning roadmap to become a {topic}. "
        f"Begin with a one-sentence introduction like 'This roadmap outlines the steps to becoming a proficient {topic}. Timeframes are estimates and depend on prior experience and learning pace.' "
        f"Organize it into three main phases: Phase 1 - Foundational Knowledge, Phase 2 - Building Projects, and Phase 3 - Advanced Concepts & Specialization. "
        f"Each phase should include numbered steps, important skills, tools, projects, certifications, and estimated timeframes. "
        f"Use clear formatting with section headers like 'Phase 1: Foundational Knowledge (2-4 months)' and numbered steps underneath. "
        f"Use bullet points inside steps where helpful. End with a 'Tools & Resources' section listing recommended platforms (starting with the LearnNexus portal), documentation, and editors. "
        f"Do not use any Markdown formatting or symbols. Only return the roadmap content."
    )


    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content(roadmap_prompt)
        roadmap_text = response.text.strip()

        return {
            "roadmap_title": f"Roadmap to Become a {topic.title()}",
            "roadmap": roadmap_text
        }

    except Exception as e:
        return {"error": f"Failed to generate roadmap. {str(e)}"}