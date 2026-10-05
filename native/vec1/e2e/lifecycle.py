"""Create / rename / archive / delete a card on a running e2e instance and check search follows each step."""
import time

from search import call, search, session


def hits(q, **kw):
    return [(d["model"], d["id"], d["name"]) for d in search(q, **kw)["data"]]


def rank(q, card_id, **kw):
    return next((i + 1 for i, (m, i2, _) in enumerate(hits(q, **kw)) if m == "card" and i2 == card_id), None)


def wait(label, pred, timeout=30):
    t = time.time()
    while time.time() - t < timeout:
        if pred():
            print(f"  {label}: ok after {time.time() - t:.1f}s")
            return
        time.sleep(0.5)
    print(f"  {label}: NOT within {timeout}s")


s = session()
db = next(d["id"] for d in call("GET", "/api/database", session=s)["data"] if d["is_sample"])
card = call("POST", "/api/card", {"name": "Customer churn by cohort",
                                  "description": "Share of subscribers who cancel, grouped by signup month",
                                  "display": "table", "visualization_settings": {},
                                  "dataset_query": {"type": "native", "database": db, "native": {"query": "select 1"}}},
            session=s)
cid = card["id"]
print("created card", cid)
wait("found by paraphrase", lambda: rank("clients leaving the product over time", cid) == 1)
call("PUT", f"/api/card/{cid}", {"name": "Churned accounts per signup month",
                                 "description": "Accounts that stopped paying, per month they joined"}, session=s)
wait("rename reflected", lambda: any(i == cid and n.startswith("Churned")
                                     for _, i, n in hits("customers who stopped paying")[:5]))
call("PUT", f"/api/card/{cid}", {"archived": True}, session=s)
wait("archived: hidden from normal search", lambda: rank("customers who stopped paying", cid) is None)
wait("archived: found with archived=true", lambda: rank("customers who stopped paying", cid, archived="true") == 1)
call("DELETE", f"/api/card/{cid}", session=s)
wait("deleted: gone from search", lambda: rank("customers who stopped paying", cid, archived="true") is None)
print("  note: the store row itself stays until the next startup prunes it (no delete hook; see PLAN_002 phase E)")
