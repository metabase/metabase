# Vibes in native SQLite questions

With the enterprise sources available, set `MB_VIBES_ENABLED=true` and `MB_VIBES_API_KEY` in the Metabase server
environment. The normal SQLite driver then installs `vibes()`, `vibes_info()`, `vibes_rewrite()`, and the
`RERANK BASED ON VIBES` rewrite on warehouse connections, including pooled connections. No semantic search
index or vec1 extension is needed for these features.

Select any SQLite database in the native SQL editor. For example:

```sql
WITH meetings(description) AS (
  VALUES
    ('Emergency response to a production outage'),
    ('45 minutes to agree that the button should stay blue'),
    ('A kickoff to schedule the pre-kickoff alignment session'),
    ('Someone shares a spreadsheet and reads every cell aloud')
)
SELECT description
FROM meetings
RERANK BASED ON VIBES('this meeting could have been an email') DESC
LIMIT 3;
```

`RERANK` scores the full selected rows together, with requests chunked at 100 candidates. A trailing `LIMIT`
applies after scoring; constrain the input query when you want to score fewer candidates. The default direction
is `DESC`. Bare `RERANK BASED ON VIBES` reads its prompt from a `user_prompt` CTE with a `prompt` column.

The scalar form also works:

```sql
SELECT description
FROM meetings
ORDER BY vibes('this meeting could have been an email', description) DESC;
```

Here `meetings` represents your table (or the CTE above). This form makes a separate request for each distinct
description on a cold cache. Both forms use the same five-minute score cache. Failed scoring returns `NULL` and
is never cached, so running the query again asks Jev again. Within one `RERANK` statement the rows share a single
attempt; a hand-written `ORDER BY vibes(...)` retries once per row when Jev is failing. Jev can take tens of
seconds on a cold start, so raise `MB_VIBES_TIMEOUT_MS` (default 2000) if scores keep coming back `NULL`.
Use `SELECT vibes_info()` to check the enabled flag, model, and cache statistics, including `failures`.

Warehouse queries ask Jev whether each row fits the prompt's vibe. The semantic search store asks a different
question: whether a search result is what someone searching for the prompt would open.

When disabled, fresh warehouse connections get neither the functions nor the rewrite. Functions already
registered on a pooled connection remain present but return `NULL` for scoring while disabled. The internal
semantic search store continues to install its functions independently. This hook does not load vec1 for
warehouse queries against vector virtual tables.

## RERANK anywhere: the patched SQLite engine

The rewrite above only handles a clause at the end of the whole statement. The optional patched SQLite library in
`native/sqlite-vibes` parses `RERANK BASED ON VIBES` itself, so the clause also works in subqueries, CTE bodies,
compound selects, and `INSERT ... SELECT`, and with a prompt that references an outer query. Build it with
`native/sqlite-vibes/build.sh` and start Metabase with the `:sqlite-vibes` deps alias. When SQLite reports
`sqlite_compileoption_used('VIBES_RERANK')`, the connection hook registers the functions and skips the rewrite.
Otherwise it falls back to the rewrite. See `native/sqlite-vibes/README.md`.

## Other databases

The Jev HTTP client, prompt construction, and scoring cache can be shared. The function registration uses
`org.sqlite.Function`, and the rewrite emits SQLite JSON functions and materialized CTEs. Other database types
are not enabled by this hook.

H2 could use a Java function alias, with the scorer available in the H2 engine's JVM, plus an H2-specific rewrite.
Postgres would need a server-side function/extension and a dialect-specific rewrite to support `vibes()` in
arbitrary SQL expressions. Registering a Java callback on a JDBC client connection does not install a Postgres
function.

An alternative for portable `RERANK` support is to run the candidate query on its original database, batch-score
the returned rows in Metabase, then sort and apply the final limit/offset. That requires result buffering,
candidate bounds, and cancellation handling, and does not by itself support arbitrary SQL expressions using
`vibes()`.
