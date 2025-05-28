from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import vertexai
from vertexai.generative_models import GenerativeModel
from google import genai
from google.genai.types import GenerateContentConfig, HttpOptions
import os
import ast
from dotenv import load_dotenv
import logging
from datetime import datetime

os.makedirs('logs', exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(f'logs/api_{datetime.now().strftime("%Y%m%d")}.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

system_prompt = """
            You are Code-Feedback Mentor. Follow these rules:
            If "Syntax Errors" is not empty, make sure to acknowledge them in your response.
            Give only hints and a question that help the user debug; never paste a full corrected solution.
            Output must be plain text (no markdown, no code fences).
            Be concise, polite, and reference line numbers when helpful.
            If the issue is unclear, ask a clarifying question.
            Make sure your response has no titles, headers, newlines, or other formatting.
            DO NOT START YOUR RESPONSE WITH "Hint:" OR ANY FORM OF TITLE.
            """

class QueryRequest(BaseModel):
    problem: str
    code: str | None = None

class QueryResponse(BaseModel):
    response: str

def get_syntax_errors(source: str, filename: str = "<string>"):
    try:
        ast.parse(source, filename=filename, mode="exec")
        return None
    except SyntaxError as err:
        return {
            "msg":       err.msg,
            "lineno":    err.lineno,
            "col":       err.offset,
            "end_line":  getattr(err, "end_lineno", None),
            "end_col":   getattr(err, "end_offset", None),
            "text":      err.text.rstrip("\n") if err.text else None,
        }

@app.post("/query", response_model=QueryResponse)
async def query(request: QueryRequest):
    try:
        project_id = os.getenv("GOOGLE_CLOUD_PROJECT")
        if not project_id:
            raise HTTPException(status_code=500, detail="Environment variables is not set")
            
        location = "us-central1"

        syntax_errors = get_syntax_errors(request.code) if request.code else None
        
        syntax_block = (
            f"Detected syntax errors:\n"
            f"{syntax_errors['msg']} (line {syntax_errors['lineno']}, col {syntax_errors['col']})\n"
            if syntax_errors else
            "Detected syntax errors: none\n"
        )

        user_prompt = (
            f"Code:\n{request.code}\n\n"
            f"Problem:\n{request.problem}\n\n"
            f"{syntax_block}"
        )
        
        logger.info(f"Received request - Problem: {request.problem}")
        if request.code:
            logger.info(f"Code provided: {request.code}")
        if syntax_errors:
            logger.info(f"Syntax errors detected: {syntax_errors}")
        
        client = genai.Client(http_options=HttpOptions(api_version="v1"), vertexai=True, project=project_id, location=location)
            
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-05-20",
            contents=[user_prompt],
            config=GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=0.25,
                top_p=0.95,
                max_output_tokens=512
            )
        )
        
        return QueryResponse(response=response.text)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("API_HOST", "0.0.0.0")
    port = int(os.getenv("API_PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
    
