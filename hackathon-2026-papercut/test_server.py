import importlib.util
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


spec = importlib.util.spec_from_file_location("papercut_server", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class StoreTest(unittest.TestCase):
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

    def tearDown(self):
        self.temp.cleanup()

    def test_duplicate_replay_and_cross_reporter_counts(self):
        first, created, replay = self.store.ingest(self.sample)
        self.assertTrue(created)
        self.assertFalse(replay)
        self.assertEqual(first["category"], "agent-trap")

        same, created, replay = self.store.ingest(self.sample)
        self.assertFalse(created)
        self.assertTrue(replay)
        self.assertEqual(same["report_count"], 1)

        from_other_reporter = {**self.sample, "reporter": "laptop-2", "report_id": "report-2"}
        grouped, created, replay = self.store.ingest(from_other_reporter)
        self.assertFalse(created)
        self.assertFalse(replay)
        self.assertEqual(grouped["id"], first["id"])
        self.assertEqual(grouped["report_count"], 2)
        self.assertEqual(grouped["reporter_count"], 2)

    def test_related_suggestion_and_manual_triage(self):
        first, _, _ = self.store.ingest(self.sample)
        related, _, _ = self.store.ingest({
            **self.sample,
            "report_id": "report-2",
            "title": "Agent misses hidden build prerequisite",
        })
        self.assertNotEqual(first["id"], related["id"])
        self.assertEqual(related["related"][0]["id"], first["id"])
        self.assertEqual(related["related"][0]["source"], "suggested")
        updated = self.store.update_issue(first["id"], {"status": "investigating", "category": "tooling"})
        self.assertEqual(updated["status"], "investigating")
        self.assertEqual(len(self.store.list_issues({"category": "tooling"})), 1)
        self.assertEqual(self.store.relate(first["id"], related["id"])["related"][0]["source"], "manual")

    def test_repo_boundary_and_escaped_html(self):
        first, _, _ = self.store.ingest(self.sample)
        other, _, _ = self.store.ingest({**self.sample, "repository": "another"})
        self.assertNotEqual(first["id"], other["id"])
        with self.assertRaises(ValueError):
            self.store.relate(first["id"], other["id"])
        malicious = {**self.sample, "report_id": "report-3", "title": "<script>alert(1)</script>"}
        issue, _, _ = self.store.ingest(malicious)
        rendered = server.issue_html(issue)
        self.assertNotIn("<script>alert(1)</script>", rendered)
        self.assertIn("&lt;script&gt;", rendered)

    def test_observed_at_sets_seen_window(self):
        self.store.ingest({**self.sample, "observed_at": "2026-08-30"})
        issue, _, _ = self.store.ingest({**self.sample, "report_id": "report-2", "observed_at": "2026-08-21T10:00:00Z"})
        self.assertEqual(issue["first_seen"], "2026-08-21T10:00:00+00:00")
        self.assertEqual(issue["last_seen"], "2026-08-30T00:00:00+00:00")
        self.assertEqual(issue["reports"][0]["observed_at"], "2026-08-21T10:00:00+00:00")
        with self.assertRaises(ValueError):
            self.store.ingest({**self.sample, "report_id": "report-3", "observed_at": "last tuesday"})

    def test_concurrent_reports_group_without_losing_counts(self):
        def report(number):
            return self.store.ingest({
                **self.sample,
                "reporter": f"reporter-{number}",
                "report_id": f"report-{number}",
            })

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(report, range(12)))
        issues = self.store.list_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["report_count"], 12)
        self.assertEqual(issues[0]["reporter_count"], 12)

    def test_report_keeps_submission(self):
        submitted = {**self.sample, "title": "  Agent misses hidden build step ", "category": "tooling",
                     "machine": "mbp-7", "source_type": "local-papercuts", "source_ref": "chris.claude.x.md",
                     "transcript": "~/.claude/projects/p/s.jsonl", "lines": "10-20"}
        issue, _, _ = self.store.ingest(submitted)
        self.assertEqual(issue["reports"][0] | {"payload": None}, issue["reports"][0] | {
            "reporter": "laptop-1",
            "machine": "mbp-7",
            "title": "Agent misses hidden build step",
            "fingerprint": server.computed_fingerprint("Agent misses hidden build step", "mage/src/mage/build.clj"),
            "submitted_fingerprint": None,
            "submitted_category": "tooling",
            "source_type": "local-papercuts",
            "source_ref": "chris.claude.x.md",
            "payload": None,
        })
        self.assertEqual(issue["reports"][0]["payload"], submitted)

        guessed, _, _ = self.store.ingest({**self.sample, "report_id": "report-2", "fingerprint": "key-2"})
        self.assertEqual((guessed["category"], guessed["fingerprints"]), ("agent-trap", ["key-2"]))
        self.assertEqual(guessed["reports"][0]["submitted_category"], None)
        self.assertEqual(guessed["reports"][0]["submitted_fingerprint"], "key-2")

    def test_machine_id_is_accepted_as_reporter(self):
        legacy = {key: value for key, value in self.sample.items() if key != "reporter"} | {"machine_id": "laptop-9"}
        issue, _, _ = self.store.ingest(legacy)
        self.assertEqual(issue["reports"][0]["reporter"], "laptop-9")
        with self.assertRaisesRegex(ValueError, "reporter"):
            self.store.ingest({key: value for key, value in legacy.items() if key != "machine_id"})

    def test_replay_with_changed_fingerprint_conflicts(self):
        self.store.ingest(self.sample)
        _, created, replay = self.store.ingest({**self.sample, "description": "Edited later"})
        self.assertEqual((created, replay), (False, True))
        with self.assertRaises(server.ConflictError):
            self.store.ingest({**self.sample, "title": "A different papercut"})
        self.assertEqual(len(self.store.list_issues()), 1)

    def test_fingerprint_alias_routes_to_issue(self):
        issue, _, _ = self.store.ingest(self.sample)
        with sqlite3.connect(self.store.path) as db:
            db.execute("INSERT INTO issue_fingerprints (repository, fingerprint, issue_id) VALUES (?, ?, ?)",
                       ("metabase", "old-key", issue["id"]))
        merged, created, _ = self.store.ingest({**self.sample, "report_id": "report-2", "fingerprint": "old-key"})
        self.assertFalse(created)
        self.assertEqual(merged["id"], issue["id"])
        self.assertEqual(merged["report_count"], 2)

    def test_database_enforces_values_and_repository(self):
        issue, _, _ = self.store.ingest(self.sample)
        with self.store.connect() as db:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE issues SET status = 'closed' WHERE id = ?", (issue["id"],))
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("UPDATE reports SET repository = 'another' WHERE issue_id = ?", (issue["id"],))


class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "v1.sqlite3"
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
                       (id_, repository, fingerprint, title, "a.clj" if id_ == 2 else "", category, status))
        db.execute("""INSERT INTO reports (id, issue_id, repository, machine_id, report_id, title, description, path,
                      received_at, observed_at) VALUES
                      (1, 1, 'metabase', 'chris.claude', 'r1', 'Imported', 'Text' || char(10) || 'Source: local-papercuts/chris.claude.slug.md', '', '2026-09-23', '2026-09-01'),
                      (2, 2, 'metabase', 'laptop', NULL, 'Hashed', 'Plain', 'a.clj', '2026-09-23', NULL)""")
        db.execute("INSERT INTO relations VALUES (1, 2, 'manual', NULL)")
        db.commit()
        db.close()

    def tearDown(self):
        self.temp.cleanup()

    def test_v1_database_is_migrated_with_provable_backfills(self):
        store = server.Store(self.path)
        with sqlite3.connect(self.path) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], len(server.MIGRATIONS))
        imported, hashed = store.get_issue(1), store.get_issue(2)
        self.assertEqual((imported["status"], imported["fingerprints"], imported["reporter_count"]),
                         ("resolved", ["local-papercuts:slug"], 1))
        self.assertEqual(imported["reports"][0] | {"received_at": None}, imported["reports"][0] | {
            "reporter": "chris.claude",
            "fingerprint": "local-papercuts:slug",
            "submitted_fingerprint": "local-papercuts:slug",
            "submitted_category": None,
            "source_type": "local-papercuts",
            "source_ref": "chris.claude.slug.md",
            "payload": None,
            "received_at": None,
        })
        self.assertEqual(hashed["reports"][0]["submitted_fingerprint"], None)
        self.assertEqual(hashed["reports"][0]["source_ref"], None)
        self.assertEqual(imported["related"][0]["source"], "manual")

        # A replay of a migrated report matches on its backfilled fingerprint.
        _, created, replay = store.ingest({"repository": "metabase", "reporter": "chris.claude", "report_id": "r1",
                                           "fingerprint": "local-papercuts:slug", "title": "Imported"})
        self.assertEqual((created, replay), (False, True))

    def test_migration_runs_once(self):
        server.Store(self.path)
        store = server.Store(self.path)
        self.assertEqual(store.get_issue(1)["report_count"], 1)


if __name__ == "__main__":
    unittest.main()
