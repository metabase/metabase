"""Unit tests for the lightweight agent hook adapter."""

from contextlib import redirect_stdout
import importlib.util
import io
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest import mock


SCRIPT = Path(__file__).with_name("session_scan_hook.py")
SPEC = importlib.util.spec_from_file_location("session_scan_hook", SCRIPT)
hook = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hook)


class SessionScanHookTest(unittest.TestCase):
    def test_scan_command_is_single_session(self):
        session_id = "12345678-1234-1234-1234-123456789abc"
        command = hook.scan_command("codex", session_id, "SessionEnd")
        self.assertEqual(command[1:], ["papercuts-scan-codex", "--session", session_id,
                                        "--min-idle", "0", "--no-subagents", "--jobs", "1"])
        # A session can go on after Stop, so a short last stretch waits for the next turn.
        self.assertEqual(hook.scan_command("codex", session_id, "Stop"), command + ["--hold-short-tail"])
        with self.assertRaises(ValueError):
            hook.scan_command("codex", "anything --rescan", "Stop")
        with self.assertRaises(ValueError):
            hook.scan_command("codex", session_id, "SessionStart")

    def test_custom_server_is_forwarded_and_validated(self):
        session_id = "12345678-1234-1234-1234-123456789abc"
        command = hook.scan_command("claude", session_id, "Stop", "http://127.0.0.1:8766/")
        self.assertEqual(command[-3:], ["--server", "http://127.0.0.1:8766", "--hold-short-tail"])
        for server in ("", "ftp://example.com", "https://example.com/api", "http://localhost:0",
                       "https://user:password@example.com", "https://example.com:bad"):
            with self.subTest(server=server), self.assertRaises(ValueError):
                hook.scan_command("claude", session_id, "Stop", server)

    def test_launch_only_supported_events_and_suppresses_nested_agent(self):
        session_id = "12345678-1234-1234-1234-123456789abc"
        payload = {"hook_event_name": "Stop", "session_id": session_id}
        with TemporaryDirectory() as directory, mock.patch.object(hook, "LOG_DIR", Path(directory)), \
                mock.patch.object(hook.subprocess, "Popen") as popen:
            self.assertTrue(hook.launch("claude", payload))
            self.assertTrue(popen.call_args.kwargs["start_new_session"])
            self.assertEqual(popen.call_args.args[0][-2:], ["--worker", "claude"])
            hook.launch("claude", payload, "http://127.0.0.1:8766")
            self.assertFalse(hook.launch("claude", {**payload, "hook_event_name": "SessionStart"}))
            with mock.patch.dict(hook.os.environ, {"PAPERCUTS_SCAN_HOOK": "1"}):
                self.assertFalse(hook.launch("claude", payload))
            self.assertEqual(popen.call_count, 2)
            # With no saved server, the scan falls back to the scanner's PAPERCUTS_SERVER.
            with hook.pending_path("claude").open("a+") as pending:
                self.assertEqual([e["server"] for e in hook.take_pending(pending)], ["http://127.0.0.1:8766"])

    def test_merged_runs_each_session_once_and_keeps_session_end(self):
        a, b = "12345678-1234-1234-1234-123456789abc", "87654321-1234-1234-1234-123456789abc"
        entries = [{"session": a, "event": "SessionEnd", "server": None},
                   {"session": b, "event": "Stop", "server": None},
                   {"session": a, "event": "Stop", "server": "http://127.0.0.1:8766"}]
        self.assertEqual(hook.merged(entries), [{"session": a, "event": "SessionEnd", "server": "http://127.0.0.1:8766"},
                                                {"session": b, "event": "Stop", "server": None}])

    def test_worker_drains_the_queue_and_leaves_to_a_running_worker(self):
        a, b = "12345678-1234-1234-1234-123456789abc", "87654321-1234-1234-1234-123456789abc"
        with TemporaryDirectory() as directory, mock.patch.object(hook, "LOG_DIR", Path(directory)), \
                mock.patch.object(hook.time, "sleep"), mock.patch.object(hook.subprocess, "call") as call, \
                redirect_stdout(io.StringIO()):
            hook.enqueue("claude", a, "Stop", None)
            with (Path(directory) / "hook-scan.claude.lock").open("a") as running:
                hook.fcntl.flock(running, hook.fcntl.LOCK_EX)
                self.assertEqual(hook.work("claude"), 0)
                call.assert_not_called()
            hook.enqueue("claude", b, "Stop", None)
            hook.enqueue("claude", a, "SessionEnd", None)
            self.assertEqual(hook.work("claude"), 0)
            self.assertEqual([c.args[0][c.args[0].index("--session") + 1] for c in call.call_args_list], [a, b])
            self.assertNotIn("--hold-short-tail", call.call_args_list[0].args[0])
            self.assertEqual(hook.pending_path("claude").read_text(), "")

if __name__ == "__main__":
    unittest.main()
