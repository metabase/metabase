"""Classify transcript chunks for agent papercuts with Jev.

usage: python3 classify.py chunks.send.jsonl scores.jsonl [limit]
Reads TYPESAFE_API_KEY from the environment or from the metabase repo's .env. Resumable.
"""
import json, os, re, sys, time, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor


def load_key():
    if os.environ.get("TYPESAFE_API_KEY"):
        return os.environ["TYPESAFE_API_KEY"]
    for line in open(os.path.expanduser("~/workspace/metabase/metabase/.env")):
        m = re.match(r"\s*(?:export\s+)?TYPESAFE_API_KEY\s*=\s*['\"]?([^'\"\s]+)", line)
        if m:
            return m.group(1)
    raise SystemExit("no TYPESAFE_API_KEY")


KEY = load_key()
IN, OUT = sys.argv[1], sys.argv[2]
LIMIT = int(sys.argv[3]) if len(sys.argv) > 3 else None

CTX = ("`transcript` is an excerpt from a coding agent's session log (Claude Code) working mostly in the Metabase "
       "Clojure/TypeScript monorepo. Lines are tagged USER, ASSISTANT, THINKING, TOOL (a call) and RESULT (its output). "
       "Ordinary iteration does not count: a compile error fixed on the next try, a test written to fail first, "
       "reading files to learn the code, or a normal CI wait.")


def q(question, yes, no):
    return {"type": "noul", "instructions": {"context": CTX, "question": question},
            "criteria": {"true": yes, "false": no}}


QUESTIONS = {
    "self_inflicted_bug": q(
        "Did the agent make a code or config change that turned out to be wrong (a bug, broken test, wrong semantics, "
        "wrong file) which the agent or the user later caught and had to fix or revert?",
        "A concrete earlier change by the agent is later found to be wrong and is corrected.",
        "No change by the agent is later found wrong, or only trivial typos."),
    "tool_misuse": q(
        "Did the agent invoke a project-specific tool, script, test runner, CLI or API incorrectly (wrong flags, wrong "
        "arguments, wrong command, unsupported usage) and have to retry or change approach?",
        "A tool or command was used the wrong way and the agent had to correct its usage.",
        "Tools were used correctly, or failures were unrelated to how the agent called them."),
    "misleading_signal": q(
        "Did a tool, test, linter, REPL, or command give output that misled the agent: reported success when something "
        "failed, stale or cached state, a passing check that proved nothing, a false-positive failure, or an error "
        "message pointing at the wrong cause?",
        "The agent drew a wrong conclusion, or nearly did, because of misleading output.",
        "Outputs were accurate and the agent read them correctly."),
    "user_correction": q(
        "Did the user correct the agent, telling it that it did something wrong, misunderstood, broke a convention, or "
        "took the wrong approach?",
        "The user pushes back on or corrects something the agent did or said.",
        "The user only gives new instructions, approvals, or questions."),
    "codebase_trap": q(
        "Was the agent tripped up by something surprising in the codebase itself: confusingly similar names, hidden side "
        "effects, undocumented invariants or conventions, misleading docstrings or comments, duplicated logic that must "
        "stay in sync, or an API whose shape invites misuse?",
        "A specific feature of the code led the agent into a mistake or significant wasted effort.",
        "The agent was not misled by the code's design."),
    "flailing": q(
        "Did the agent waste significant effort: repeated failing attempts at the same thing, going in circles, long "
        "hunts for how to do something that should be easy, or abandoning an approach after much work?",
        "Many steps are spent struggling or looping before progress or abandonment.",
        "Work proceeds fairly directly."),
    "env_friction": q(
        "Did environment or workflow tooling get in the agent's way: sandbox or permission blocks, git worktrees or "
        "branch state, stacked-branch tools, daemons, databases, ports, REPL state, dependencies, or CI mechanics?",
        "Environment or workflow tooling blocked the agent or caused a wrong conclusion.",
        "No meaningful environment or tooling friction."),
}

META = ("file", "chunk", "first_line", "last_line", "subagent")


def call(chunk):
    body = json.dumps({"model": "jev-latest", "state": {"transcript": chunk["text"]},
                       "questions": QUESTIONS}).encode()
    err = None
    for attempt in range(8):
        req = urllib.request.Request("https://api.typesafe.ai/v1/systemone", data=body,
                                     headers={"Authorization": f"Bearer {KEY}",
                                              "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                resp = json.load(r)
            return {k: chunk[k] for k in META} | {
                "scores": {k: v["noul"] for k, v in resp["answers"].items()},
                "model": resp.get("model"), "usage": resp.get("usage")}
        except urllib.error.HTTPError as e:
            err = f"{e.code} {e.read()[:300]!r}"
            if e.code in (429, 500, 502, 503, 504):
                time.sleep(float(e.headers.get("retry-after") or 2 ** attempt))
                continue
            break
        except Exception as e:
            err = repr(e)
            time.sleep(2 ** attempt)
    return {k: chunk[k] for k in META} | {"error": err}


done = set()
if os.path.exists(OUT):
    for l in open(OUT):
        r = json.loads(l)
        if "scores" in r:
            done.add((r["file"], r["chunk"]))
chunks = [c for c in map(json.loads, open(IN)) if (c["file"], c["chunk"]) not in done][:LIMIT]
print(len(chunks), "to classify", file=sys.stderr)
with open(OUT, "a") as out, ThreadPoolExecutor(16) as ex:
    for i, r in enumerate(ex.map(call, chunks)):
        out.write(json.dumps(r) + "\n")
        out.flush()
        if "error" in r:
            print("ERR", r["file"], r["chunk"], r["error"], file=sys.stderr)
        if i % 50 == 0:
            print(i, file=sys.stderr)
