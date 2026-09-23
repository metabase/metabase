"""The Metabot path end to end: a finding in pa_events goes through send.ts to Chris's server, and triage writes its issue.

Everything is throwaway: a scratch Postgres database, the server on a free port with a temp SQLite file, and copies of
send.ts and triage.ts in a temp directory with their own .env and issues/. An HTTP stub stands in for the triage LLM.
Run with `make test`.
"""

import hashlib
import http.server
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import threading
import unittest
import uuid
from pathlib import Path


HERE = Path(__file__).parent
METABASE_REPO = os.environ.get("METABASE_REPO") or Path.home() / "src/mb/metabase"
spec = importlib.util.spec_from_file_location("papercut_server", HERE.parent / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

VERDICT = {"genuine": True, "title": "search reports a failed search as success", "severity": "high",
           "category": "silent_tool_failure", "what_happened": "Search failed and returned success-shaped output.",
           "likely_cause": "do-search in src/metabase/metabot/tools/search.clj catches the exception.",
           "suggested_fix": "Let the exception reach the agent loop.", "evidence": ["synthetic finding"]}


def psql(sql, db="papercuts"):
    subprocess.run(["docker", "exec", "-i", "papercuts-pg", "psql", "-q", "-U", "papercuts", "-d", db,
                    "-v", "ON_ERROR_STOP=1"], input=sql, text=True, capture_output=True, check=True)


class FakeLLM(http.server.BaseHTTPRequestHandler):
    """An OpenAI-compatible chat completions endpoint that always calls the triage tool with VERDICT."""

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        call = {"function": {"name": "report_triage", "arguments": json.dumps(VERDICT)}}
        body = json.dumps({"model": "fake", "usage": {"completion_tokens": 1},
                           "choices": [{"finish_reason": "tool_calls", "message": {"tool_calls": [call]}}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


class MetabotPathTest(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.dir = Path(temp.name)
        db = f"papercuts_test_{uuid.uuid4().hex[:8]}"
        psql(f"create database {db}")
        self.addCleanup(psql, f"drop database {db} with (force)")
        psql((HERE / "schema.sql").read_text(), db)
        self.db = db
        self.store = server.Store(self.dir / "papercuts.sqlite3")
        handler = type("TestHandler", (server.Handler,), {"store": self.store, "token": None, "log_message": lambda *a: None})
        urls = []
        for handler_class in (handler, FakeLLM):
            httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), handler_class)
            threading.Thread(target=httpd.serve_forever, daemon=True).start()
            self.addCleanup(httpd.server_close)
            self.addCleanup(httpd.shutdown)
            urls.append(f"http://127.0.0.1:{httpd.server_port}")
        for script in ("send.ts", "triage.ts"):
            shutil.copy(HERE / script, self.dir)
        (self.dir / "issues").mkdir()
        # ANTHROPIC_API_KEY is blanked because triage prefers it over LLM_BASE_URL.
        (self.dir / ".env").write_text(f"PAPERCUTS_DB=postgresql://papercuts:papercuts@localhost:5433/{db}\n"
                                       f"PAPERCUTS_SERVER={urls[0]}\nLLM_BASE_URL={urls[1]}\nLLM_API_KEY=test\n"
                                       "ANTHROPIC_API_KEY=\n")

    def bun(self, script):
        env = {k: v for k, v in os.environ.items() if not k.startswith(("ANTHROPIC_", "LLM_", "PAPERCUTS_", "MB_"))}
        result = subprocess.run(["bun", script], cwd=self.dir, env=env, capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def test_finding_reaches_the_server_once_and_triage_writes_the_issue(self):
        session = str(uuid.uuid4())
        tool_call = {"session_id": session, "request_id": "turn", "duration_ms": 1200, "result": "success",
                     "event_details": {"tool_name": "search", "step": 1}}
        review = {"session_id": session, "request_id": "review", "duration_ms": 900, "result": "papercut",
                  "event_details": {"message_id": 424242, "tool": "search", "signals": "silent_failure",
                                    "category": "silent_tool_failure", "confidence": 0.9, "reviewed_by": "model"}}
        psql("insert into pa_events (created_at, event_name, event_data, raw) values "
             f"('2026-01-01 12:00:00+00', 'ai_service_event.agent_used_tool', '{json.dumps(tool_call)}', '{{}}'), "
             f"('2026-01-01 12:00:10+00', 'ai_service_event.agent_turn_reviewed', '{json.dumps(review)}', '{{}}')", self.db)

        self.bun("send.ts")
        self.assertIn(" 200 ", self.bun("send.ts"))

        fingerprint = hashlib.md5(b"ai_service_event.agent_turn_reviewed|search||silent_failure").hexdigest()[:12]
        [papercut] = self.store.list_papercuts()["papercuts"]
        self.assertEqual((papercut["fingerprints"], papercut["report_count"]), ([f"metabot:{fingerprint}"], 1))
        report = self.store.get_papercut(papercut["id"])["reports"][0]
        self.assertEqual({key: report[key] for key in ("repository", "reporter", "agent", "session", "report_id",
                                                        "submitted_category", "title", "path", "area", "cost_minutes",
                                                        "source_type", "source_ref", "observed_at")}, {
            "repository": "metabase",
            "reporter": "andreis.metabot",
            "agent": "metabot",
            "session": session,
            "report_id": f"metabot:{session}:review:message-424242",
            "submitted_category": "agent-trap",
            "title": "Metabot turn review flags silent failure in search",
            "path": "src/metabase/metabot/tools/search.clj",
            "area": "metabot/search",
            "cost_minutes": 0.02,
            "source_type": "metabot-turn-review",
            "source_ref": f"http://localhost:3000/monitor/ai-auditing/conversations/{session}",
            "observed_at": "2026-01-01T12:00:10+00:00",
        })
        self.assertIn("## Links\n\n- Conversation: http://localhost:3000/monitor/ai-auditing/conversations/", report["description"])
        self.assertEqual(report["payload"]["details"]["triage_fingerprint"], fingerprint)
        head = [subprocess.run(["git", "-C", METABASE_REPO, "rev-parse", *args, "HEAD"], capture_output=True,
                               text=True, check=True).stdout.strip() for args in (["--abbrev-ref"], [])]
        self.assertEqual([report["branch"], report["commit_sha"]], head)
        self.assertIsInstance(report["payload"]["details"]["dirty"], bool)

        self.bun("triage.ts")
        issue = (self.dir / "issues" / f"{fingerprint}.md").read_text()
        self.assertTrue(issue.startswith(f"# {VERDICT['title']}\n"), issue)
        self.assertIn(f"Fingerprint `{fingerprint}`", issue)


class ResetTest(unittest.TestCase):
    """`make reset` runs reset-metabot.sql on the local server's database."""

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / "papercuts.sqlite3"
        self.store = server.Store(self.path)

    def report(self, reporter, fingerprint):
        return self.store.ingest({"repository": "metabase", "reporter": reporter, "report_id": str(uuid.uuid4()),
                                  "title": "search tool swallows errors", "fingerprint": fingerprint})

    def test_removes_only_metabot_papercuts_so_the_next_finding_is_a_new_one(self):
        metabot = self.report("andreis.metabot", "metabot:abc")["papercut"]["id"]
        other = self.report("chris", "papercut:x")["papercut"]["id"]
        self.store.comment(metabot, {"author": "andrei", "body": "/pr"})
        self.assertTrue(self.store.get_papercut(other)["related"])
        with open(HERE / "reset-metabot.sql") as sql:
            subprocess.run(["sqlite3", self.path], stdin=sql, capture_output=True, check=True)
        [kept] = self.store.list_papercuts()["papercuts"]
        self.assertEqual((kept["id"], kept["report_count"], self.store.get_papercut(other)["related"]), (other, 1, []))
        self.assertTrue(self.report("andreis.metabot", "metabot:abc")["created"])


if __name__ == "__main__":
    unittest.main()
