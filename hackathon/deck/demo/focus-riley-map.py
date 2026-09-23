#!/usr/bin/env python3
"""Make the :3050 Riley embedding map show clearly separated clusters (Agent J).

Riley's map runs UMAP to 2D and colours with DBSCAN (eps = 4 x median nearest-neighbour distance). The ~120 golden
corpus questions form one continuous sheet, so the map comes out as a single colour. This script:
  --apply    adds 3 tight topic groups (HR attrition, support tickets, ad spend; 6 questions each) to the
             "Demo: map + duplicates" collection, and ARCHIVES every other indexed question except the demo ones
             and the 8 cross-lingual duplicates (unless --drop-crosslingual). Archived ids go to archived.json.
  --restore  unarchives everything recorded in archived.json.
Then it rebuilds Riley's duplicate pairs. Needs seed-riley-demo.py to have run first.
Offline replay of Riley's UMAP+DBSCAN on the real vectors: 5 clusters (shipping 6, HR 6, support 6, MRR 4, and ads 6
plus the 8 cross-lingual questions) vs 1 cluster for the full corpus.
"""
import argparse, json, os, time, urllib.request

ap = argparse.ArgumentParser()
g = ap.add_mutually_exclusive_group(required=True)
g.add_argument("--apply", action="store_true")
g.add_argument("--restore", action="store_true")
ap.add_argument("--drop-crosslingual", action="store_true", help="also archive the 8 cross-lingual duplicates (cleaner map)")
ap.add_argument("--port", default="3050")
ap.add_argument("--dir", default=os.path.join(os.path.dirname(__file__), "../../../..", "riley-duplicates/local/demo-northwind-pg"))
args = ap.parse_args()
BASE, DIR = f"http://localhost:{args.port}", os.path.abspath(args.dir)
STATE = os.path.join(DIR, "archived.json")

def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", **({"X-Metabase-Session": S} if S else {})})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
        return json.loads(raw) if raw else None

S = None
S = call("POST", "/api/session", {"username": "demo-admin@example.com",
                                  "password": open(os.path.join(DIR, ".admin-password")).read().strip()})["id"]
manifest = json.load(open(os.path.join(DIR, "manifest.json")))
tid = lambda ref: manifest["entities"][ref]["id"]

def rebuild_pairs():
    for _ in range(3):
        time.sleep(15)  # let the indexer embed the changes before the backfill's catch-up check
        call("POST", "/api/ee/semantic-search/related-questions/backfill")
        for _ in range(100):
            bf = call("GET", "/api/ee/semantic-search/related-questions/status")
            if bf["state"] not in ("pending", "queued", "running"):
                break
            time.sleep(3)
        if bf["state"] == "succeeded":
            break
    print("backfill:", {k: bf.get(k) for k in ("state", "processed_questions", "pair_count", "last_error")})

if args.restore:
    ids = json.load(open(STATE))
    for i in ids:
        call("PUT", f"/api/card/{i}", {"archived": False})
    print(f"unarchived {len(ids)} cards")
    os.remove(STATE)
    rebuild_pairs()
    raise SystemExit

COLL = "Demo: map + duplicates"
coll = next(c for c in call("GET", "/api/collection") if c.get("name") == COLL and not c.get("archived"))
existing = {i["name"] for i in call("GET", f"/api/collection/{coll['id']}/items?models=card")["data"]}
TOPICS = [
    ("table/hr-terminations", [
        ("Employee attrition by department", "Share of employees who left in the last 12 months, by department."),
        ("Voluntary resignations per quarter", "Number of employees who resigned voluntarily each quarter."),
        ("Staff turnover rate trend", "Monthly employee turnover rate across the company."),
        ("Headcount leavers by tenure", "Employees who left, grouped by how long they had worked here."),
        ("Exit reasons from leaving employees", "Most common reasons given in exit interviews."),
        ("Retention rate of new hires", "Share of employees still employed one year after joining.")]),
    ("table/fct-support-tickets", [
        ("Support tickets opened per day", "Daily count of new customer support tickets."),
        ("Average first response time for tickets", "Mean time until a support agent first replies to a ticket."),
        ("Open support tickets by priority", "Currently open tickets, broken down by priority level."),
        ("Ticket resolution time by agent", "Median hours to resolve a support ticket, per agent."),
        ("Customer satisfaction after support", "CSAT score from surveys sent after a ticket is closed."),
        ("Support backlog over time", "Number of unresolved tickets at the end of each day.")]),
    ("table/fct-marketing-spend", [
        ("Ad spend by campaign", "Total advertising spend per marketing campaign."),
        ("Cost per click on paid search", "Average CPC for paid search ads, by week."),
        ("Return on ad spend by channel", "Revenue attributed to ads divided by ad spend, per channel."),
        ("Paid social impressions and clicks", "Impressions and clicks from paid social campaigns."),
        ("Marketing budget used vs planned", "Actual marketing spend compared with the monthly budget."),
        ("Cost per acquisition from ads", "Ad spend divided by customers acquired through ads.")]),
]
created = 0
for table_ref, qs in TOPICS:
    for name, desc in qs:
        if name in existing:
            continue
        call("POST", "/api/card", {"name": name, "description": desc, "collection_id": coll["id"], "display": "table",
                                   "type": "question", "visualization_settings": {},
                                   "dataset_query": {"database": manifest["databaseId"], "type": "query",
                                                     "query": {"source-table": tid(table_ref)}}})
        created += 1
print(f"created {created} topic questions")

keep_names = {"Customer acquisition cost by channel", "Koszt pozyskania klienta", "Average review rating by product",
              "商品レビュー平均評価", "Zwroty według kategorii produktu", "カテゴリ別返品率", "Nowi klienci miesięcznie",
              "新規顧客数の推移"} if not args.drop_crosslingual else set()
already = json.load(open(STATE)) if os.path.exists(STATE) else []
to_archive = []
for ref, e in manifest["entities"].items():
    if e["model"] != "card":  # only saved questions are on the map
        continue
    card = call("GET", f"/api/card/{e['id']}")
    if card.get("archived") or card["name"] in keep_names or card.get("collection_id") == coll["id"]:
        continue
    to_archive.append(e["id"])
for i in to_archive:
    call("PUT", f"/api/card/{i}", {"archived": True})
json.dump(sorted(set(already + to_archive)), open(STATE, "w"))
print(f"archived {len(to_archive)} corpus questions (ids in {STATE}; undo with --restore)")
rebuild_pairs()
