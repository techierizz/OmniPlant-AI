import os
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

uri = os.getenv("NEO4J_URI")
user = os.getenv("NEO4J_USERNAME")
password = os.getenv("NEO4J_PASSWORD")

try:
    print(f"Connecting to {uri} as {user}...")
    driver = GraphDatabase.driver(uri, auth=(user, password))
    driver.verify_connectivity()
    print("SUCCESS: Connected to Neo4j AuraDB.")
    driver.close()
except Exception as e:
    print(f"FAILED: Could not connect to Neo4j. Error: {e}")
