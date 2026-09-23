#!/usr/bin/env python3
"""Seed the :3050 Riley demo with content that shows off the embedding map and the duplicates list (Agent J).

Adds a collection "Demo: map + duplicates" with:
  - a tight cluster of 6 shipping-delay questions (to form a visible group on /data-studio/embedding-map), and
  - 1 question with 3 near-duplicates (monthly recurring revenue by plan), for /monitor/related-questions.
Idempotent: skips cards whose name already exists in that collection. Then triggers Riley's duplicates backfill.

  python3 hackathon/deck/demo/seed-riley-demo.py [--port 3050] [--dir riley-duplicates/local/demo-northwind-pg]
"""
import argparse, json, os, time, urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--port", default="3050")
ap.add_argument("--dir", default=os.path.join(os.path.dirname(__file__), "../../../..", "riley-duplicates/local/demo-northwind-pg"))
args = ap.parse_args()
BASE = f"http://localhost:{args.port}"
DIR = os.path.abspath(args.dir)

def call(method, path, body=None, session=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", **({"X-Metabase-Session": session} if session else {})})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None

pw = open(os.path.join(DIR, ".admin-password")).read().strip()
S = call("POST", "/api/session", {"username": "demo-admin@example.com", "password": pw})["id"]
manifest = json.load(open(os.path.join(DIR, "manifest.json")))
db = manifest["databaseId"]
tid = lambda ref: manifest["entities"][ref]["id"]

COLL = "Demo: map + duplicates"
colls = [c for c in call("GET", "/api/collection", session=S) if c.get("name") == COLL and not c.get("archived")]
coll = colls[0] if colls else call("POST", "/api/collection", {"name": COLL, "description": "Seeded for the Riley demo (semantic duplicates + embedding map)."}, session=S)
existing = {i["name"] for i in call("GET", f"/api/collection/{coll['id']}/items?models=card", session=S)["data"]}

shipments, subs = tid("table/fct-shipments"), tid("table/fct-subscriptions")
CARDS = [
    # the cluster: same topic, different angles
    ("Late deliveries by carrier", "Share of shipments delivered after the promised date, per carrier.", shipments),
    ("Average delivery delay by region", "Mean days between promised and actual delivery, by destination region.", shipments),
    ("Shipments delivered late last week", "List of last week's shipments that arrived after their promised delivery date.", shipments),
    ("On-time delivery rate over time", "Weekly percentage of shipments delivered on or before the promised date.", shipments),
    ("Carrier delay breakdown", "Delivery delays split by carrier and delay bucket (1 day, 2-3 days, 4+ days).", shipments),
    ("Delayed shipments by warehouse", "Count of late shipments by the warehouse they left from.", shipments),
    # one question and its near-duplicates
    ("Monthly recurring revenue by plan", "Total MRR per month from active subscriptions, broken down by plan.", subs),
    ("MRR by subscription plan", "Monthly recurring revenue from active subscriptions, split by plan.", subs),
    ("Monthly recurring revenue per plan (copy)", "Total MRR per month from active subscriptions, broken down by plan.", subs),
    ("Recurring revenue each month by plan", "Sum of monthly subscription revenue for active subscriptions, per plan.", subs),
]
created = 0
for name, desc, table in CARDS:
    if name in existing:
        continue
    call("POST", "/api/card", {"name": name, "description": desc, "collection_id": coll["id"], "display": "table",
                               "type": "question", "visualization_settings": {},
                               "dataset_query": {"database": db, "type": "query", "query": {"source-table": table}}}, session=S)
    created += 1
print(f"collection {coll['id']} '{COLL}': created {created} cards, {len(CARDS) - created} already there")

# wait for the semantic index to include them, then rebuild the duplicate pairs
for _ in range(60):
    st = call("GET", "/api/ee/semantic-search/status", session=S)
    if st.get("total_est") and st["indexed_count"] >= st["total_est"]:
        break
    time.sleep(3)
print("index:", st)
call("POST", "/api/ee/semantic-search/related-questions/backfill", session=S)
for _ in range(100):
    bf = call("GET", "/api/ee/semantic-search/related-questions/status", session=S)
    if bf["state"] not in ("pending", "queued", "running"):
        break
    time.sleep(3)
print("backfill:", {k: bf.get(k) for k in ("state", "processed_questions", "pair_count", "last_error")})
page = call("GET", "/api/ee/semantic-search/related-questions?limit=200", session=S)
for row in page["data"]:
    print(" ", row["question"]["name"], "->", [r["name"] for r in row["related_questions"]])
