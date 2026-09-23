import importlib.util
import io
import subprocess
import tempfile
import threading
import unittest
import unittest.mock
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


class ServerCase(unittest.TestCase):
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


class AssessAgainstServerTest(ServerCase):
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


def fixed(**changes):
    return {"outcome": "fixed", "title": "Copy kondo configs before linting", "problem": "`mage kondo` skips it.",
            "solution": "It copies them first.", "how_to_verify": "Run `./bin/mage kondo`.",
            "tests": ["mage.kondo-test/copies-configs"], "tests_passed": True, "reason": ""} | changes


class FakeLinear:
    def __init__(self, fail=False):
        self.fail, self.issues, self.comments = fail, [], []

    def create_issue(self, title, description, marker):
        if self.fail:
            raise dispatcher.DispatchError("Linear: 500")
        self.issues.append((title, marker))
        return {"id": "uuid", "identifier": f"BOT-{len(self.issues)}", "url": f"https://linear.app/BOT-{len(self.issues)}"}

    def comment(self, issue_id, body):
        self.comments.append((issue_id, body))


class FakeFixer(dispatcher.Fixer):
    """The real git steps against a local bare origin; the agent and `gh` are stand-ins."""

    def __init__(self, repo, worktrees, result=None, edit=True):
        super().__init__(repo, worktrees)
        self.result, self.edit, self.messages = result, edit, []

    def launch(self, worktree, message, log_path):
        self.messages.append(message)
        if self.edit:
            (Path(worktree) / "fix.txt").write_text("fixed\n")
            (Path(worktree) / ".claude").mkdir(exist_ok=True)
            (Path(worktree) / ".claude" / "local.json").write_text("{}\n")
        return None if self.result is None else {"type": "result", "total_cost_usd": 1.25, "structured_output": self.result}

    def open_pr(self, worktree, branch, title, body):
        dispatcher.run(["git", "push", "-q", "-u", "origin", branch], worktree)
        self.pr_body = body
        return "https://github.com/metabase/metabase/pull/1"


def git(*args, cwd):
    return subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


class DispatchTest(ServerCase):
    def setUp(self):
        super().setUp()
        root = Path(self.temp.name)
        self.origin, self.repo, self.worktrees = root / "origin.git", root / "repo", root / "worktrees"
        git("init", "-q", "--bare", "-b", "master", str(self.origin), cwd=root)
        git("clone", "-q", str(self.origin), str(self.repo), cwd=root)
        for key, value in (("user.name", "Test"), ("user.email", "test@example.com"), ("commit.gpgsign", "false")):
            git("config", key, value, cwd=self.repo)
        (self.repo / "README.md").write_text("repo\n")
        git("add", "README.md", cwd=self.repo)
        git("commit", "-q", "-m", "initial", cwd=self.repo)
        git("push", "-q", "origin", "master", cwd=self.repo)

    def ready(self, title="Kondo skips config copy", evidence_score=0.5):
        papercut_id = self.report(title, severity="high", description=f"{title} in mage/src/mage/kondo.clj")["papercut"]["id"]
        self.store.assess(papercut_id, {"verdict": "ready", "evidence_score": evidence_score, "reason": "Local change"})
        return papercut_id

    def dispatch(self, result=None, linear=None, edit=True, **options):
        self.linear = linear or FakeLinear()
        self.fixer = FakeFixer(self.repo, self.worktrees, result, edit)
        runner = dispatcher.Dispatcher(self.client, self.linear, self.fixer, Path(self.temp.name) / "runs", io.StringIO())
        return runner.dispatch(live=True, **options)

    def test_fixed_papercut_gets_an_issue_a_pushed_branch_and_a_draft_pr(self):
        papercut_id = self.ready()
        [dispatch] = self.dispatch(fixed())
        branch = "bot-1-papercut-kondo-skips-config-copy"
        self.assertEqual((dispatch["state"], dispatch["pr_url"], dispatch["branch"], dispatch["linear_issue_id"],
                          dispatch["cost_usd"]),
                         ("pr_opened", "https://github.com/metabase/metabase/pull/1", branch, "BOT-1", 1.25))
        self.assertEqual(self.store.get_papercut(papercut_id)["status"], "investigating")
        self.assertEqual(git("log", "--format=%s", f"master..{branch}", cwd=self.origin), "Copy kondo configs before linting")
        self.assertEqual(git("show", "--name-only", "--format=", branch, cwd=self.origin), "fix.txt")
        self.assertFalse(any(self.worktrees.iterdir()))
        self.assertIn("### How to verify\n\nRun `./bin/mage kondo`.", self.fixer.pr_body)
        self.assertNotIn("BOT-1", self.fixer.pr_body)
        self.assertIn("kondo.clj", self.fixer.messages[0])
        self.assertIn("pull/1", self.linear.comments[-1][1])

    def test_outcomes_hand_the_papercut_back(self):
        cases = {
            "already_fixed": (fixed(outcome="already_fixed", reason="Fixed in abc123"), False, "resolved", False),
            "not_reproducible": (fixed(outcome="not_reproducible", reason="Not found"), False, "open", False),
            "needs_human": (fixed(tests_passed=False), True, "open", True),
            "failed": (None, True, "open", True),
        }
        for index, (state, (result, edit, status, kept)) in enumerate(cases.items()):
            with self.subTest(state):
                papercut_id = self.ready(f"Trap {index}")
                [dispatch] = self.dispatch(result, edit=edit)
                self.assertEqual(dispatch["state"], state)
                self.assertEqual(self.store.get_papercut(papercut_id)["status"], status)
                self.assertEqual(any(self.worktrees.iterdir()), kept)
                self.assertEqual(git("branch", "--list", "bot-*", cwd=self.origin), "")
                for worktree in self.worktrees.iterdir():
                    dispatcher.run(["git", "worktree", "remove", "--force", str(worktree)], self.repo)

    def test_linear_failure_fails_the_dispatch_before_any_worktree(self):
        papercut_id = self.ready()
        [dispatch] = self.dispatch(fixed(), linear=FakeLinear(fail=True))
        self.assertEqual((dispatch["state"], dispatch["linear_issue_id"]), ("failed", None))
        self.assertEqual(self.store.get_papercut(papercut_id)["status"], "open")
        self.assertFalse(self.worktrees.exists())

    def test_interrupted_dispatch_resumes_without_a_second_issue(self):
        papercut_id = self.ready()
        claimed = self.store.claim(papercut_id, {"actor": dispatcher.ACTOR})
        self.store.update_dispatch(claimed["id"], {"state": "linear_created", "linear_issue_id": "BOT-9",
                                                   "linear_url": "https://linear.app/BOT-9"})
        [dispatch] = self.dispatch(fixed(), limit=0)
        self.assertEqual((dispatch["id"], dispatch["state"], dispatch["branch"]),
                         (claimed["id"], "pr_opened", "bot-9-papercut-kondo-skips-config-copy"))
        self.assertEqual(self.linear.issues, [])

    def test_limit_takes_the_strongest_evidence_first(self):
        self.ready("Weaker trap", evidence_score=0.3)
        strong_id = self.ready("Stronger trap", evidence_score=0.9)
        [dispatch] = self.dispatch(fixed(), limit=1)
        self.assertEqual(dispatch["papercut_id"], strong_id)

    def test_dry_run_claims_nothing(self):
        papercut_id = self.ready()
        out = io.StringIO()
        runner = dispatcher.Dispatcher(self.client, None, None, Path(self.temp.name) / "runs", out)
        self.assertEqual(runner.dispatch(), [])
        self.assertEqual(self.store.get_papercut(papercut_id)["dispatches"], [])
        self.assertIn(f"would dispatch #{papercut_id}", out.getvalue())
        self.assertTrue((Path(self.temp.name) / "runs" / f"dry-run-{papercut_id}.md").exists())


class HelpersTest(unittest.TestCase):
    def test_fixer_env_drops_session_credentials_and_settings(self):
        env = {"PATH": "/bin", "CLAUDECODE": "1", "ANTHROPIC_BASE_URL": "x", "LINEAR_API_KEY": "k",
               "TYPESAFE_API_KEY": "k", "MB_DB_TYPE": "postgres", "PAPERCUTS_TOKEN": "t", "HOME": "/h"}
        with unittest.mock.patch.dict(dispatcher.os.environ, env, clear=True):
            self.assertEqual(dispatcher.fixer_env(), {"PATH": "/bin", "HOME": "/h"})

    def test_slug_keeps_whole_words(self):
        self.assertEqual(dispatcher.slug("`mage kondo` skips the cache copy, sometimes!", 20), "mage-kondo-skips-the")


if __name__ == "__main__":
    unittest.main()
