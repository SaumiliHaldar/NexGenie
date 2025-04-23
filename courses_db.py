import json
from pymongo import MongoClient

# Connect to local MongoDB
client = MongoClient('mongodb://localhost:27017/')

# Create or access the database and collection
db = client['courseDB']
collection = db['courses']

# Load JSON data
with open('courses.json', 'r', encoding='utf-8') as file:
    course_data = json.load(file)

# Ensure it's always a list
if not isinstance(course_data, list):
    course_data = [course_data]

inserted_count = 0
skipped_count = 0

for course in course_data:
    course_name = course.get("name")

    # Skip if course name already exists
    if collection.find_one({"name": course_name}):
        skipped_count += 1
        continue

    collection.insert_one(course)
    inserted_count += 1

print(f"✅ Inserted {inserted_count} new course(s). Skipped {skipped_count} duplicate(s).")