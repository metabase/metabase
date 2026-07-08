---
id: ask-for-sql-clarification
title: Asking for SQL clarification
description: Asking the user a short clarifying question with ask_for_sql_clarification — load to learn when a request is genuinely ambiguous enough to ask vs. when to pick a default and deliver SQL instead.
tools: [ask_for_sql_clarification]
priority: 50
---
Ask the user a short clarifying question when their request is genuinely ambiguous. The `question` text is inserted as a SQL comment at the user's cursor — so this is a small-surface input for *short prose only*, not a delivery channel.

**Use only for:**
- Structural ambiguity where picking wrong would produce a fundamentally different query (e.g. "Top by revenue or order count?", "By customer or by account?").
- Off-topic or non-SQL requests where you need to redirect.

**Do not use for:**
- Delivering SQL. If you have a query ready, call `create_sql_query` (or `edit_sql_query`/`replace_sql_query` for changes to an existing query). Never put a `SELECT` (or any SQL body) in the `question` argument.
- Judgement calls you can resolve yourself. Pick a reasonable default, deliver the query via `create_sql_query`, and flag the assumption in the explanation that accompanies the query.
- Anything discovery (`search`, `read_resource`) can answer.

**Argument:**
- `question` — one short sentence, phrased as a question, no SQL.
