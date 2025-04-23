from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import google.generativeai as genai
from pydantic import BaseModel
from dotenv import load_dotenv
import logging
from fastapi.responses import FileResponse

# --- Imports for CSV QA System ---
import pandas as pd
import faiss
from sentence_transformers import SentenceTransformer
from fastapi import Request

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
    def run_scripts():
        subprocess.run([sys.executable, "courses_db.py"])
        subprocess.run([sys.executable, "courses_csv_maker.py"])
        logging.info("✅ Both scripts executed successfully.")
    
    threading.Thread(target=run_scripts).start()


# Serve static files (including HTML) from the "static" directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Serve the index.html file from the static directory
@app.get("/")
async def root():
    return FileResponse("static/index.html")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust as necessary for security
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


# --- Load and Embed Courses CSV ---
csv_path = "courses.csv"
embedder = SentenceTransformer("all-MiniLM-L6-v2")

# Store data and index
course_chunks = []
course_metadata = []
index = None

def load_courses_data():
    global course_chunks, course_metadata, index
    df = pd.read_csv(csv_path)

    # Convert each row into a "chunk" of info
    course_chunks = []
    course_metadata = []

    for _, row in df.iterrows():
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

# --- Helper: Answer based on CSV ---
def answer_from_csv(query: str, k: int = 3) -> str:
    if index is None or not course_chunks:
        return {"summary": "Course data not loaded.", "courses": []}

    query_vec = embedder.encode([query])
    D, I = index.search(query_vec, k)

    df = pd.read_csv(csv_path)  # Reload CSV to access structured data
    results = []

    # Initialize Gemini model (done only once for reuse)
    model = genai.GenerativeModel("gemini-1.5-flash")

    for idx in I[0]:
        row = df.iloc[idx]

        # --- Summarize long fields using Gemini ---
        try:
            description_prompt = f"Summarize the following course description in 2 lines max:\n\n{row['Description']}"
            benefits_prompt = f"Summarize the following course benefits in 2 lines max:\n\n{row['Benefits']}"
            prerequisites_prompt = f"Summarize the prerequisites below briefly:\n\n{row['Prerequisites']}"

            summarized_description = model.generate_content(description_prompt).text.strip()
            summarized_benefits = model.generate_content(benefits_prompt).text.strip()
            summarized_prerequisites = model.generate_content(prerequisites_prompt).text.strip()
        except Exception as e:
            # Fallback in case of API failure
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
        # Create a text block to summarize
        course_list_text = "\n\n".join([f"{c['name']}: {c['benefits']}" for c in results])
        summary_prompt = f"Based on the following list of course names and benefits, provide a short summary (1-2 lines) highlighting what a learner might gain:\n\n{course_list_text}"
        summary_text = model.generate_content(summary_prompt).text.strip()
    except Exception:
        summary_text = "Here are some top course recommendations based on your query."

    # Return as a structured dictionary
    return [summary_text, *results]



# --- New Route ---
@app.post("/ask_course")
async def ask_course(request: Request):
    data = await request.json()
    query = data.get("query", "")
    if not query:
        return {"error": "No query provided."}
    
    answer = answer_from_csv(query)
    return {"answer": answer}