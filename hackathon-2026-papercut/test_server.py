import importlib.util
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
            "machine_id": "laptop-1",
            "report_id": "report-1",
            "title": "Agent misses hidden build step",
            "description": "Mage must run before tests",
            "path": "mage/src/mage/build.clj",
        }

    def tearDown(self):
        self.temp.cleanup()

    def test_duplicate_replay_and_cross_machine_counts(self):
        first, created, replay = self.store.ingest(self.sample)
        self.assertTrue(created)
        self.assertFalse(replay)
        self.assertEqual(first["category"], "agent-trap")

        same, created, replay = self.store.ingest(self.sample)
        self.assertFalse(created)
        self.assertTrue(replay)
        self.assertEqual(same["report_count"], 1)

        from_other_machine = {**self.sample, "machine_id": "laptop-2", "report_id": "report-2"}
        grouped, created, replay = self.store.ingest(from_other_machine)
        self.assertFalse(created)
        self.assertFalse(replay)
        self.assertEqual(grouped["id"], first["id"])
        self.assertEqual(grouped["report_count"], 2)
        self.assertEqual(grouped["machine_count"], 2)

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
        self.assertNotIn("<script>", rendered)
        self.assertIn("&lt;script&gt;", rendered)

    def test_concurrent_reports_group_without_losing_counts(self):
        def report(number):
            return self.store.ingest({
                **self.sample,
                "machine_id": f"machine-{number}",
                "report_id": f"report-{number}",
            })

        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(report, range(12)))
        issues = self.store.list_issues()
        self.assertEqual(len(issues), 1)
        self.assertEqual(issues[0]["report_count"], 12)
        self.assertEqual(issues[0]["machine_count"], 12)


if __name__ == "__main__":
    unittest.main()
