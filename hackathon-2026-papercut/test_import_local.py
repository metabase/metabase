import importlib.util
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("import_local", Path(__file__).with_name("import_local.py"))
import_local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(import_local)


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


if __name__ == "__main__":
    unittest.main()
