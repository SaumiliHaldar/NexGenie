# courses_csv_maker.py
import os, io, csv
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION")

def get_courses_list():
    """Fetch all courses from Mongo and return a list of flattened dicts."""
    client = MongoClient(MONGO_URI)
    db = client[MONGO_DB]
    coll = db[MONGO_COLLECTION]

    docs = list(coll.find())
    courses = []
    for doc in docs:
        # lowercase keys for consistency
        d = {k.lower():v for k,v in doc.items()}
        row = {
            "Name": d.get("name",""),
            "Description": d.get("description",""),
            "Category": d.get("categories",""),
            "Level": d.get("level",""),
            "Price": d.get("price",0),
            "Estimated Price": d.get("estimatedprice",0),
            "Tags": ", ".join(d.get("tags",[])),
            "Benefits": " | ".join(b.get("title","") for b in d.get("benefits",[])),
            "Prerequisites": " | ".join(p.get("title","") for p in d.get("prerequisites",[])),
            "Video Titles": " | ".join(v.get("title","") for v in d.get("coursedata",[])),
            "Video Sections": " | ".join(v.get("videosection","") for v in d.get("coursedata",[])),
            "Video Lengths": " | ".join(str(v.get("videolength",0)) for v in d.get("coursedata",[])),
            "Video Links": " | ".join(
                " & ".join(link.get("url","") for link in v.get("links",[]))
                for v in d.get("coursedata",[])
            )
        }
        courses.append(row)
        
    # print(courses)
    return courses