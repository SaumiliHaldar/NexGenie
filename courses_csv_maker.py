import csv
import os
from pymongo import MongoClient
from dotenv import load_dotenv

# Load .env variables
load_dotenv()

# Get MongoDB credentials from .env
MONGO_URI = os.getenv("MONGO_URI")
MONGO_DB = os.getenv("MONGO_DB")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION")

# Connect to MongoDB
client = MongoClient(MONGO_URI)
db = client[MONGO_DB]
collection = db[MONGO_COLLECTION]

# Output CSV path
csv_file_path = "courses.csv"

# Read all course documents
documents = list(collection.find())
if not documents:
    print("No courses found.")
    exit()

# Gather all courses from all documents
courses = []
for doc in documents:
    if "courses" in doc and isinstance(doc["courses"], list):
        courses.extend(doc["courses"])

if not courses:
    print("No courses found in any documents.")
    exit()

print(f"Found {len(courses)} courses in the database.")

# Prepare CSV headers
headers = [
    "Name", "Description", "Category", "Level", "Price", "Estimated Price",
    "Tags", "Benefits", "Prerequisites", "Video Titles", "Video Sections",
    "Video Lengths", "Video Links"
]

# Write to CSV
with open(csv_file_path, mode="w", newline="", encoding="utf-8") as file:
    writer = csv.DictWriter(file, fieldnames=headers)
    writer.writeheader()

    for course in courses:
        print(f"Writing course: {course.get('name')}")

        # Extract data
        name = course.get("name", "")
        description = course.get("description", "")
        category = course.get("categories", "")
        level = course.get("level", "")
        price = course.get("price", 0)
        estimated_price = course.get("estimatedPrice", 0)
        tags = ", ".join(course.get("tags", []))

        benefits = " | ".join(b.get("title", "") for b in course.get("benefits", []))
        prerequisites = " | ".join(p.get("title", "") for p in course.get("prerequisites", []))

        video_titles = []
        video_sections = []
        video_lengths = []
        video_links = []

        for video in course.get("courseData", []):
            video_titles.append(video.get("title", ""))
            video_sections.append(video.get("videoSection", ""))
            video_lengths.append(str(video.get("videoLength", 0)))
            links = [link.get("url", "") for link in video.get("links", [])]
            video_links.append(" & ".join(links))

        row = {
            "Name": name,
            "Description": description,
            "Category": category,
            "Level": level,
            "Price": price,
            "Estimated Price": estimated_price,
            "Tags": tags,
            "Benefits": benefits,
            "Prerequisites": prerequisites,
            "Video Titles": " | ".join(video_titles),
            "Video Sections": " | ".join(video_sections),
            "Video Lengths": " | ".join(video_lengths),
            "Video Links": " | ".join(video_links),
        }

        writer.writerow(row)

print(f"✅ CSV file created successfully: {csv_file_path}")
