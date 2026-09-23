import importlib.util
import io
import tempfile
import threading
import unittest
from pathlib import Path


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


server = load("papercut_server", "server.py")
dispatcher = load("papercut_dispatcher", "dispatcher.py")
T = dispatcher.THRESHOLDS


def papercut(**changes):
    return {"id": 1, "title": "Trap", "description": "mage kondo skips the cache copy", "area": "", "path": "",
            "status": "open", "merged_into": None, "owner": "repo-tooling", "severity": None, "report_count": 3,
            "reporter_count": 1, "cost_minutes": 0, "reports": [], "dispatches": []} | changes


def answers(level=3, confidence=0.9, actionable=0.9, plausible=0.9, owner=None, owner_confidence=0.9):
    probabilities = {str(index): (1.0 if index == level else 0.0) for index in range(4)}
    result = {"fixability": {"score": float(level), "confidence": confidence, "probabilities": probabilities},
              "actionable": {"noul": actionable}, "still_plausible": {"noul": plausible}}
    if owner:
        result["owner"] = {"choice": owner, "confidence": owner_confidence}
    return {"model": "jev-test", "answers": result}


class FakeJev:
    def __init__(self, response=None):
        self.response, self.calls = response or answers(), []

    def __call__(self, state, questions):
        self.calls.append((state, questions))
        return self.response


class EvidenceTest(unittest.TestCase):
    def test_any_rule_passes_evidence(self):
        cases = {
            ("reporters",): papercut(report_count=2, reporter_count=2),
            ("reports",): papercut(report_count=3),
            ("cost",): papercut(report_count=1, cost_minutes=60),
            ("severity",): papercut(report_count=1, severity="high"),
            (): papercut(report_count=2, severity="medium", cost_minutes=59),
        }
        for expected, case in cases.items():
            self.assertEqual(tuple(dispatcher.evidence(case, T)[0]), expected)

    def test_evidence_score_ranks_stronger_papercuts_higher(self):
        weak = dispatcher.evidence(papercut(report_count=1), T)[1]
        strong = dispatcher.evidence(papercut(report_count=5, reporter_count=3, cost_minutes=90, severity="high"), T)[1]
        self.assertLess(weak, strong)
        self.assertEqual(strong, 1.0)


class DecideTest(unittest.TestCase):
    def test_ready_when_evidence_fixability_and_actionability_pass(self):
        jev = FakeJev()
        result = dispatcher.decide(papercut(), T, jev)
        self.assertEqual((result["verdict"], result["model"], result["fixability_confidence"]), ("ready", "jev-test", 0.9))
        self.assertNotIn("owner", jev.calls[0][1])

    def test_closed_or_merged_papercuts_are_not_candidates(self):
        for case in (papercut(status="resolved"), papercut(status="investigating"), papercut(merged_into=2)):
            self.assertIsNone(dispatcher.decide(case, T, FakeJev()))

    def test_code_gates_decide_without_jev(self):
        cases = {
            "Dispatch 7 is in progress": papercut(dispatches=[{"id": 7, "state": "running"}]),
            "Owner is harness": papercut(owner="harness"),
            "Not enough evidence": papercut(report_count=1),
        }
        for reason, case in cases.items():
            jev = FakeJev()
            result = dispatcher.decide(case, T, jev)
            self.assertEqual(result["verdict"], "not_ready")
            self.assertIn(reason, result["reason"])
            self.assertEqual(jev.calls, [])

    def test_jev_verdicts(self):
        cases = {
            "needs_human": answers(confidence=0.5),
            "not_ready": answers(level=1),
        }
        for verdict, response in cases.items():
            self.assertEqual(dispatcher.decide(papercut(), T, FakeJev(response))["verdict"], verdict)
        for response in (answers(actionable=0.4), answers(plausible=0.2)):
            self.assertEqual(dispatcher.decide(papercut(), T, FakeJev(response))["verdict"], "not_ready")

    def test_missing_owner_is_asked_of_jev(self):
        cases = {
            "ready": answers(owner="repo-code"),
            "not_ready": answers(owner="third-party"),
            "needs_human": answers(owner="repo-code", owner_confidence=0.4),
        }
        for verdict, response in cases.items():
            jev = FakeJev(response)
            result = dispatcher.decide(papercut(owner=None), T, jev)
            self.assertEqual(result["verdict"], verdict)
            self.assertIn("owner", jev.calls[0][1])
            self.assertEqual(result["inputs"]["owner_guess"]["owner"], response["answers"]["owner"]["choice"])

    def test_state_holds_distinct_report_excerpts(self):
        reports = [{"description": text} for text in ("mage kondo skips the cache copy", "seen again", "seen again",
                                                        "third", "fourth", "fifth")]
        state = dispatcher.jev_state(papercut(reports=reports, area="mage"))
        self.assertEqual((state["reports"], state["location"]), (["seen again", "third", "fourth"], "mage"))


class AssessAgainstServerTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.Store(Path(self.temp.name) / "papercuts.sqlite3")
        handler = type("TestHandler", (server.Handler,),
                       {"store": self.store, "token": None, "log_message": lambda *args: None})
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.client = dispatcher.Server(f"http://127.0.0.1:{self.httpd.server_port}")
        self.counter = 0

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.temp.cleanup()

    def report(self, title, **changes):
        self.counter += 1
        return self.store.ingest({"repository": "metabase", "reporter": "laptop", "report_id": f"r{self.counter}",
                                  "title": title, "fingerprint": title, "owner": "repo-code", **changes})

    def assess(self, jev, **options):
        return dispatcher.assess(self.client, jev, T, out=io.StringIO(), **options)

    def test_records_verdicts_and_resumes_from_the_cursor(self):
        for _ in range(3):
            ready_id = self.report("Ready trap")["papercut"]["id"]
        thin_id = self.report("Thin trap")["papercut"]["id"]
        closed_id = self.report("Closed trap", severity="high")["papercut"]["id"]
        self.store.update_papercut(closed_id, {"status": "wontfix"})
        jev = FakeJev()

        cursor = self.assess(jev)
        verdicts = {i: (self.store.get_papercut(i)["assessment"] or {}).get("verdict")
                    for i in (ready_id, thin_id, closed_id)}
        self.assertEqual(verdicts, {ready_id: "ready", thin_id: "not_ready", closed_id: None})
        self.assertEqual(len(jev.calls), 1)
        self.assertIn("+00:00", cursor)

        self.assertGreater(self.assess(jev, since=cursor), cursor)
        self.assertEqual(len(jev.calls), 1)
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM assessments").fetchone()[0], 2)

        self.report("Thin trap", severity="high")
        self.assess(jev, since=cursor)
        self.assertEqual(self.store.get_papercut(thin_id)["assessment"]["verdict"], "ready")
        self.assertEqual(len(jev.calls), 2)

    def test_dry_run_records_nothing(self):
        papercut_id = self.report("Trap", severity="high")["papercut"]["id"]
        self.assess(FakeJev(), dry_run=True)
        self.assertIsNone(self.store.get_papercut(papercut_id)["assessment"])

    def test_jev_failure_keeps_the_cursor(self):
        self.report("Trap", severity="high")

        def failing(state, questions):
            raise dispatcher.JevError("403 blocked")

        self.assertIsNone(self.assess(failing))


if __name__ == "__main__":
    unittest.main()
