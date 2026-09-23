import importlib.util
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError, URLError

import github_sync

spec = importlib.util.spec_from_file_location("papercut_server", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

PR = "https://github.com/metabase/metabase/pull/81234"


def github(etag=None, **body):
    response = mock.MagicMock()
    response.__enter__.return_value = response
    response.headers = {"ETag": etag} if etag else {}
    response.read.return_value = json.dumps(body).encode()
    return response


def github_error(code):
    return HTTPError(PR, code, "error", {}, None)


class GitHubSyncTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = server.Store(Path(self.temp.name) / "papercuts.sqlite3")

    def tearDown(self):
        self.temp.cleanup()

    def papercut(self, title):
        return self.store.ingest({"repository": "metabase", "reporter": "chris", "report_id": title, "title": title,
                                  "description": "", "path": ""})["papercut"]["id"]

    def sync(self, *responses, token=None):
        with mock.patch.object(github_sync, "urlopen", side_effect=responses) as urlopen:
            github_sync.check(self.store, token)
        return [call.args[0] for call in urlopen.call_args_list]

    def test_a_comment_links_the_pr_and_moves_the_claim_to_pr_opened(self):
        claimed, unclaimed = self.papercut("Claimed"), self.papercut("Unclaimed")
        dispatch_id = self.store.claim(claimed, {"claimant": "alice"})["id"]
        for papercut_id in (claimed, unclaimed):
            self.store.comment(papercut_id, {"author": "alice-agent", "body": f"Draft PR: {PR}/files"})
        self.assertEqual(self.store.get_dispatch(dispatch_id)["state"], "pr_opened")
        self.assertEqual(self.store.get_dispatch(dispatch_id)["pr_url"], PR)
        self.assertEqual(self.store.get_papercut(claimed)["status"], "investigating")
        self.assertEqual(self.store.get_papercut(unclaimed)["dispatches"], [])
        page = server.papercut_list_html(self.store.list_papercuts(), {})
        self.assertEqual((page.count(">PR opened</span>"), page.count(f"href='{PR}'")), (1, 1))

    def test_a_claim_starts_at_the_pr_linked_before_it(self):
        papercut_id = self.papercut("Fixed already")
        self.store.link_pull_request(papercut_id, {"url": PR})
        self.assertNotIn(PR, server.papercut_list_html(self.store.list_papercuts(), {}))
        self.assertNotIn(PR, server.papercut_html(self.store.get_papercut(papercut_id)))
        self.assertEqual(self.store.get_papercut(papercut_id)["events"], [])
        dispatch = self.store.claim(papercut_id, {"claimant": "andrei"})
        self.assertEqual((dispatch["state"], dispatch["pr_url"]), ("pr_opened", PR))
        page = server.papercut_list_html(self.store.list_papercuts(), {})
        self.assertIn(f"PR opened</span><span class='dispatch-link'><a href='{PR}'", page)
        with self.assertRaises(ValueError):
            self.store.link_pull_request(papercut_id, {"url": "https://example.com/pull/1"})

    def test_the_dispatcher_records_its_own_pr(self):
        papercut_id = self.papercut("Dispatched")
        dispatch_id = self.store.claim(papercut_id, {"actor": "dispatcher"})["id"]
        self.store.comment(papercut_id, {"body": f"Related: {PR}"})
        self.assertEqual(self.store.get_dispatch(dispatch_id)["state"], "claimed")
        for state in ("linear_created", "running", "pr_opened"):
            self.store.update_dispatch(dispatch_id, {"state": state, "pr_url": f"{PR}5"})
        self.assertEqual([pr["url"] for pr in self.store.open_pull_requests()], [PR, f"{PR}5"])

    def test_a_merged_pr_resolves_the_papercut_and_ends_its_dispatch(self):
        claimed, unclaimed = self.papercut("Claimed"), self.papercut("Unclaimed")
        dispatch_id = self.store.claim(claimed, {"claimant": "alice"})["id"]
        for papercut_id in (claimed, unclaimed):
            self.store.comment(papercut_id, {"body": PR})
        self.sync(github(state="closed", merged=True), github(state="closed", merged=True))
        self.assertEqual(self.store.get_dispatch(dispatch_id)["state"], "merged")
        for papercut_id in (claimed, unclaimed):
            papercut = self.store.get_papercut(papercut_id)
            self.assertEqual((papercut["status"], papercut["events"][-1]["actor"], papercut["events"][-1]["body"]),
                             ("resolved", "github", "PR #81234 merged, resolved automatically"))
        self.assertEqual(server.papercut_list_html(self.store.list_papercuts(), {}).count(">PR merged</span>"), 1)
        self.assertEqual(self.sync(), [])

    def test_a_pr_closed_unmerged_leaves_a_comment_and_the_status(self):
        papercut_id = self.papercut("Trap")
        self.store.comment(papercut_id, {"body": PR})
        self.sync(github(state="closed", merged=False))
        papercut = self.store.get_papercut(papercut_id)
        self.assertEqual((papercut["status"], papercut["events"][-1]["body"]), ("open", "PR #81234 closed without merging"))
        self.assertEqual(self.sync(), [])

    def test_an_unchanged_pr_is_asked_about_with_its_etag(self):
        self.store.comment(self.papercut("Trap"), {"body": PR})
        first, = self.sync(github(etag='W/"abc"', state="open"), token="secret")
        self.assertEqual((first.full_url, first.get_header("Authorization"), first.get_header("If-none-match")),
                         ("https://api.github.com/repos/metabase/metabase/pulls/81234", "Bearer secret", None))
        second, = self.sync(github_error(304))
        self.assertEqual((second.get_header("If-none-match"), second.get_header("Authorization")), ('W/"abc"', None))
        self.assertEqual(self.store.open_pull_requests()[0]["state"], "open")

    def test_rate_limits_and_network_errors_wait_for_the_next_round(self):
        for title in ("First", "Second"):
            self.store.comment(self.papercut(title), {"body": PR})
        with mock.patch("sys.stderr"):
            self.assertEqual(len(self.sync(github_error(403))), 1)
            self.assertEqual(len(self.sync(URLError("offline"))), 1)
            self.assertEqual(len(self.sync(github_error(502), github(state="open"))), 2)
            with mock.patch.object(github_sync, "urlopen", side_effect=URLError("offline")) as urlopen:
                self.assertIsNone(github_sync.start(self.store, {"PAPERCUTS_GITHUB_SYNC": "0"}))
        urlopen.assert_not_called()
        self.assertEqual(len(self.store.open_pull_requests()), 2)

    def test_v7_dispatches_keep_their_rows_and_link_their_prs(self):
        path = Path(self.temp.name) / "v7.sqlite3"
        db = sqlite3.connect(path, isolation_level=None)
        db.row_factory = sqlite3.Row
        for number, step in enumerate(server.MIGRATIONS[:7], 1):
            step(db)
            db.execute(f"PRAGMA user_version = {number}")
        db.execute("""INSERT INTO papercuts (id, repository, title, description, path, status, first_seen, last_seen,
                      updated_at) VALUES (1, 'metabase', 'T', '', '', 'investigating', '2026-09-23', '2026-09-23', '2026-09-23')""")
        db.execute("""INSERT INTO dispatches (id, papercut_id, state, actor, pr_url, created_at, updated_at)
                      VALUES (1, 1, 'pr_opened', 'dispatcher', ?, '2026-09-23', '2026-09-23')""", (PR,))
        db.close()
        store = server.Store(path)
        self.assertEqual([pr["url"] for pr in store.open_pull_requests()], [PR])
        self.assertEqual(store.update_dispatch(1, {"state": "merged"})["state"], "merged")
        self.assertEqual(store.get_papercut(1)["status"], "resolved")


if __name__ == "__main__":
    unittest.main()
