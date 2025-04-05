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

# Insert data (assumes it's a list of courses)
if isinstance(course_data, list):
    result = collection.insert_many(course_data)
    print(f"Inserted {len(result.inserted_ids)} documents.")
else:
    result = collection.insert_one(course_data)
    print("Inserted 1 document.")
