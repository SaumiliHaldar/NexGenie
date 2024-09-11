import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import google.generativeai as genai
from pydantic import BaseModel
from dotenv import load_dotenv
import logging

# Load environment variables from .env file
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

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



logging.basicConfig(level=logging.INFO)

@app.post("/process_query")
async def process_query(request_body: RequestBody):
    code = request_body.queryResult.parameters.code
    programming_languages = request_body.queryResult.parameters.programminglanguage

    if not programming_languages:
        raise HTTPException(status_code=400, detail="No programming language provided")

    programminglanguage = programming_languages[0]  # Assuming only one language is provided

    prompt = (
        f"Generate a {programminglanguage} code snippet that performs the following task: '{code}'. "
        "The response should be formatted as a clean, well-structured code snippet, similar to how it would appear in a code editor."
    )
    
    try:
        # Timeout set to 4 seconds (less than Dialogflow's default timeout of 5 seconds)
        response = await asyncio.wait_for(genai.GenerativeModel("gemini-1.5-flash").generate_content(prompt), timeout=10)
        
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
    except asyncio.TimeoutError:
        logging.error("API request timed out")
        raise HTTPException(status_code=504, detail="API request timed out")
    except Exception as e:
        logging.error(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))