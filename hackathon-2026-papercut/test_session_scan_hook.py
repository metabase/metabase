"""Unit tests for the lightweight agent hook adapter."""

import importlib.util
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
        command = hook.scan_command("codex", session_id)
        self.assertEqual(command[1:], ["papercuts-scan-codex", "--session", session_id,
                                        "--min-idle", "0", "--no-subagents", "--jobs", "1"])
        with self.assertRaises(ValueError):
            hook.scan_command("codex", "anything --rescan")

    def test_launch_only_supported_events_and_suppresses_nested_agent(self):
        session_id = "12345678-1234-1234-1234-123456789abc"
        payload = {"hook_event_name": "Stop", "session_id": session_id}
        with TemporaryDirectory() as directory, mock.patch.object(hook, "LOG_DIR", Path(directory)), \
                mock.patch.object(hook.subprocess, "Popen") as popen:
            self.assertTrue(hook.launch("claude", payload))
            self.assertTrue(popen.call_args.kwargs["start_new_session"])
            self.assertFalse(hook.launch("claude", {**payload, "hook_event_name": "SessionStart"}))
            with mock.patch.dict(hook.os.environ, {"PAPERCUTS_SCAN_HOOK": "1"}):
                self.assertFalse(hook.launch("claude", payload))
            self.assertEqual(popen.call_count, 1)


if __name__ == "__main__":
    unittest.main()
