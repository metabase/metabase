import http.client
import importlib.util
import json
import sqlite3
import subprocess
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock


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


class WebViewTest(StoreCase):
    def test_list_has_structured_results_and_live_filters(self):
        self.papercut("Bash tool runs zsh on macOS: unmatched globs abort commands",
                      description="A shell trap.\n\nKind: env-friction\nImpact: both\nSeverity: medium")
        page = server.papercut_list_html(self.store.list_papercuts(), {}, self.store.repositories())
        self.assertIn("Bash tool runs zsh on macOS</a>", page)
        self.assertIn("<dt>Severity</dt><dd>medium</dd>", page)
        self.assertIn("<strong>Not estimated</strong><span>Time lost</span>", page)
        self.assertNotIn("<select id='repository' name='repository'>", page)
        self.papercut("Another repository trap", repository="elsewhere")
        page = server.papercut_list_html(self.store.list_papercuts(), {}, self.store.repositories())
        self.assertIn("<select id='repository' name='repository'>", page)
        self.assertIn("setTimeout(applyFilters, event.target.matches('input') ? 300 : 0)", page)
        self.assertIn("setInterval(refreshPage, 15000)", page)

    def seed_sources(self):
        """Four papercuts with distinct counts, costs, dates, sources and claims."""
        for title, reports in (
                ("Alpha", [("chris", "claude", None, 5, "2026-09-01"), ("tyler", "codex", None, 70, "2026-09-10")]),
                ("Bravo", [("chris", "codex", None, 1, "2026-09-05")]),
                ("Charlie", [("andreis.metabot", "metabot", "stats", 0.2, f"2026-09-1{day}") for day in (2, 3, 4)]),
                ("Delta", [("chris", "claude", None, 30, "2026-08-20")])):
            for reporter, agent, machine, cost, observed in reports:
                self.report(title=title, fingerprint=title, description=f"{title} happens", reporter=reporter,
                            agent=agent, machine=machine, cost_minutes=cost, observed_at=observed)
        for papercut_id, claimant in ((2, "tyler"), (4, "chris")):
            self.store.claim(papercut_id, {}, claimant)

    def test_every_sort_orders_the_list(self):
        self.seed_sources()
        expected = {"important": ["Charlie", "Alpha", "Bravo", "Delta"],
                    "oldest-claim-first": ["Bravo", "Delta", "Charlie", "Alpha"],
                    "recent": ["Charlie", "Alpha", "Bravo", "Delta"],
                    "oldest": ["Delta", "Alpha", "Bravo", "Charlie"],
                    "reports": ["Charlie", "Alpha", "Bravo", "Delta"],
                    "reporters": ["Alpha", "Charlie", "Delta", "Bravo"],
                    "agents": ["Alpha", "Charlie", "Delta", "Bravo"],
                    "cost": ["Alpha", "Delta", "Bravo", "Charlie"],
                    "related": [],
                    "updated": ["Delta", "Bravo", "Charlie", "Alpha"]}
        self.assertEqual(set(expected), set(server.SORTS))
        for sort, titles in expected.items():
            with self.subTest(sort):
                self.assertEqual([p["title"] for p in self.store.list_papercuts({"sort": sort})["papercuts"]], titles)

    def test_merge_candidates_sort_shows_only_visible_relations_and_their_counts(self):
        first, second, third, rejected, unrelated = (self.papercut(title) for title in
                                                      ("First", "Second", "Third", "Rejected", "Unrelated"))
        self.store.relate(first, {"papercut_id": second})
        self.store.suggest(first, {"suggestions": [{"papercut_id": third, "verdict": "duplicate"}]})
        self.store.unrelate(first, rejected, {})

        result = self.store.list_papercuts({"sort": "related"})
        self.assertEqual(result["total"], 3)
        self.assertEqual([(p["id"], p["related_count"]) for p in result["papercuts"]],
                         [(first, 2), (third, 1), (second, 1)])
        self.assertEqual(self.store.list_papercuts()["total"], 5)
        self.assertNotIn(unrelated, [p["id"] for p in result["papercuts"]])

        page = server.papercut_list_html(result, {"sort": "related"})
        self.assertIn("<option value='related' selected>Merge candidates (most related)</option>", page)
        self.assertIn("<span class='pill'>2 related</span>", page)

        cursor = result["cursor"]
        self.store.unrelate(first, second, {})
        self.assertEqual([(p["id"], p["related_count"]) for p in
                          self.store.list_papercuts({"sort": "related"})["papercuts"]], [(third, 1), (first, 1)])
        # The change feed still reports the papercut that left the merge candidates, so clients can drop it.
        self.assertIn((second, 0), [(p["id"], p["related_count"])
                                    for p in self.store.list_papercuts({"sort": "related", "since": cursor})["papercuts"]])

    def test_source_filter_and_chips(self):
        self.seed_sources()
        for source, titles in (("instance:stats", ["Charlie"]), ("person:chris.claude", ["Alpha", "Delta"]),
                               ("person:tyler.codex,instance:stats", ["Charlie", "Alpha"]), ("none", [])):
            with self.subTest(source):
                self.assertEqual([p["title"] for p in self.store.list_papercuts({"source": source})["papercuts"]], titles)
        self.assertEqual(self.store.sources(), {"person:chris.claude": 2, "person:tyler.codex": 1, "person:chris.codex": 1,
                                                "instance:stats": 1})
        page = server.papercut_list_html(self.store.list_papercuts(), {"source": "instance:stats"}, (), None,
                                         self.store.sources(), self.store.sources())
        self.assertIn("<optgroup label='Metabase instances'><option value='instance:stats' selected>stats (1)</option></optgroup>",
                      page)
        self.assertIn("<option value='person:chris.claude'>Chris · Claude (2)</option>", page)
        self.assertNotIn("data-name='source'", page)

    def test_chris_reporter_aliases_share_a_source_and_reporter_count(self):
        papercut_id = self.papercut("Alias", reporter="chris", agent="claude")
        alias = self.report(title="Alias", fingerprint="Alias", reporter="christruter.claude", agent="claude")
        self.report(title="Alias", fingerprint="Alias", reporter="christruter", agent="codex")
        self.assertEqual(self.store.sources(), {"person:chris.claude": 1, "person:chris.codex": 1})
        self.assertEqual(self.store.get_papercut(papercut_id)["reporter_count"], 1)
        stored = next(r for r in self.store.get_papercut(papercut_id)["reports"] if r["id"] == alias["report"]["id"])
        self.assertEqual((stored["reporter"], stored["payload"]["reporter"]), ("chris", "chris"))
        self.assertEqual([p["id"] for p in self.store.list_papercuts({"source": "person:chris.claude"})["papercuts"]],
                         [papercut_id])
        self.assertEqual([p["id"] for p in self.store.list_papercuts({"source": "person:chris.codex"})["papercuts"]],
                         [papercut_id])

    def test_list_previews_are_plain_text(self):
        self.papercut("Markdown preview", description="Intro `code` and **bold**.\n\n## Links\n\n- [Conversation](http://x) here")
        page = server.papercut_list_html(self.store.list_papercuts(), {}, self.store.repositories())
        self.assertIn("<p class='issue-summary'>Intro code and bold. Conversation here</p>", page)

    def test_titles_render_inline_markdown_without_nested_links(self):
        title = "**Bold** `code` [label](https://example.com) <script>"
        papercut_id = self.papercut(title)
        listing = server.papercut_list_html(self.store.list_papercuts(), {}, self.store.repositories())
        detail = server.papercut_html(self.store.get_papercut(papercut_id))
        rendered = "<strong>Bold</strong> <code>code</code> label &lt;script&gt;"
        self.assertIn(f"<a href='/papercuts/{papercut_id}' title=", listing)
        self.assertIn(f">{rendered}</a>", listing)
        self.assertIn(rendered, detail)
        self.assertNotIn("href='https://example.com'", listing)
        self.assertEqual(server.title_html(title), rendered)
        long_title = "The local tool fails after a long setup that ends with `git checkout -- file`"
        self.assertEqual(server.short_title(long_title), long_title)
        self.assertEqual(server.short_title(long_title.replace("ends with", "ends with the command") + " and a warning"),
                         "The local tool fails after a long setup that ends with the command…")

    def test_description_fields_and_safe_markdown(self):
        narrative, fix, facts = server.description_parts(
            "Uses `zsh` and **fails**.\n\nSuggested fix: Check *flags*.\n\n"
            "Kind: env-friction\nImpact: both\nSeverity: medium\nSource status: open\n"
            "Area: shell\nSource: local-papercuts/example.md")
        self.assertEqual(narrative, "Uses `zsh` and **fails**.")
        self.assertEqual(fix, "Check *flags*.")
        self.assertEqual(facts["Severity"], "medium")
        rendered = server.markdown_html("**bold** and `code` [safe](https://example.com) "
                                        "[bad](javascript:alert) <script>alert(1)</script>")
        self.assertIn("<strong>bold</strong>", rendered)
        self.assertIn("<code>code</code>", rendered)
        self.assertIn("href='https://example.com'", rendered)
        self.assertNotIn("href='javascript:", rendered)
        self.assertNotIn("<script>", rendered)

    def test_markdown_tables_render_from_new_and_older_imports(self):
        table = "| Idiom | Behaviour |\n|---|---|\n| `echo ===` | **error** |"
        flattened = "A summary: | Idiom | Behaviour | |---|---| | `echo ===` | **error** |"
        for source in (table, flattened):
            with self.subTest(source=source):
                rendered = server.markdown_html(source)
                self.assertIn("<table>", rendered)
                self.assertIn("<th>Idiom</th>", rendered)
                self.assertIn("<code>echo ===</code>", rendered)
                self.assertIn("<strong>error</strong>", rendered)


class IngestTest(StoreCase):
    def test_v10_reporter_and_repository_aliases_are_migrated_and_replay(self):
        report = self.report(reporter="chris", agent="claude")
        report_id = report["report"]["id"]
        with sqlite3.connect(self.store.path) as db:
            db.execute("UPDATE papercuts SET repository = 'mb'")
            db.execute("UPDATE papercut_fingerprints SET repository = 'mb'")
            db.execute("""UPDATE reports SET repository = 'mb', reporter = 'christruter.claude',
                          payload = json_set(payload, '$.repository', 'mb', '$.reporter', 'christruter.claude')
                          WHERE id = ?""", (report_id,))
            db.execute("PRAGMA user_version = 10")
        migrated = server.Store(self.store.path)
        stored = migrated.get_papercut(report["papercut"]["id"])["reports"][0]
        self.assertEqual((stored["repository"], stored["payload"]["repository"],
                          stored["reporter"], stored["payload"]["reporter"]),
                         ("metabase", "metabase", "chris", "chris"))
        self.assertEqual(migrated.repositories(), ["metabase"])
        replay = migrated.ingest({**self.sample, "repository": "mb", "report_id": stored["report_id"],
                                  "reporter": "christruter.claude", "agent": "claude"})
        self.assertEqual((replay["replay"], replay["report"]["id"]), (True, report_id))

    def test_v11_databases_are_normalized_again(self):
        mb = self.report(title="On mb")
        pc = self.report(title="On pc", fingerprint="pc-trap", reporter="chris", agent="claude")
        bodyless = self.report(title="Bodyless", fingerprint="old-trap")
        with sqlite3.connect(self.store.path) as db:
            for table in ("papercuts", "papercut_fingerprints"):
                db.execute(f"UPDATE {table} SET repository = 'mb' WHERE {'id' if table == 'papercuts' else 'papercut_id'} = ?",
                           (mb["papercut"]["id"],))
                db.execute(f"UPDATE {table} SET repository = 'pc' WHERE {'id' if table == 'papercuts' else 'papercut_id'} = ?",
                           (pc["papercut"]["id"],))
            db.execute("UPDATE reports SET repository = 'mb' WHERE id = ?", (mb["report"]["id"],))
            # The reporter column is already canonical, as version 3 left it, but the body still has the alias.
            db.execute("""UPDATE reports SET repository = 'pc',
                          payload = json_set(payload, '$.repository', 'pc', '$.reporter', 'chris.claude') WHERE id = ?""",
                       (pc["report"]["id"],))
            # A version 1 report has no stored body.
            db.execute("UPDATE reports SET reporter = 'christruter', payload = NULL WHERE id = ?",
                       (bodyless["report"]["id"],))
            db.execute("PRAGMA user_version = 11")
        migrated = server.Store(self.store.path)
        self.assertEqual(migrated.repositories(), ["metabase"])
        stored = {r["id"]: r for p in (mb, pc, bodyless)
                  for r in migrated.get_papercut(p["papercut"]["id"])["reports"]}
        self.assertEqual((stored[pc["report"]["id"]]["payload"]["repository"],
                          stored[pc["report"]["id"]]["payload"]["reporter"]), ("metabase", "chris"))
        self.assertEqual((stored[bodyless["report"]["id"]]["reporter"], stored[bodyless["report"]["id"]]["payload"]),
                         ("chris", None))

    def test_new_mb_report_uses_metabase_repository(self):
        result = self.report(repository="mb", reporter="christruter.codex", agent="codex")
        stored = self.store.get_papercut(result["papercut"]["id"])["reports"][0]
        self.assertEqual((stored["repository"], stored["payload"]["repository"], stored["reporter"]),
                         ("metabase", "metabase", "chris"))

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
                        {"commit_sha": "70a3d8cb4a7", "commit_source": "guess"}, {"commit_source": "reflog"},
                        {"commit_sha": "70a3d8cb4a7"}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.report(**changes)

    def test_repository_url_credentials_are_dropped(self):
        result = self.report(repository_url="https://chris:ghp_secret@github.com/metabase/metabase.git?token=x")
        report = self.store.get_papercut(result["papercut"]["id"])["reports"][0]
        self.assertEqual((report["repository_url"], report["payload"]["repository_url"]),
                         ("https://github.com/metabase/metabase.git",) * 2)
        self.assertNotIn("ghp_secret", json.dumps(report))
        # An @ in the query or fragment is not user info.
        self.assertEqual(server.public_url("https://host?token=user@secret"), "https://host")
        self.assertEqual(server.public_url("https://host/repo#user@secret"), "https://host/repo")

    def test_non_ascii_titles_keep_their_own_fingerprints(self):
        first = self.store.ingest({**self.sample, "report_id": "a", "title": "Ошибка сборки", "path": ""})
        second = self.store.ingest({**self.sample, "report_id": "b", "title": "Сбой тестов", "path": ""})
        emoji = self.store.ingest({**self.sample, "report_id": "c", "title": "🔥", "path": ""})
        self.assertEqual(len({r["papercut"]["id"] for r in (first, second, emoji)}), 3)
        # ASCII titles group as before: case and punctuation don't matter.
        self.assertEqual(server.normalized("Agent-Misses the_build!"), "agent misses the build")

    def test_category_is_unclassified_until_a_report_or_triage_sets_it(self):
        papercut_id = self.store.ingest(self.sample)["papercut"]["id"]
        self.assertIsNone(self.store.get_papercut(papercut_id)["category"])
        self.report(category="tooling")
        self.report(category="documentation")
        self.report(category="documentation")
        papercut = self.store.get_papercut(papercut_id)
        self.assertEqual((papercut["category"], papercut["category_votes"]),
                         ("tooling", {"documentation": 2, "tooling": 1}))

    def test_owner_and_severity_come_from_the_first_report_that_sends_them(self):
        papercut_id = self.store.ingest(self.sample)["papercut"]["id"]
        self.report(details={"owner": "repo-tooling", "severity": "urgent"})
        self.report(owner="third-party", severity="high")
        papercut = self.store.get_papercut(papercut_id)
        self.assertEqual((papercut["owner"], papercut["severity"]), ("repo-tooling", "high"))
        for key in ("owner", "severity"):
            with self.subTest(key), self.assertRaisesRegex(ValueError, f"{key} must be one of"):
                self.report(**{key: "someone"})

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
        # The same instant in another offset reads the same changes; a feed ignores the page size.
        shifted = server.datetime.fromisoformat(cursor).astimezone(server.timezone(server.timedelta(hours=-4)))
        self.assertEqual(len(self.store.list_papercuts({"since": shifted.isoformat(), "limit": "1"})["papercuts"]), 2)
        for bad in ("2026-09-01", "2026-09-01T00:00:00"):
            with self.subTest(bad), self.assertRaises(ValueError):
                self.store.list_papercuts({"since": bad})

    def test_agents_sort(self):
        one, both = self.papercut("One agent", agent="claude"), self.papercut("Both agents", agent="claude")
        self.report(title="Both agents", fingerprint="Both agents", agent="codex")
        self.assertEqual([p["id"] for p in self.store.list_papercuts({"sort": "agents"})["papercuts"]], [both, one])


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

    def test_report_in_the_resolution_second_reopens(self):
        papercut_id = self.papercut("Trap", observed_at="2026-09-01")
        self.store.update_papercut(papercut_id, {"status": "resolved"})
        resolved_at = self.store.get_papercut(papercut_id)["status_changed_at"]
        same_second = resolved_at[:19] + "Z"
        self.assertTrue(self.report(title="Trap", fingerprint="Trap", observed_at=same_second)["reopened"])

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
    def test_candidates_put_the_same_path_then_the_closest_wording_first(self):
        this = self.papercut("Git replay leaves worktree index stale", description="Moving the branch ref")
        close = self.papercut("Git replay leaves the worktree index stale", description="Moving a branch ref")
        far = self.papercut("Kondo cache hides lint warnings in CI", description="Cold cache")
        same_path = self.papercut("Unrelated wording", path="src/replay.clj")
        self.store.update_papercut(this, {"path": "src/replay.clj"})
        self.assertEqual([c["id"] for c in self.store.candidates(this)["candidates"]], [same_path, close, far])
        # A pair a person decided is not judged again.
        self.store.unrelate(this, far, {})
        self.assertEqual([c["id"] for c in self.store.candidates(this, limit=1)["candidates"]], [same_path])
        self.assertNotIn(far, [c["id"] for c in self.store.candidates(this)["candidates"]])

    def test_suggestions_replace_the_ai_view_but_keep_decisions(self):
        this, duplicate, related, rejected, manual = (self.papercut(title) for title in "ABCDE")
        self.store.unrelate(this, rejected, {"actor": "chris"})
        self.store.relate(this, {"papercut_id": manual, "actor": "chris"})
        papercut = self.store.suggest(this, {"model": "jev-1", "suggestions": [
            {"papercut_id": related, "verdict": "related", "score": 0.7},
            {"papercut_id": duplicate, "verdict": "duplicate", "score": 0.9, "reason": "Same trap"},
            {"papercut_id": rejected, "verdict": "duplicate", "score": 0.99},
            {"papercut_id": manual, "verdict": "duplicate", "score": 0.99}]})
        self.assertEqual([(r["id"], r["source"], r["verdict"]) for r in papercut["related"]],
                         [(manual, "manual", None), (duplicate, "suggested", "duplicate"),
                          (related, "suggested", "related")])
        self.assertEqual((papercut["related"][1]["reason"], papercut["related"][1]["model"]), ("Same trap", "jev-1"))
        # The other side lists the suggestion, and judging it again replaces the pair.
        self.assertEqual([r["id"] for r in self.store.get_papercut(duplicate)["related"]], [this])
        self.store.suggest(duplicate, {"suggestions": []})
        self.assertEqual([r["id"] for r in self.store.get_papercut(this)["related"]], [manual, related])
        # Accepting a suggestion makes it a person's decision.
        self.store.relate(this, {"papercut_id": related})
        self.assertEqual([(r["source"], r["verdict"]) for r in self.store.get_papercut(this)["related"]],
                         [("manual", None), ("manual", None)])

    def test_suggestions_replace_only_the_pairs_judged(self):
        a, b, c = (self.papercut(title) for title in "ABC")
        self.store.suggest(a, {"judged": [b], "suggestions": [{"papercut_id": b, "verdict": "related"}]})
        # B's own run didn't look at A, so the pair A's run found stays.
        self.store.suggest(b, {"judged": [c], "suggestions": []})
        self.assertEqual([r["id"] for r in self.store.get_papercut(b)["related"]], [a])
        # Judging A again, and not finding the pair, drops it.
        self.store.suggest(b, {"judged": [a, c], "suggestions": []})
        self.assertEqual(self.store.get_papercut(b)["related"], [])
        with self.assertRaises(ValueError):
            self.store.suggest(a, {"judged": ["b"], "suggestions": []})

    def test_suggestions_are_validated(self):
        this, other = self.papercut("A"), self.papercut("B")
        elsewhere = self.papercut("C", repository="another")
        for payload in ({}, {"suggestions": [{"papercut_id": other}]},
                        {"suggestions": [{"papercut_id": other, "verdict": "same"}]},
                        {"suggestions": [{"papercut_id": other, "verdict": "related", "score": 2}]},
                        {"suggestions": [{"papercut_id": this, "verdict": "related"}]},
                        {"suggestions": [{"papercut_id": elsewhere, "verdict": "related"}]}):
            with self.subTest(payload), self.assertRaises(ValueError):
                self.store.suggest(this, payload)
        with self.assertRaises(server.NotFound):
            self.store.suggest(this, {"suggestions": [{"papercut_id": 99, "verdict": "related"}]})

    def test_a_papercut_merged_since_it_was_judged_is_skipped(self):
        this, merged, target = self.papercut("A"), self.papercut("B"), self.papercut("C")
        self.store.merge(merged, {"into": target})
        papercut = self.store.suggest(this, {"suggestions": [{"papercut_id": merged, "verdict": "duplicate"}]})
        self.assertEqual(papercut["related"], [])

    def test_only_changed_verdicts_mark_papercuts_changed(self):
        first, second, third = self.papercut("First"), self.papercut("Second"), self.papercut("Third")
        cursor = self.store.list_papercuts()["cursor"]
        self.store.suggest(first, {"suggestions": [{"papercut_id": second, "verdict": "duplicate", "score": 0.8}]})
        self.assertEqual({p["id"] for p in self.store.list_papercuts({"since": cursor})["papercuts"]}, {first, second})
        # The same verdict with a new score is not news.
        cursor = self.store.list_papercuts()["cursor"]
        self.store.suggest(first, {"suggestions": [{"papercut_id": second, "verdict": "duplicate", "score": 0.7}]})
        self.assertEqual(self.store.list_papercuts({"since": cursor})["papercuts"], [])
        cursor = self.store.list_papercuts()["cursor"]
        self.store.suggest(first, {"suggestions": [{"papercut_id": third, "verdict": "related"}]})
        self.assertEqual({p["id"] for p in self.store.list_papercuts({"since": cursor})["papercuts"]},
                         {first, second, third})

    def test_merge_marks_related_papercuts_changed(self):
        first, target, neighbour = self.papercut("First"), self.papercut("Target"), self.papercut("Neighbour")
        self.store.relate(first, {"papercut_id": neighbour})
        cursor = self.store.list_papercuts()["cursor"]
        self.store.merge(first, {"into": target})
        self.assertIn(neighbour, [p["id"] for p in self.store.list_papercuts({"since": cursor})["papercuts"]])

    def test_title_and_status_changes_mark_related_papercuts_changed(self):
        first, second = self.papercut("First trap"), self.papercut("Second trap")
        self.store.relate(first, {"papercut_id": second})
        for change in ({"title": "Renamed trap"}, {"status": "resolved"}):
            with self.subTest(change):
                cursor = self.store.list_papercuts()["cursor"]
                self.store.update_papercut(first, change)
                self.assertIn(second, [p["id"] for p in self.store.list_papercuts({"since": cursor})["papercuts"]])

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


class AssessmentTest(StoreCase):
    def test_only_a_changed_verdict_is_an_event(self):
        papercut_id = self.papercut("Trap")
        first = self.store.assess(papercut_id, {"verdict": "not_ready", "evidence_score": 0.2, "actor": "dispatcher",
                                                "inputs": {"report_count": 1}, "model": "jev-1.13.0"})
        self.assertEqual((first["verdict"], first["inputs"], first["model"]), ("not_ready", {"report_count": 1}, "jev-1.13.0"))
        cursor = self.store.list_papercuts()["cursor"]
        self.store.assess(papercut_id, {"verdict": "not_ready", "evidence_score": 0.3})
        self.assertEqual(self.store.list_papercuts({"since": cursor})["papercuts"], [])
        self.store.assess(papercut_id, {"verdict": "ready", "fixability_score": 2.4, "fixability_confidence": 0.8,
                                        "reason": "Three reporters; small local change"})
        self.assertEqual([p["id"] for p in self.store.list_papercuts({"since": cursor})["papercuts"]], [papercut_id])
        papercut = self.store.get_papercut(papercut_id)
        self.assertEqual((papercut["assessment"]["verdict"], papercut["assessment"]["fixability_confidence"]), ("ready", 0.8))
        self.assertEqual([(e["kind"], e["old_value"], e["new_value"]) for e in papercut["events"]],
                         [("assessed", None, "not_ready"), ("assessed", "not_ready", "ready")])

    def test_rejects_malformed_assessments(self):
        papercut_id = self.papercut("Trap")
        for bad in ({}, {"verdict": "maybe"}, {"verdict": "ready", "fixability_confidence": 1.5},
                    {"verdict": "ready", "evidence_score": "high"}, {"verdict": "ready", "inputs": [1]},
                    {"verdict": "ready", "score": 1}):
            with self.subTest(bad), self.assertRaises(ValueError):
                self.store.assess(papercut_id, bad)
        with self.assertRaises(server.NotFound):
            self.store.assess(999, {"verdict": "ready"})


class DispatchTest(StoreCase):
    def advance(self, dispatch_id, *states):
        for state in states:
            dispatch = self.store.update_dispatch(dispatch_id, {"state": state, "actor": "dispatcher"})
        return dispatch

    def test_claim_moves_papercut_to_investigating(self):
        papercut_id = self.papercut("Trap")
        assessment = self.store.assess(papercut_id, {"verdict": "ready"})
        dispatch = self.store.claim(papercut_id, {"actor": "dispatcher", "assessment_id": assessment["id"]})
        self.assertEqual((dispatch["state"], dispatch["assessment_id"]), ("claimed", assessment["id"]))
        papercut = self.store.get_papercut(papercut_id)
        self.assertEqual((papercut["status"], [d["id"] for d in papercut["dispatches"]]), ("investigating", [dispatch["id"]]))
        self.assertEqual([(e["kind"], e["new_value"]) for e in papercut["events"]][-2:],
                         [("dispatched", str(dispatch["id"])), ("status", "investigating")])

    def test_claim_conflicts(self):
        papercut_id = self.papercut("Trap")
        self.store.claim(papercut_id, {})
        with self.assertRaisesRegex(server.ConflictError, "in progress"):
            self.store.claim(papercut_id, {})
        for status in ("resolved", "wontfix"):
            other = self.papercut(f"Trap {status}")
            self.store.update_papercut(other, {"status": status})
            with self.subTest(status), self.assertRaisesRegex(server.ConflictError, status):
                self.store.claim(other, {})
        source, target = self.papercut("Source"), self.papercut("Target")
        self.store.merge(source, {"into": target})
        with self.assertRaisesRegex(server.ConflictError, "merged into"):
            self.store.claim(source, {})
        with self.assertRaisesRegex(ValueError, "not an assessment"):
            self.store.claim(target, {"assessment_id": 999})

    def test_concurrent_claims_start_one_dispatch(self):
        papercut_id = self.papercut("Trap")

        def claim(_):
            try:
                return self.store.claim(papercut_id, {})["id"]
            except server.ConflictError:
                return None

        with ThreadPoolExecutor(max_workers=8) as pool:
            claimed = [result for result in pool.map(claim, range(8)) if result is not None]
        self.assertEqual(len(claimed), 1)

    def test_states_only_move_forward(self):
        dispatch_id = self.store.claim(self.papercut("Trap"), {})["id"]
        for state in ("running", "pr_opened", "done"):
            with self.subTest(state), self.assertRaises(ValueError):
                self.store.update_dispatch(dispatch_id, {"state": state})
        dispatch = self.store.update_dispatch(dispatch_id, {"state": "linear_created", "linear_issue_id": "HACK-1",
                                                            "linear_url": "https://linear.app/metabase/issue/HACK-1"})
        self.assertEqual((dispatch["state"], dispatch["linear_issue_id"]), ("linear_created", "HACK-1"))
        # Resending the current state is a retry, not a move.
        self.assertEqual(self.store.update_dispatch(dispatch_id, {"state": "linear_created"})["updated_at"],
                         dispatch["updated_at"])
        with self.assertRaises(ValueError):
            self.store.update_dispatch(dispatch_id, {"state": "claimed"})
        dispatch = self.advance(dispatch_id, "running", "pr_opened")
        with self.assertRaises(ValueError):
            self.store.update_dispatch(dispatch_id, {"state": "failed"})
        # Links and cost can still be recorded on a finished dispatch.
        dispatch = self.store.update_dispatch(dispatch_id, {"pr_url": "https://github.com/metabase/metabase/pull/1",
                                                            "cost_usd": 1.25})
        self.assertEqual((dispatch["state"], dispatch["cost_usd"]), ("pr_opened", 1.25))
        for bad in ({}, {"actor": "x"}, {"cost_usd": -1}, {"pr_url": 3}, {"owner": "x"}):
            with self.subTest(bad), self.assertRaises(ValueError):
                self.store.update_dispatch(dispatch_id, bad)
        with self.assertRaises(server.NotFound):
            self.store.update_dispatch(999, {"state": "failed"})

    def test_final_state_hands_papercut_back(self):
        expected = {"pr_opened": "investigating", "already_fixed": "resolved", "needs_human": "open",
                    "not_reproducible": "open", "failed": "open"}
        for state, status in expected.items():
            with self.subTest(state):
                papercut_id = self.papercut(f"Trap {state}")
                dispatch_id = self.store.claim(papercut_id, {})["id"]
                self.advance(dispatch_id, *(("failed",) if state == "failed" else ("linear_created", "running", state)))
                self.assertEqual(self.store.get_papercut(papercut_id)["status"], status)
        # A papercut can be dispatched again once its dispatch has finished.
        papercut_id = self.papercut("Trap needs_human")
        self.assertEqual(self.store.claim(papercut_id, {})["state"], "claimed")

    def test_final_state_keeps_a_status_someone_else_set(self):
        papercut_id = self.papercut("Trap")
        dispatch_id = self.store.claim(papercut_id, {})["id"]
        self.store.update_papercut(papercut_id, {"status": "wontfix", "actor": "chris"})
        self.advance(dispatch_id, "failed")
        self.assertEqual(self.store.get_papercut(papercut_id)["status"], "wontfix")

    def test_merge_moves_an_active_dispatch(self):
        source, target = self.papercut("Source"), self.papercut("Target")
        dispatch_id = self.store.claim(source, {})["id"]
        merged = self.store.merge(source, {"into": target})
        self.assertEqual([d["id"] for d in merged["dispatches"]], [dispatch_id])
        busy_a, busy_b = self.papercut("A"), self.papercut("B")
        self.store.claim(busy_a, {})
        self.store.claim(busy_b, {})
        with self.assertRaisesRegex(server.ConflictError, "both have a dispatch"):
            self.store.merge(busy_a, {"into": busy_b})

    def test_list_filters_by_state(self):
        first = self.store.claim(self.papercut("First"), {})["id"]
        second = self.store.claim(self.papercut("Second"), {})["id"]
        self.advance(second, "failed")
        self.assertEqual([d["id"] for d in self.store.list_dispatches({"state": "active"})], [first])
        self.assertEqual([(d["id"], d["title"]) for d in self.store.list_dispatches({"state": "failed"})],
                         [(second, "Second")])
        self.assertEqual(len(self.store.list_dispatches()), 2)
        with self.assertRaises(ValueError):
            self.store.list_dispatches({"state": "stuck"})


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

    def test_v5_repository_urls_lose_credentials(self):
        db = sqlite3.connect(self.path, isolation_level=None)
        db.row_factory = sqlite3.Row
        for number, step in enumerate(server.MIGRATIONS[:5], 1):
            step(db)
            db.execute(f"PRAGMA user_version = {number}")
        db.execute("""INSERT INTO papercuts (id, repository, title, description, path, first_seen, last_seen, updated_at)
                      VALUES (1, 'metabase', 'T', '', '', '2026-09-01', '2026-09-01', '2026-09-01')""")
        leaked = "https://chris:ghp_secret@github.com/metabase/metabase.git"
        # Ingestion trimmed the column but stored the request body as sent.
        db.execute("""INSERT INTO reports (id, papercut_id, repository, reporter, report_id, fingerprint, title,
                      description, path, payload, received_at, repository_url) VALUES (1, 1, 'metabase', 'r', 'r1', 'f',
                      'T', '', '', ?, '2026-09-01', ?)""", (json.dumps({"repository_url": f"\t{leaked}\n", "title": "T"}),
                                                            leaked))
        db.close()
        report = server.Store(self.path).get_papercut(1)["reports"][0]
        self.assertEqual((report["repository_url"], report["payload"]),
                         ("https://github.com/metabase/metabase.git",
                          {"repository_url": "https://github.com/metabase/metabase.git", "title": "T"}))

    def test_v9_word_overlap_suggestions_are_dropped_and_decisions_kept(self):
        db = sqlite3.connect(self.path, isolation_level=None)
        db.row_factory = sqlite3.Row
        for number, step in enumerate(server.MIGRATIONS[:9], 1):
            step(db)
            db.execute(f"PRAGMA user_version = {number}")
        db.execute("""INSERT INTO papercuts (id, repository, title, description, path, first_seen, last_seen, updated_at)
                      VALUES (1, 'metabase', 'A', '', '', '2026-09-01', '2026-09-01', '2026-09-01'),
                             (2, 'metabase', 'B', '', '', '2026-09-01', '2026-09-01', '2026-09-01'),
                             (3, 'metabase', 'C', '', '', '2026-09-01', '2026-09-01', '2026-09-01')""")
        db.execute("""INSERT INTO relations (repository, papercut_a, papercut_b, source, score, updated_at)
                      VALUES ('metabase', 1, 2, 'suggested', 0.5, '2026-09-01'),
                             ('metabase', 1, 3, 'manual', NULL, '2026-09-01')""")
        db.close()
        self.assertEqual([(r["id"], r["source"], r["verdict"]) for r in server.Store(self.path).get_papercut(1)["related"]],
                         [(3, "manual", None)])

    def test_v4_owner_and_severity_are_backfilled_and_events_kept(self):
        db = sqlite3.connect(self.path, isolation_level=None)
        db.row_factory = sqlite3.Row
        for number, step in enumerate(server.MIGRATIONS[:4], 1):
            step(db)
            db.execute(f"PRAGMA user_version = {number}")
        db.execute("""INSERT INTO papercuts (id, repository, title, description, path, first_seen, last_seen, updated_at)
                      VALUES (1, 'metabase', 'Scanned', '', '', '2026-09-01', '2026-09-02', '2026-09-23'),
                             (2, 'metabase', 'Imported', '', '', '2026-09-01', '2026-09-01', '2026-09-23')""")
        payloads = (
            (1, 1, "2026-09-02", {"details": {"owner": "third-party", "severity": "low"}}),
            (2, 1, "2026-09-01", {"details": {"owner": "not-an-owner", "severity": "high"}}),
            (3, 1, "2026-09-03", {"details": {"owner": "repo-code"}}),
            (4, 2, "2026-09-01", {"transcript": "/p/abc.jsonl"}),
        )
        for id_, papercut_id, observed_at, payload in payloads:
            db.execute("""INSERT INTO reports (id, papercut_id, repository, reporter, report_id, fingerprint, title,
                          description, path, payload, received_at, observed_at)
                          VALUES (?, ?, 'metabase', 'chris', ?, ?, '', '', '', ?, '2026-09-23', ?)""",
                       (id_, papercut_id, f"r{id_}", f"f{papercut_id}", json.dumps(payload), observed_at))
        db.execute("""INSERT INTO events (papercut_id, at, actor, kind, new_value)
                      VALUES (1, '2026-09-23', 'chris', 'status', 'investigating')""")
        db.close()
        store = server.Store(self.path)
        scanned, imported = store.get_papercut(1), store.get_papercut(2)
        # The earliest report with a valid value wins for each field on its own.
        self.assertEqual((scanned["owner"], scanned["severity"]), ("third-party", "high"))
        self.assertEqual((imported["owner"], imported["severity"]), (None, None))
        self.assertEqual([(e["kind"], e["actor"]) for e in scanned["events"]], [("status", "chris")])
        self.assertEqual((scanned["assessment"], scanned["dispatches"]), (None, []))
        self.assertEqual(store.assess(1, {"verdict": "ready"})["verdict"], "ready")

    def test_migration_runs_once(self):
        self.build_v1()
        server.Store(self.path)
        store = server.Store(self.path)
        self.assertEqual(store.get_papercut(1)["report_count"], 1)


class HttpCase(unittest.TestCase):
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


class HttpTest(HttpCase):
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
        self.assertEqual(self.call("GET", f"/?since={cursor}")[0], 200)

    def test_assessment_and_dispatch_routes(self):
        papercut_id = self.report("r1")[1]["papercut"]["id"]
        status, assessment, _ = self.call("POST", f"/api/papercuts/{papercut_id}/assessments", {"verdict": "ready"})
        self.assertEqual((status, assessment["verdict"]), (201, "ready"))
        self.assertEqual(self.call("POST", f"/api/papercuts/{papercut_id}/assessments", {"verdict": "soon"})[0], 400)
        status, dispatch, _ = self.call("POST", f"/api/papercuts/{papercut_id}/dispatch")
        self.assertEqual((status, dispatch["state"]), (201, "claimed"))
        self.assertEqual(self.call("POST", f"/api/papercuts/{papercut_id}/dispatch", {"actor": "other"})[0], 409)
        path = f"/api/dispatches/{dispatch['id']}"
        self.assertEqual(self.call("PATCH", path, {"state": "pr_opened"})[0], 400)
        status, body, _ = self.call("PATCH", path, {"state": "linear_created", "linear_issue_id": "HACK-1"})
        self.assertEqual((status, body["linear_issue_id"]), (200, "HACK-1"))
        self.assertEqual(self.call("GET", path)[1]["state"], "linear_created")
        self.assertEqual([d["id"] for d in self.call("GET", "/api/dispatches?state=active")[1]], [dispatch["id"]])
        self.assertEqual(self.call("GET", "/api/dispatches/999")[0], 404)
        self.assertEqual(self.call("PATCH", "/api/dispatches/999", {"state": "failed"})[0], 404)
        self.assertEqual(self.call("GET", f"/papercuts/{papercut_id}")[0], 200)

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

    def test_about_page_is_served_and_linked_from_every_page(self):
        status, body, response = self.call("GET", "/about")
        self.assertEqual((status, response.getheader("Content-Type")), (200, "text/html; charset=utf-8"))
        self.assertIn("How a sighting becomes a papercut", body)
        self.assertIn("<a class='about-link' href='/about'>What? How?</a>", self.call("GET", "/")[1])

    def test_relation_delete_rejects_pair(self):
        a = self.report("r1", "Git replay leaves worktree index stale")[1]["papercut"]["id"]
        b = self.report("r2", "Git replay leaves the worktree index stale")[1]["papercut"]["id"]
        status, body, _ = self.call("GET", f"/api/papercuts/{b}/candidates?limit=5")
        self.assertEqual((status, [c["id"] for c in body["candidates"]]), (200, [a]))
        status, body, _ = self.call("POST", f"/api/papercuts/{b}/suggestions",
                                    {"model": "jev-1", "suggestions": [{"papercut_id": a, "verdict": "duplicate"}]})
        self.assertEqual((status, len(body["related"])), (200, 1))
        self.assertIn("possible duplicate", self.call("GET", f"/papercuts/{b}")[1])
        status, body, _ = self.call("DELETE", f"/api/papercuts/{b}/related/{a}")
        self.assertEqual((status, body["related"]), (200, []))

    def test_writes_need_a_json_content_type(self):
        body = {"repository": "metabase", "reporter": "laptop", "report_id": "r1", "title": "Trap"}
        for content_type in ("text/plain", "application/x-www-form-urlencoded"):
            with self.subTest(content_type):
                self.assertEqual(self.call("POST", "/api/reports", body, {"Content-Type": content_type})[0], 415)
        self.assertEqual(self.call("POST", "/api/reports", body,
                                   {"Content-Type": "application/json; charset=utf-8"})[0], 201)

    def test_malformed_link_in_a_comment_keeps_the_page(self):
        papercut_id = self.report("r1")[1]["papercut"]["id"]
        self.call("POST", f"/api/papercuts/{papercut_id}/comments", {"body": "See [x](http://[)"})
        status, page, _ = self.call("GET", f"/papercuts/{papercut_id}")
        self.assertEqual(status, 200)
        self.assertIn("See x", page)

    def test_patch_rejects_null_text(self):
        papercut_id = self.report("r1")[1]["papercut"]["id"]
        for key in ("description", "path", "area"):
            with self.subTest(key):
                self.assertEqual(self.call("PATCH", f"/api/papercuts/{papercut_id}", {key: None})[0], 400)
        status, body, _ = self.call("PATCH", f"/api/papercuts/{papercut_id}", {"title": None})
        self.assertEqual((status, body["error"]), (400, "title must be a nonempty string"))

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

    def test_open_papercut_without_a_dispatch_offers_one(self):
        self.report("r1", "Open")
        self.report("r2", "Closed")
        self.call("PATCH", "/api/papercuts/2", {"status": "wontfix"})
        self.store.assess(1, {"verdict": "ready"})
        _, page, _ = self.call("GET", "/")
        self.assertIn("<button type='button' class='claim-button' data-claim='1'>Claim</button>", page)
        self.assertNotIn("data-claim='2'", page)
        self.assertIn("data-claim='1'>Claim this papercut</button>", self.call("GET", "/papercuts/1")[1])
        self.assertNotIn("data-claim=", self.call("GET", "/papercuts/2")[1])

    def test_dispatch_from_the_page_queues_it_and_shows_its_links(self):
        self.report("r1", "Trap")
        status, dispatch, _ = self.call("POST", "/api/papercuts/1/dispatch", {"actor": "web", "reason": "Dispatched from the web view"})
        self.assertEqual((status, dispatch["actor"], dispatch["state"]), (201, "web", "claimed"))
        self.assertIn("<span class='claimant'>Web is working on this</span>", self.call("GET", "/")[1])
        self.assertIn("claimed by Web", self.call("GET", "/papercuts/1")[1])
        for path in ("/", "/papercuts/1"):
            page = self.call("GET", path)[1]
            self.assertIn(f"data-release='{dispatch['id']}'>Release</button>", page)
            self.assertNotIn("data-claim=", page)

        for state, changes in (("linear_created", {"linear_issue_id": "BOT-12", "linear_url": "https://linear.app/metabase/issue/BOT-12"}),
                               ("running", {"branch": "bot-12-papercut-trap"}),
                               ("pr_opened", {"pr_url": "https://github.com/metabase/metabase/pull/82950", "cost_usd": 2.5,
                                              "reason": "Copy configs first"})):
            self.assertEqual(self.call("PATCH", f"/api/dispatches/{dispatch['id']}", {"state": state, **changes})[0], 200)
        latest = self.call("GET", "/api/papercuts")[1]["papercuts"][0]["dispatch"]
        self.assertEqual(latest, {"id": dispatch["id"], "state": "pr_opened", "actor": "web", "linear_issue_id": "BOT-12",
                                  "linear_url": "https://linear.app/metabase/issue/BOT-12",
                                  "pr_url": "https://github.com/metabase/metabase/pull/82950"})
        linear = "<a href='https://linear.app/metabase/issue/BOT-12' target='_blank' rel='noopener'>BOT-12 ↗</a>"
        pr = "<a href='https://github.com/metabase/metabase/pull/82950' target='_blank' rel='noopener'>PR #82950 ↗</a>"
        for path in ("/", "/papercuts/1"):
            page = self.call("GET", path)[1]
            self.assertIn(linear, page)
            self.assertIn(pr, page)
            self.assertNotIn("data-claim=", page)
        detail = self.call("GET", "/papercuts/1")[1]
        self.assertIn("$2.50", detail)
        self.assertIn("Copy configs first", detail)
        self.assertEqual(self.call("GET", "/api/papercuts/1")[1]["dispatches"][0]["reason"],
                         "Copy configs first\npr_url: https://github.com/metabase/metabase/pull/82950; cost_usd: 2.5")

    def test_a_person_claims_copies_the_prompt_and_releases(self):
        self.call("POST", "/api/reports", {"repository": "metabase", "reporter": "laptop", "report_id": "r1",
                                           "title": "Search fails quietly", "fingerprint": "metabot:abc"})
        status, claim, _ = self.call("POST", "/api/papercuts/1/dispatch", {"claimant": "chris.truter@metabase.com"})
        self.assertEqual((status, claim["state"], claim["actor"]), (201, "running", "chris.truter@metabase.com"))
        page, detail = self.call("GET", "/")[1], self.call("GET", "/papercuts/1")[1]
        self.assertIn("<span class='claimant'>Chris is working on this</span><span class=muted>claimed just now</span>", page)
        self.assertIn("<span class='pill claim-tag'>claimed by Chris · just now</span>", detail)
        for page in (page, detail):
            self.assertIn("data-copy-prompt='1'>Copy prompt</button>", page)
        status, prompt, response = self.call("GET", "/api/papercuts/1/prompt")
        self.assertEqual((status, response.getheader("Content-Type")), (200, "text/plain; charset=utf-8"))
        for line in ("curl -s http://10.193.193.227:8765/api/papercuts/1",
                     "curl -s -X POST http://10.193.193.227:8765/api/papercuts/1/comments -H 'Content-Type: application/json'",
                     f"curl -s -X PATCH http://10.193.193.227:8765/api/dispatches/{claim['id']}",
                     "metabot-demo-break-search", "./bin/test-agent :only"):
            self.assertIn(line, prompt)
        self.assertEqual(self.call("PATCH", f"/api/dispatches/{claim['id']}", {"state": "pr_opened"})[0], 200)
        self.assertEqual(self.call("DELETE", f"/api/dispatches/{claim['id']}")[0], 409)
        second = self.call("POST", "/api/papercuts/2/dispatch", {"claimant": "Tyler"})
        self.assertEqual(second[0], 404)
        self.report("r2", "Other")
        claim = self.call("POST", "/api/papercuts/2/dispatch", {"claimant": "Tyler"})[1]
        self.assertEqual(self.call("DELETE", f"/api/dispatches/{claim['id']}")[1], {"released": claim["id"]})
        self.assertEqual(self.call("GET", "/api/papercuts/2")[1]["status"], "open")
        self.assertIn("data-claim='2'>Claim this papercut</button>", self.call("GET", "/papercuts/2")[1])
        self.assertNotIn("metabot-demo-break-search", self.call("GET", "/api/papercuts/2/prompt")[1])
        self.report("r3", "Third")
        for papercut_id in (3, 2):
            self.call("POST", f"/api/papercuts/{papercut_id}/dispatch", {"claimant": "Tyler"})
        titles = [p["title"] for p in self.call("GET", "/api/papercuts?sort=oldest-claim-first")[1]["papercuts"]]
        self.assertEqual(titles, ["Third", "Other", "Search fails quietly"])

    def test_claim_without_sign_in_names_whoever_runs_the_server(self):
        for report_id in ("r1", "r2", "r3"):
            self.report(report_id, report_id)
        local = f"{server.getpass.getuser()}@{server.socket.gethostname()}"
        self.assertEqual(self.call("POST", "/api/papercuts/1/claim")[1]["actor"], local)
        self.assertEqual(self.call("POST", "/api/papercuts/2/claim", {"claimant": "tyler@metabase.com"})[1]["actor"],
                         "tyler@metabase.com")
        server.os.environ["PAPERCUTS_LOCAL_CLAIMANT"] = "chris@laptop"
        try:
            claim = self.call("POST", "/api/papercuts/3/claim")[1]
        finally:
            del server.os.environ["PAPERCUTS_LOCAL_CLAIMANT"]
        self.assertEqual((claim["actor"], claim["state"]), ("chris@laptop", "running"))
        self.assertIn("<span class='claimant'>Chris is working on this</span>", self.call("GET", "/")[1])

    def test_cancelling_a_queued_dispatch_reopens_the_papercut_for_another(self):
        self.report("r1", "Trap")
        dispatch = self.call("POST", "/api/papercuts/1/dispatch", {"actor": "web"})[1]
        status, cancelled, _ = self.call("PATCH", f"/api/dispatches/{dispatch['id']}",
                                         {"state": "failed", "actor": "web", "reason": "Cancelled from the web view"})
        self.assertEqual((status, cancelled["state"]), (200, "failed"))
        self.assertEqual(self.call("GET", "/api/papercuts/1")[1]["status"], "open")
        page = self.call("GET", "/papercuts/1")[1]
        self.assertIn("data-claim='1'>Claim this papercut</button>", page)
        self.assertIn("Cancelled from the web view", page)

    def test_page_dispatch_needs_the_token_when_the_server_has_one(self):
        self.report("r1", "Trap")
        self.handler.token = "secret"
        self.assertEqual(self.call("POST", "/api/papercuts/1/dispatch", {"actor": "web"})[0], 401)
        self.assertEqual(self.call("POST", "/api/papercuts/1/dispatch", {"actor": "web"},
                                   headers={"Authorization": "Bearer secret"})[0], 201)
        self.assertNotIn("id='api-token'", self.call("GET", "/")[1])

    def test_list_puts_important_papercuts_first_and_shows_fixes(self):
        for report_id in ("r1", "r2", "r3"):
            self.report(report_id, "Loud")
        self.report("r4", "Quiet")
        self.call("POST", "/api/papercuts/2/dispatch", {"actor": "dispatcher"})
        self.assertEqual([(p["title"], p["fix_state"]) for p in self.call("GET", "/api/papercuts")[1]["papercuts"]],
                         [("Quiet", "claimed"), ("Loud", None)])
        _, page, _ = self.call("GET", "/")
        self.assertLess(page.index(">Loud</a>"), page.index(">Quiet</a>"))
        self.assertEqual(page.count("<span class='pill important'"), 1)
        self.assertIn("data-value='unclassified' aria-pressed='true'>unclassified<span class='count'>2</span>", page)
        for categories, total in (("unclassified,tooling", 2), ("tooling", 0), ("none", 0)):
            self.assertEqual(self.call("GET", f"/api/papercuts?category={categories}")[1]["total"], total)

    def test_time_lost_reads_for_people(self):
        self.assertEqual([server.duration(minutes) for minutes in (0.001, 12.4, 60, 90)], ["< 1 min", "12 min", "1 h", "1.5 h"])

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

    def test_reports_collapse_except_the_newest(self):
        for report_id, observed_at in (("old", "2026-09-01"), ("new", "2026-09-02")):
            self.call("POST", "/api/reports", {"repository": "metabase", "reporter": "laptop", "report_id": report_id,
                                               "title": f"{report_id} report", "fingerprint": "trap", "session": "s1",
                                               "observed_at": observed_at})
        _, page, _ = self.call("GET", "/papercuts/1")
        self.assertIn("2026-09-02T00:00:00+00:00 · session s1</p><details open><summary>Report details</summary>"
                      "<p>new report</p>", page)
        self.assertIn("2026-09-01T00:00:00+00:00 · session s1</p><details><summary>Report details</summary>"
                      "<p>old report</p>", page)

    def test_urls_in_report_prose_are_links(self):
        self.call("POST", "/api/reports", {"repository": "metabase", "reporter": "laptop", "report_id": "r1",
                                           "title": "Trap", "description": "See https://github.com/metabase/metabase/pull/1."})
        _, page, _ = self.call("GET", "/papercuts/1")
        self.assertIn("<a href='https://github.com/metabase/metabase/pull/1'>https://github.com/metabase/metabase/pull/1</a>.",
                      page)



class InstallerTest(HttpCase):
    def installer(self, host="ts.metaouch.dev", **env):
        with mock.patch.dict(server.os.environ, env, clear=True):
            status, script, _ = self.call("GET", "/api/install.sh", headers={"Host": host})
        self.assertEqual(status, 200)
        return script

    def test_the_installer_carries_the_servers_key_and_address(self):
        source = server.INSTALLER.read_text()
        self.assertEqual((source.count(server.INSTALLER_KEY), source.count(server.INSTALLER_SERVER)), (1, 1))
        script = self.installer(TYPESAFE_API_KEY="jev_live.abc-123")
        self.assertIn("TYPESAFE_API_KEY='jev_live.abc-123'", script)
        self.assertIn(f"SERVER='http://ts.metaouch.dev:{self.httpd.server_port}'", script)
        self.assertEqual(subprocess.run(["sh", "-n"], input=script, text=True).returncode, 0)

    def test_an_odd_or_loopback_host_becomes_the_tailnet_ip(self):
        for host in ("127.0.0.1:8765", "localhost", "x;touch /tmp/pwned", ""):
            with self.subTest(host):
                self.assertIn(f"SERVER='http://10.193.193.227:{self.httpd.server_port}'",
                              self.installer(host, TYPESAFE_API_KEY="k"))

    def test_without_a_usable_key_the_installer_says_so(self):
        for env in ({}, {"TYPESAFE_API_KEY": ""}, {"TYPESAFE_API_KEY": "it's"}):
            with self.subTest(env):
                self.assertEqual(self.installer(**env), server.NO_KEY_INSTALLER)

if __name__ == "__main__":
    unittest.main()
