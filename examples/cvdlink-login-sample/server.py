import os
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

PORT = int(os.environ.get("PORT", "5173"))
HERE = Path(__file__).resolve().parent

app = FastAPI(title="CVDLINK Login Sample")
app.mount("/", StaticFiles(directory=str(HERE), html=True), name="static")


if __name__ == "__main__":
    print(f"CVDLINK Login Sample listening on http://localhost:{PORT}")
    uvicorn.run("server:app", host="0.0.0.0", port=PORT)
