Reset the UX testing session to a clean state.

## Instructions

1. **Close the browser**: Use `mcp__playwright__browser_close` to close any open browser
2. **Clear browser state**: Open a fresh browser and use `mcp__playwright__browser_evaluate` to clear cookies and storage:
   ```javascript
   document.cookie.split(';').forEach(c => document.cookie = c.trim().split('=')[0] + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/');
   localStorage.clear();
   sessionStorage.clear();
   ```
3. **Close the browser again** after clearing
4. **Write a reset marker**: Write the current timestamp to `.bot/uxbot/reset-<timestamp>.txt` where timestamp is `YYYYMMDD-HHMMSS`. This marks the boundary — future `/uxbot-report` calls will only include activity after this point.
5. **Update status**: Write "Waiting for task (reset)" to `.bot/autobot/llm-status.txt`
6. **Tell the user**: "Session reset. Browser cleared, ready for new tasks. Any future reports will only cover activity from this point forward."
