import http.client
import importlib.util
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


spec = importlib.util.spec_from_file_location("papercut_server", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class StoreCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.Store(Path(self.temp.name) / "papercuts.sqlite3")
        self.sample = {
            "repository": "metabase",
            "reporter": "laptop-1",
            "report_id": "report-1",
            "title": "Agent misses hidden build step",
            "description": "Mage must run before tests",
            "path": "mage/src/mage/build.clj",
        }
        self.counter = 0

    def tearDown(self):
        self.temp.cleanup()

    def report(self, **changes):
        self.counter += 1
        return self.store.ingest({**self.sample, "report_id": f"auto-{self.counter}", **changes})

    def papercut(self, title, **changes):
        return self.report(title=title, fingerprint=title, **changes)["papercut"]["id"]


class IngestTest(StoreCase):
    def test_replay_and_cross_reporter_counts(self):
        first = self.store.ingest(self.sample)
        self.assertEqual((first["created"], first["replay"], first["papercut"]["report_count"]), (True, False, 1))

        replay = self.store.ingest(self.sample)
        self.assertEqual((replay["replay"], replay["report"]["id"], replay["papercut"]["report_count"]),
                         (True, first["report"]["id"], 1))

        grouped = self.store.ingest({**self.sample, "reporter": "laptop-2", "report_id": "report-2"})
        self.assertEqual(grouped["papercut"],
                         {"id": first["papercut"]["id"], "status": "open", "report_count": 2, "reporter_count": 2})

    def test_rejects_malformed_reports(self):
        without_id = {key: value for key, value in self.sample.items() if key != "report_id"}
        cases = {
            "report_id": without_id,
            "observed_at is in the future": {**self.sample, "observed_at": "2999-01-01"},
            "observed_at must be": {**self.sample, "observed_at": "last tuesday"},
            "cost_minutes": {**self.sample, "cost_minutes": -3},
            "must match": {**self.sample, "machine_id": "laptop-2"},
            "category must be one of": {**self.sample, "category": "bug"},
            "title must be a string": {**self.sample, "title": 7},
        }
        for message, payload in cases.items():
            with self.subTest(message), self.assertRaisesRegex(ValueError, message):
                self.store.ingest(payload)

    def test_machine_id_is_accepted_as_reporter(self):
        legacy = {key: value for key, value in self.sample.items() if key != "reporter"} | {"machine_id": "laptop-9"}
        papercut_id = self.store.ingest(legacy)["papercut"]["id"]
        self.assertEqual(self.store.get_papercut(papercut_id)["reports"][0]["reporter"], "laptop-9")
        # Clients that support older servers send both names with the same value.
        both = self.store.ingest({**self.sample, "report_id": "report-2", "machine_id": "laptop-1"})
        self.assertFalse(both["replay"])

    def test_report_keeps_submission(self):
        submitted = {**self.sample, "title": "  Agent misses hidden build step ", "category": "tooling",
                     "machine": "mbp-7", "agent": "claude", "session": "s-1", "area": "mage build",
                     "cost_minutes": 12.5, "source_type": "local-papercuts", "source_ref": "chris.claude.x.md",
                     "transcript": "~/.claude/projects/p/s.jsonl", "lines": "10-20"}
        result = self.store.ingest(submitted)
        self.assertEqual(result["extra_fields"], ["lines", "transcript"])
        papercut = self.store.get_papercut(result["papercut"]["id"])
        self.assertEqual(papercut["reports"][0] | {"payload": None}, papercut["reports"][0] | {
            "reporter": "laptop-1",
            "machine": "mbp-7",
            "agent": "claude",
            "session": "s-1",
            "area": "mage build",
            "cost_minutes": 12.5,
            "title": "Agent misses hidden build step",
            "fingerprint": server.computed_fingerprint("Agent misses hidden build step", "mage/src/mage/build.clj"),
            "submitted_fingerprint": None,
            "submitted_category": "tooling",
            "payload": None,
        })
        self.assertEqual(papercut["reports"][0]["payload"], submitted)
        self.assertEqual((papercut["cost_minutes"], papercut["agent_count"]), (12.5, 1))

    def test_report_records_git_context(self):
        result = self.report(branch="fix-rollback", commit_sha="70A3D8CB4A7", commit_source="reflog",
                             repository_url="git@github.com:metabase/metabase.git")
        self.assertEqual(result["extra_fields"], [])
        self.report(branch="master")
        report = self.store.get_papercut(result["papercut"]["id"])["reports"][-1]
        self.assertEqual({key: report[key] for key in ("branch", "commit_sha", "commit_source", "repository_url")},
                         {"branch": "fix-rollback", "commit_sha": "70a3d8cb4a7", "commit_source": "reflog",
                          "repository_url": "git@github.com:metabase/metabase.git"})
        self.assertEqual(self.store.list_papercuts({"branch": "fix-rollback"})["total"], 1)
        self.assertEqual(self.store.list_papercuts({"branch": "no-such-branch"})["total"], 0)

    def test_rejects_malformed_git_context(self):
        for changes in ({"commit_sha": "not-a-sha"}, {"commit_sha": "abc"},
                        {"commit_sha": "70a3d8cb4a7", "commit_source": "guess"}, {"commit_source": "reflog"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.report(**changes)

    def test_category_is_unclassified_until_a_report_or_triage_sets_it(self):
        papercut_id = self.store.ingest(self.sample)["papercut"]["id"]
        self.assertIsNone(self.store.get_papercut(papercut_id)["category"])
        self.report(category="tooling")
        self.report(category="documentation")
        self.report(category="documentation")
        papercut = self.store.get_papercut(papercut_id)
        self.assertEqual((papercut["category"], papercut["category_votes"]),
                         ("tooling", {"documentation": 2, "tooling": 1}))

    def test_replay_with_changed_fingerprint_conflicts(self):
        self.store.ingest(self.sample)
        self.assertTrue(self.store.ingest({**self.sample, "description": "Edited later"})["replay"])
        with self.assertRaises(server.ConflictError):
            self.store.ingest({**self.sample, "title": "A different papercut"})
        self.assertEqual(self.store.list_papercuts()["total"], 1)

    def test_observed_at_sets_seen_window(self):
        self.store.ingest({**self.sample, "observed_at": "2026-08-30"})
        papercut_id = self.report(observed_at="2026-08-21T10:00:00Z")["papercut"]["id"]
        papercut = self.store.get_papercut(papercut_id)
        self.assertEqual((papercut["first_seen"], papercut["last_seen"]),
                         ("2026-08-21T10:00:00+00:00", "2026-08-30T00:00:00+00:00"))
        # Reports are listed by when they were seen, newest first.
        self.assertEqual(papercut["reports"][0]["observed_at"], "2026-08-30T00:00:00+00:00")

    def test_concurrent_reports_group_without_losing_counts(self):
        def report(number):
            return self.store.ingest({**self.sample, "reporter": f"machine-{number}", "report_id": f"report-{number}"})

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(report, range(12)))
        papercuts = self.store.list_papercuts()["papercuts"]
        self.assertEqual([(p["report_count"], p["reporter_count"]) for p in papercuts], [(12, 12)])

    def test_database_enforces_values_and_repository(self):
        papercut_id = self.store.ingest(self.sample)["papercut"]["id"]
        with self.store.connect(write=True) as db:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE papercuts SET status = 'closed' WHERE id = ?", (papercut_id,))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE reports SET repository = 'another' WHERE papercut_id = ?", (papercut_id,))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE papercuts SET merged_into = id WHERE id = ?", (papercut_id,))


class ListTest(StoreCase):
    def test_sorts_pages_and_filters(self):
        quiet = self.papercut("Quiet trap", observed_at="2026-09-10")
        loud = self.papercut("Loud trap", observed_at="2026-09-01", category="tooling")
        self.report(title="Loud trap", fingerprint="Loud trap", reporter="laptop-2", observed_at="2026-09-02")
        listed = self.store.list_papercuts()["papercuts"]
        self.assertEqual([(p["id"], p["fingerprints"]) for p in listed], [(quiet, ["Quiet trap"]), (loud, ["Loud trap"])])
        by_reports = self.store.list_papercuts({"sort": "reports", "limit": "1"})
        self.assertEqual((by_reports["papercuts"][0]["id"], by_reports["total"], by_reports["next_offset"]),
                         (loud, 2, 1))
        self.assertIsNone(self.store.list_papercuts({"sort": "reports", "limit": "1", "offset": "1"})["next_offset"])
        self.assertEqual([p["id"] for p in self.store.list_papercuts({"category": "unclassified"})["papercuts"]],
                         [quiet])
        self.assertEqual([p["id"] for p in self.store.list_papercuts({"fingerprint": "Loud trap"})["papercuts"]],
                         [loud])
        for bad in ({"sort": "popular"}, {"limit": "0"}, {"limit": "501"}, {"offset": "-1"}):
            with self.subTest(bad), self.assertRaises(ValueError):
                self.store.list_papercuts(bad)

    def test_since_cursor_returns_only_changes(self):
        first = self.papercut("First trap")
        cursor = self.store.list_papercuts()["cursor"]
        self.assertEqual(self.store.list_papercuts({"since": cursor})["papercuts"], [])
        self.store.comment(first, {"body": "Seen again"})
        second = self.papercut("Second trap")
        changed = self.store.list_papercuts({"since": cursor})
        self.assertEqual({p["id"] for p in changed["papercuts"]}, {first, second})
        self.assertGreater(changed["cursor"], cursor)


class TriageTest(StoreCase):
    def test_updates_record_history(self):
        papercut_id = self.papercut("Trap")
        self.store.update_papercut(papercut_id, {"status": "investigating", "category": "tooling",
                                                 "actor": "chris", "reason": "Looking into it"})
        # An unchanged value records nothing.
        self.store.update_papercut(papercut_id, {"status": "investigating"})
        papercut = self.store.update_papercut(papercut_id, {"category": None, "title": "Renamed trap"})
        self.assertEqual((papercut["status"], papercut["category"], papercut["title"]),
                         ("investigating", None, "Renamed trap"))
        self.assertEqual([(e["kind"], e["actor"], e["old_value"], e["new_value"], e["body"]) for e in papercut["events"]], [
            ("category", "chris", None, "tooling", "Looking into it"),
            ("status", "chris", "open", "investigating", "Looking into it"),
            ("category", "anonymous", "tooling", None, None),
            ("title", "anonymous", "Trap", "Renamed trap", None),
        ])
        for bad in ({"status": "closed"}, {"owner": "me"}, {"actor": "chris"}, {"title": " "}):
            with self.subTest(bad), self.assertRaises(ValueError):
                self.store.update_papercut(papercut_id, bad)
        with self.assertRaises(server.NotFound):
            self.store.update_papercut(999, {"status": "open"})

    def test_comments(self):
        papercut_id = self.papercut("Trap")
        papercut = self.store.comment(papercut_id, {"author": "chris", "body": "Hit this again today"})
        self.assertEqual([(e["kind"], e["actor"], e["body"]) for e in papercut["events"]],
                         [("comment", "chris", "Hit this again today")])
        with self.assertRaises(ValueError):
            self.store.comment(papercut_id, {"body": ""})

    def test_new_report_reopens_resolved_papercut(self):
        papercut_id = self.papercut("Trap", observed_at="2026-09-01")
        self.store.update_papercut(papercut_id, {"status": "resolved"})
        # A report from before the fix is history, not a regression.
        old = self.report(title="Trap", fingerprint="Trap", observed_at="2026-09-02")
        self.assertEqual((old["reopened"], old["papercut"]["status"]), (False, "resolved"))
        new = self.report(title="Trap", fingerprint="Trap")
        self.assertEqual((new["reopened"], new["papercut"]["status"]), (True, "open"))
        event = self.store.get_papercut(papercut_id)["events"][-1]
        self.assertEqual((event["kind"], event["actor"], event["old_value"], event["new_value"]),
                         ("reopened", "server", "resolved", "open"))

    def test_wontfix_is_not_reopened(self):
        papercut_id = self.papercut("Trap")
        self.store.update_papercut(papercut_id, {"status": "wontfix"})
        self.assertEqual(self.report(title="Trap", fingerprint="Trap")["papercut"]["status"], "wontfix")

    def test_fingerprint_alias_routes_to_papercut(self):
        papercut_id = self.papercut("Trap")
        self.store.add_fingerprint(papercut_id, {"fingerprint": "old-key", "actor": "importer"})
        routed = self.report(fingerprint="old-key")
        self.assertEqual((routed["created"], routed["papercut"]["id"]), (False, papercut_id))
        other = self.papercut("Other trap")
        with self.assertRaisesRegex(server.ConflictError, "merge instead"):
            self.store.add_fingerprint(other, {"fingerprint": "old-key"})


class RelationTest(StoreCase):
    def test_similar_papercuts_are_suggested_and_can_be_rejected(self):
        first = self.papercut("Git replay leaves worktree index stale", description="Moving the branch ref")
        second = self.papercut("Git replay leaves the worktree index stale", description="Moving a branch ref")
        unrelated = self.papercut("Kondo cache hides lint warnings in CI", description="Cold cache")
        related = self.store.get_papercut(second)["related"]
        self.assertEqual([(r["id"], r["source"]) for r in related], [(first, "suggested")])

        self.store.unrelate(second, first, {"actor": "chris"})
        self.assertEqual(self.store.get_papercut(second)["related"], [])
        # Editing the text recomputes suggestions, but a rejected pair stays rejected.
        self.store.update_papercut(second, {"description": "Moving the branch ref"})
        self.assertEqual(self.store.get_papercut(second)["related"], [])

        papercut = self.store.relate(second, {"papercut_id": unrelated, "actor": "chris"})
        self.assertEqual([(r["id"], r["source"]) for r in papercut["related"]], [(unrelated, "manual")])
        self.assertEqual([e["kind"] for e in papercut["events"]][-3:], ["unrelated", "description", "related"])

    def test_relations_stay_within_a_repository(self):
        first = self.papercut("Trap")
        other = self.papercut("Trap elsewhere", repository="another")
        with self.assertRaises(ValueError):
            self.store.relate(first, {"papercut_id": other})


class MergeTest(StoreCase):
    def test_merge_moves_reports_fingerprints_and_relations(self):
        target = self.papercut("Target trap", observed_at="2026-09-05")
        source = self.papercut("Source trap", observed_at="2026-09-01")
        self.report(title="Source trap", fingerprint="Source trap", reporter="laptop-2", observed_at="2026-09-09")
        neighbour = self.papercut("Neighbour trap")
        self.store.relate(source, {"papercut_id": neighbour})
        self.store.relate(source, {"papercut_id": target})

        merged = self.store.merge(source, {"into": target, "actor": "chris", "reason": "Same trap"})
        self.assertEqual((merged["id"], merged["report_count"], merged["reporter_count"]), (target, 3, 2))
        self.assertEqual(merged["fingerprints"], ["Source trap", "Target trap"])
        self.assertEqual((merged["first_seen"], merged["last_seen"]),
                         ("2026-09-01T00:00:00+00:00", "2026-09-09T00:00:00+00:00"))
        self.assertEqual([(r["id"], r["source"]) for r in merged["related"]], [(neighbour, "manual")])
        self.assertEqual((merged["events"][-1]["kind"], merged["events"][-1]["new_value"]), ("absorbed", str(source)))

        # New reports under the old fingerprint land on the target; the old id resolves to it.
        self.assertEqual(self.report(title="Source trap", fingerprint="Source trap")["papercut"]["id"], target)
        self.assertEqual((self.store.resolve(source), self.store.get_papercut(source)["merged_into"]), (target, target))
        self.assertNotIn(source, [p["id"] for p in self.store.list_papercuts()["papercuts"]])
        with self.assertRaisesRegex(server.ConflictError, f"merged into {target}"):
            self.store.update_papercut(source, {"status": "resolved"})

    def test_merge_resets_triage_only_when_papercuts_disagree(self):
        agree_a, agree_b = self.papercut("A"), self.papercut("B")
        for papercut_id in (agree_a, agree_b):
            self.store.update_papercut(papercut_id, {"status": "investigating", "category": "tooling"})
        merged = self.store.merge(agree_b, {"into": agree_a})
        self.assertEqual((merged["status"], merged["category"]), ("investigating", "tooling"))

        resolved, fresh = self.papercut("C"), self.papercut("D", category="documentation")
        self.store.update_papercut(resolved, {"status": "resolved"})
        merged = self.store.merge(fresh, {"into": resolved})
        # The target takes the source's category because it had none.
        self.assertEqual((merged["status"], merged["category"]), ("open", "documentation"))
        self.assertIn(("status", "resolved", "open"),
                      [(e["kind"], e["old_value"], e["new_value"]) for e in merged["events"]])

    def test_merge_follows_earlier_merges_and_checks_input(self):
        a, b, c = self.papercut("A"), self.papercut("B"), self.papercut("C")
        self.store.merge(b, {"into": c})
        # Merging into a merged papercut lands on the one it was merged into.
        self.assertEqual(self.store.merge(a, {"into": b})["id"], c)
        elsewhere = self.papercut("E", repository="another")
        for payload, error in (({"into": c}, ValueError), ({"into": elsewhere}, ValueError),
                               ({"into": 999}, server.NotFound), ({"into": "c"}, ValueError)):
            with self.subTest(payload), self.assertRaises(error):
                self.store.merge(c, payload)

    def test_since_feed_reports_merged_papercuts(self):
        a, b = self.papercut("A"), self.papercut("B")
        cursor = self.store.list_papercuts()["cursor"]
        self.store.merge(b, {"into": a})
        changed = {p["id"]: p["merged_into"] for p in self.store.list_papercuts({"since": cursor})["papercuts"]}
        self.assertEqual(changed, {a: None, b: a})


class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "old.sqlite3"

    def tearDown(self):
        self.temp.cleanup()

    def build_v1(self):
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        server.create_v1(db)
        rows = [
            (1, "metabase", "local-papercuts:slug", "Imported", "tooling", "resolved"),
            (2, "metabase", server.computed_fingerprint("Hashed", "a.clj"), "Hashed", "code-smell", "open"),
        ]
        for id_, repository, fingerprint, title, category, status in rows:
            db.execute("""INSERT INTO issues (id, repository, fingerprint, title, description, path, category,
                          status, first_seen, last_seen) VALUES (?, ?, ?, ?, '', ?, ?, ?, '2026-09-01', '2026-09-02')""",
                       (id_, repository, fingerprint, title, "a.clj" if id_ == 2 else "mage (build tasks)",
                        category, status))
        db.execute("""INSERT INTO reports (id, issue_id, repository, machine_id, report_id, title, description, path,
                      received_at, observed_at) VALUES
                      (1, 1, 'metabase', 'chris.claude', 'r1', 'Imported', 'Text' || char(10) || 'Source: local-papercuts/chris.claude.slug.md', 'mage (build tasks)', '2026-09-23', '2026-09-01'),
                      (2, 2, 'metabase', 'laptop', NULL, 'Hashed', 'Plain', 'a.clj', '2026-09-23', NULL)""")
        db.execute("INSERT INTO relations VALUES (1, 2, 'manual', NULL)")
        db.commit()
        db.close()

    def test_v1_database_is_migrated_with_provable_backfills(self):
        self.build_v1()
        store = server.Store(self.path)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], len(server.MIGRATIONS))
        imported, hashed = store.get_papercut(1), store.get_papercut(2)
        self.assertEqual((imported["status"], imported["category"], imported["fingerprints"], imported["path"],
                          imported["area"]),
                         ("resolved", "tooling", ["local-papercuts:slug"], "", "mage (build tasks)"))
        self.assertIsNotNone(imported["status_changed_at"])
        self.assertEqual(imported["reports"][0] | {"received_at": None}, imported["reports"][0] | {
            "reporter": "chris",
            "agent": "claude",
            "session": None,
            "path": "",
            "area": "mage (build tasks)",
            "fingerprint": "local-papercuts:slug",
            "submitted_fingerprint": "local-papercuts:slug",
            "submitted_category": None,
            "source_type": "local-papercuts",
            "source_ref": "chris.claude.slug.md",
            "payload": None,
            "received_at": None,
        })
        self.assertEqual((hashed["path"], hashed["reports"][0]["reporter"], hashed["reports"][0]["agent"]),
                         ("a.clj", "laptop", None))
        self.assertEqual(imported["related"][0]["source"], "manual")

        # The importer's replay of a migrated report matches on the split reporter.
        replay = store.ingest({"repository": "metabase", "reporter": "chris", "agent": "claude", "report_id": "r1",
                               "fingerprint": "local-papercuts:slug", "title": "Imported"})
        self.assertEqual((replay["created"], replay["replay"]), (False, True))

    def test_v2_guessed_category_is_cleared(self):
        db = sqlite3.connect(self.path, isolation_level=None)
        db.row_factory = sqlite3.Row
        server.create_v1(db)
        server.migrate_to_v2(db)
        db.execute("PRAGMA user_version = 2")
        db.execute("""INSERT INTO issues (id, repository, title, description, path, category, first_seen, last_seen)
                      VALUES (1, 'metabase', 'Guessed', '', '', 'agent-trap', '2026-09-01', '2026-09-01'),
                             (2, 'metabase', 'Sent', '', '', 'tooling', '2026-09-01', '2026-09-01')""")
        for id_, category, payload in ((1, None, {"transcript": "/p/abc.jsonl"}), (2, "tooling", {})):
            db.execute("""INSERT INTO reports (id, issue_id, repository, reporter, report_id, fingerprint,
                          submitted_category, title, description, path, source_type, payload, received_at)
                          VALUES (?, ?, 'metabase', 'chris.codex', ?, ?, ?, '', '', '', 'local-papercuts', ?, '2026-09-23')""",
                       (id_, id_, f"r{id_}", f"f{id_}", category, json.dumps(payload)))
        db.close()
        store = server.Store(self.path)
        guessed, sent = store.get_papercut(1), store.get_papercut(2)
        self.assertEqual((guessed["category"], sent["category"]), (None, "tooling"))
        self.assertEqual((guessed["reports"][0]["session"], guessed["reports"][0]["agent"]), ("abc", "codex"))

    def test_v3_git_fields_are_copied_from_the_stored_request(self):
        db = sqlite3.connect(self.path, isolation_level=None)
        db.row_factory = sqlite3.Row
        for step in server.MIGRATIONS[:3]:
            step(db)
        db.execute("PRAGMA user_version = 3")
        db.execute("""INSERT INTO papercuts (id, repository, title, description, path, first_seen, last_seen, updated_at)
                      VALUES (1, 'metabase', 'T', '', '', '2026-09-01', '2026-09-01', '2026-09-01')""")
        payloads = [{"branch": "fix-x", "commit_sha": "abcdef1", "commit_source": "session-start"},
                    {"commit_sha": "not-a-sha"},
                    {}]
        for id_, payload in enumerate(payloads, 1):
            db.execute("""INSERT INTO reports (id, papercut_id, repository, reporter, report_id, fingerprint, title,
                          description, path, payload, received_at) VALUES (?, 1, 'metabase', 'r', ?, 'f', 'T', '', '', ?,
                          '2026-09-01')""", (id_, f"r{id_}", json.dumps(payload)))
        db.close()
        reports = server.Store(self.path).get_papercut(1)["reports"]
        self.assertEqual({r["report_id"]: (r["branch"], r["commit_sha"], r["commit_source"]) for r in reports},
                         {"r1": ("fix-x", "abcdef1", "session-start"), "r2": (None, None, None),
                          "r3": (None, None, None)})

    def test_migration_runs_once(self):
        self.build_v1()
        server.Store(self.path)
        store = server.Store(self.path)
        self.assertEqual(store.get_papercut(1)["report_count"], 1)


class HttpTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.Store(Path(self.temp.name) / "papercuts.sqlite3")
        self.handler = type("TestHandler", (server.Handler,),
                            {"store": self.store, "token": None, "log_message": lambda *args: None})
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), self.handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.temp.cleanup()

    def call(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=5)
        data = json.dumps(body).encode() if body is not None else None
        connection.request(method, path, body=data, headers={"Content-Type": "application/json", **(headers or {})})
        response = connection.getresponse()
        raw = response.read()
        connection.close()
        is_json = response.getheader("Content-Type", "").startswith("application/json")
        return response.status, json.loads(raw) if is_json else raw.decode(), response

    def report(self, report_id, title="Trap"):
        return self.call("POST", "/api/reports", {"repository": "metabase", "reporter": "laptop", "report_id": report_id,
                                                  "title": title, "fingerprint": title})

    def test_status_codes(self):
        self.assertEqual(self.report("r1")[0], 201)
        self.assertEqual(self.report("r2")[0], 201)
        self.assertEqual(self.report("r2")[0], 200)
        self.assertEqual(self.call("POST", "/api/reports", {"title": "x"})[0], 400)
        self.assertEqual(self.call("GET", "/api/papercuts/999")[0], 404)
        self.assertEqual(self.call("PATCH", "/api/papercuts/999", {"status": "open"})[0], 404)
        self.assertEqual(self.call("GET", "/api/papercuts/1/2")[0], 404)
        status, body, _ = self.call("POST", "/api/papercuts/1/comments", {"body": "Seen again"})
        self.assertEqual((status, body["events"][-1]["kind"]), (201, "comment"))
        status, body, _ = self.call("GET", "/api/papercuts?sort=reports")
        self.assertEqual((status, body["total"], body["papercuts"][0]["report_count"]), (200, 1, 2))
        self.assertEqual(self.call("GET", "/")[0], 200)
        self.assertEqual(self.call("GET", "/papercuts/1")[0], 200)

    def test_since_accepts_unencoded_cursor(self):
        self.report("r1", "First")
        cursor = self.call("GET", "/api/papercuts")[1]["cursor"]
        self.report("r2", "Second")
        for since in (cursor, cursor.replace("+00:00", "Z")):
            with self.subTest(since):
                status, body, _ = self.call("GET", f"/api/papercuts?since={since}")
                self.assertEqual((status, [p["title"] for p in body["papercuts"]]), (200, ["Second"]))
        self.assertEqual(self.call("GET", "/api/papercuts?since=yesterday")[0], 400)

    def test_legacy_issue_routes(self):
        self.report("r1")
        status, body, _ = self.call("GET", "/api/issues?repository=metabase")
        self.assertEqual((status, [(i["title"], i["fingerprints"]) for i in body]), (200, [("Trap", ["Trap"])]))
        status, _, response = self.call("GET", "/api/issues/1")
        self.assertEqual((status, response.getheader("Location")), (308, "/api/papercuts/1"))

    def test_merged_papercut_redirects(self):
        target = self.report("r1", "Target")[1]["papercut"]["id"]
        source = self.report("r2", "Source")[1]["papercut"]["id"]
        status, body, _ = self.call("POST", f"/api/papercuts/{source}/merge", {"into": target})
        self.assertEqual((status, body["id"]), (200, target))
        for path, location in ((f"/api/papercuts/{source}?reports_limit=1", f"/api/papercuts/{target}?reports_limit=1"),
                               (f"/papercuts/{source}", f"/papercuts/{target}")):
            status, _, response = self.call("GET", path)
            self.assertEqual((status, response.getheader("Location")), (301, location))
        self.assertEqual(self.call("PATCH", f"/api/papercuts/{source}", {"status": "open"})[0], 409)

    def test_relation_delete_rejects_pair(self):
        a = self.report("r1", "Git replay leaves worktree index stale")[1]["papercut"]["id"]
        b = self.report("r2", "Git replay leaves the worktree index stale")[1]["papercut"]["id"]
        self.assertEqual(len(self.call("GET", f"/api/papercuts/{b}")[1]["related"]), 1)
        status, body, _ = self.call("DELETE", f"/api/papercuts/{b}/related/{a}")
        self.assertEqual((status, body["related"]), (200, []))

    def test_token_guards_writes(self):
        self.handler.token = "secret"
        self.assertEqual(self.report("r1")[0], 401)
        self.assertEqual(self.call("POST", "/api/reports", {"repository": "metabase", "reporter": "laptop",
                                                            "report_id": "r1", "title": "Trap"},
                                   headers={"Authorization": "Bearer secret"})[0], 201)
        self.assertEqual(self.call("GET", "/api/papercuts")[0], 200)

    def test_unexpected_errors_are_json(self):
        def broken(*_):
            raise RuntimeError("boom")

        def busy(*_):
            raise sqlite3.OperationalError("database is locked")

        for replacement, expected in ((broken, 500), (busy, 503)):
            self.store.list_papercuts = replacement
            with self.subTest(expected), open("/dev/null", "w") as quiet:
                stderr, server.sys.stderr = server.sys.stderr, quiet
                try:
                    status, body, _ = self.call("GET", "/api/papercuts")
                finally:
                    server.sys.stderr = stderr
                self.assertEqual(status, expected)
                self.assertIn("error", body)

    def test_metabot_papercut_offers_a_pr_until_a_pr_link_is_commented(self):
        for report_id, fingerprint in (("r1", "metabot:abc"), ("r2", "other")):
            self.call("POST", "/api/reports", {"repository": "metabase", "reporter": "laptop", "report_id": report_id,
                                               "title": report_id, "fingerprint": fingerprint})
        self.assertIn("fetch('/api/papercuts/1/comments'", self.call("GET", "/papercuts/1")[1])
        self.assertIn("JSON.stringify({author: 'andrei', body: '/pr'})", self.call("GET", "/papercuts/1")[1])
        self.assertNotIn("Open PR", self.call("GET", "/papercuts/2")[1])
        self.assertEqual(self.call("POST", "/api/papercuts/1/comments", {"author": "andrei", "body": "/pr"})[0], 201)
        self.call("POST", "/api/papercuts/1/comments",
                  {"author": "papercut-fixer", "body": "Draft PR: https://github.com/metabase/metabase/pull/123"})
        page = self.call("GET", "/papercuts/1")[1]
        self.assertIn("PR: <a href='https://github.com/metabase/metabase/pull/123'>", page)
        self.assertNotIn("Open PR", page)

    def test_html_escapes_titles(self):
        papercut_id = self.report("r1", "<script>alert(1)</script>")[1]["papercut"]["id"]
        _, page, _ = self.call("GET", f"/papercuts/{papercut_id}")
        self.assertNotIn("<script>alert(1)</script>", page)
        self.assertIn("&lt;script&gt;", page)

    def test_html_links_urls(self):
        self.call("POST", "/api/reports", {"repository": "metabase", "reporter": "laptop", "report_id": "r1", "title": "Trap",
                                           "description": "See https://example.com/a?b=1&c=2. Not javascript:alert(1)",
                                           "source_ref": "http://localhost:3000/x'onmouseover='alert(1)"})
        _, page, _ = self.call("GET", "/papercuts/1")
        self.assertIn("<a href='https://example.com/a?b=1&amp;c=2'>https://example.com/a?b=1&amp;c=2</a>. Not", page)
        self.assertIn("<a href='http://localhost:3000/x'>http://localhost:3000/x</a>&#x27;onmouseover", page)
        self.assertNotIn("href='javascript", page)


if __name__ == "__main__":
    unittest.main()
