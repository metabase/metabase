import contextlib
import importlib.util
import io
import sys
import tempfile
import threading
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("import_local", Path(__file__).with_name("import_local.py"))
import_local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(import_local)
server_spec = importlib.util.spec_from_file_location("papercut_server", Path(__file__).with_name("server.py"))
server = importlib.util.module_from_spec(server_spec)
server_spec.loader.exec_module(server)


class ParseTest(unittest.TestCase):
    def test_frontmatter_scalars(self):
        self.assertEqual(import_local.scalar(' "posts \\"-\\" as the body" '), 'posts "-" as the body')
        self.assertEqual(import_local.scalar("'fixed'"), "fixed")
        self.assertEqual(import_local.scalar("'it''s'"), "it's")
        self.assertEqual(import_local.scalar("plain value"), "plain value")
        with self.assertRaises(ValueError):
            import_local.scalar('"\\x41"')

    def test_codex_occurrences_keep_line_ranges(self):
        content = """# Trap

Source: [first](/t/a.jsonl#L10), [again](/t/a.jsonl#L99), [repeat](/t/a.jsonl#L10).

What happened.

## Additional occurrence
- transcript: /t/b.jsonl
  lines: 5-9
  date: 2026-09-01
"""
        writeup = import_local.parse_codex(Path("chris.codex.trap.md"), content)
        self.assertEqual([(o["transcript"], o["lines"], o["observed_at"]) for o in writeup["occurrences"]],
                         [("/t/a.jsonl", "10", None), ("/t/a.jsonl", "99", None), ("/t/b.jsonl", "5-9", "2026-09-01")])

    def test_relative_transcripts_are_read_beside_the_writeup(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / "t.jsonl").write_text('{"timestamp": "2026-09-02T10:00:00Z"}\n')
            self.assertEqual(import_local.transcript_start("t.jsonl", Path(directory)), "2026-09-02T10:00:00Z")
            self.assertIsNone(import_local.transcript_start("missing.jsonl", Path(directory)))



def writeup(title, transcripts, merged_from=None):
    occurrences = "".join(f"  - transcript: /t/{t}.jsonl\n    lines: 1-2\n" for t in transcripts)
    merged = f"merged_from: [{merged_from}]\n" if merged_from else ""
    return f"---\ntitle: {title}\nkind: tool-quirk\n{merged}occurrences:\n{occurrences}---\n\n## Summary\n{title}.\n"


class MergedWriteupImportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        store = server.Store(Path(self.temp.name) / "papercuts.sqlite3")
        handler = type("TestHandler", (server.Handler,), {"store": store, "token": None, "log_message": lambda *a: None})
        self.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.httpd.server_port}"

    def tearDown(self):
        self.httpd.shutdown()
        self.httpd.server_close()
        self.temp.cleanup()

    def import_writeups(self, **writeups):
        directory = Path(self.temp.name) / "writeups"
        directory.mkdir(exist_ok=True)
        for name, content in writeups.items():
            (directory / f"chris.claude.{name}.md").write_text(content)
        argv, sys.argv = sys.argv, ["import_local.py", "--server", self.url, str(directory)]
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                import_local.main()
        finally:
            sys.argv = argv
        return import_local.request(self.url, "GET", "/api/papercuts?limit=500")["papercuts"]

    def test_merged_writeup_lands_on_one_papercut_whatever_the_order(self):
        # The shared occurrence last, and then a writeup whose every occurrence is shared.
        papercuts = self.import_writeups(
            **{"a-old": writeup("Old trap", ["shared"]),
               "b-new": writeup("New trap", ["fresh", "shared"], merged_from="a-old"),
               "c-newer": writeup("Newer trap", ["shared"], merged_from="b-new")})
        self.assertEqual([(len(p["fingerprints"]), p["report_count"]) for p in papercuts], [(3, 2)])


if __name__ == "__main__":
    unittest.main()
