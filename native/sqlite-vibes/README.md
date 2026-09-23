# sqlite-vibes: `RERANK BASED ON VIBES` in the SQLite grammar

A patch to SQLite 3.50.3 that makes `RERANK BASED ON VIBES` part of the SQL grammar, plus a build of the native
library for the pinned sqlite-jdbc 3.50.3.0. With it, the clause works anywhere a `SELECT` can appear: subqueries in
`FROM`, `WHERE`, and `IN`, CTE bodies, compound selects, `INSERT ... SELECT`, `CREATE TABLE ... AS`, and correlated
subqueries whose prompt references an outer column.

This is optional. With the stock sqlite-jdbc library, Metabase keeps rewriting a trailing clause on the JDBC
connection (`vibes.rewrite`, top-level statements only). The connection hook asks the engine once per JVM
(`sqlite_compileoption_used('VIBES_RERANK')`) and skips the rewrite when the engine parses the clause itself.

```
select-stmt  RERANK BASED ON VIBES [ ( prompt-expr ) ] [ ASC | DESC ]  [ LIMIT n [ OFFSET m ] ]
```

The clause comes after `ORDER BY` (which becomes the tiebreak) and before `LIMIT` (which applies to the reranked
order). The default direction is `DESC`. Bare `VIBES` means `(SELECT prompt FROM user_prompt)`.

## Build

```sh
native/sqlite-vibes/build.sh          # ~1 min; add --test to also run SQLite's test harness on the patch
```

This needs curl, unzip, git, make, the Xcode command-line tools, and a JDK. The `--test` option also needs
`tclsh` 9 (`brew install tcl-tk`). The script downloads the pinned `sqlite-src-3500300.zip` and checks its
SHA-256. It applies `patches/0001-rerank-based-on-vibes.patch`, regenerates the parser and amalgamation, and
builds xerial's `make native` from the tag `3.50.3.0` with xerial's release compile flags. The build writes the
following files to the ignored `out/` directory:

| File | Description |
|---|---|
| `out/darwin-aarch64/libsqlitejdbc.dylib` | Drop-in native library for sqlite-jdbc |
| `out/sqlite3-vibes` | `sqlite3` shell |
| `out/fakevibes.dylib` | Deterministic `vibes()` for the shell (3 or 4 arguments), which returns `roster[id].score` |

```sh
out/sqlite3-vibes
sqlite> .load out/fakevibes
sqlite> WITH t(name, score) AS (VALUES ('a', 0.1), ('b', 0.9))
   ...> SELECT * FROM t RERANK BASED ON VIBES('anything');
b|0.9
a|0.1
```

## Run Metabase on it

sqlite-jdbc reads its library location once, when the class is initialized, so it must be set with a JVM flag:

```sh
clojure -M:dev:ee:ee-dev:drivers:drivers-dev:sqlite-vibes ...      # the :sqlite-vibes alias in deps.edn
# or, for any JVM (test-agent, uberjar):
JDK_JAVA_OPTIONS='-Dorg.sqlite.lib.path=native/sqlite-vibes/out/darwin-aarch64 -Dorg.sqlite.lib.name=libsqlitejdbc.dylib'
```

The library is JVM-wide, so the Sample Database also runs on it. It is the same 3.50.3 core with a superset of
the grammar. At startup the log reads `vibes: RERANK BASED ON VIBES is parsed by the SQLite engine`. The message
appears on the first vibes-enabled SQLite connection.

**Reverting to stock:** Drop the alias or the flags. If the path doesn't exist, sqlite-jdbc silently loads its
bundled library, so a missing build also falls back to the JDBC rewrite.

## How it works

The patch changes the following files. Under `src/`, it changes `parse.y`, `tokenize.c`, `select.c`,
`resolve.c`, `expr.c`, and `sqliteInt.h`. Under `tool/`, it changes `mkkeywordhash.c` and `mkctimec.tcl`.

- **Grammar.** `oneselect ::= SELECT ... orderby_opt rerank_opt limit_opt`. `BASED` and `VIBES` are fallback
  keywords, so they remain usable as identifiers. `RERANK` is a keyword only when `BASED` follows it. The tokenizer
  checks this, the same way SQLite handles `WINDOW`, `OVER`, and `FILTER`. Because a fallback keyword would let
  `FROM t rerank ...` read as a table alias, `RERANK` is not a fallback keyword.
- **Desugaring, at parse time.** The rule that completes a (possibly compound) select turns
  `S RERANK BASED ON VIBES(P) dir LIMIT L` into:
  ```sql
  [WITH ... moved from S]
  SELECT * FROM (SELECT row_number() OVER () AS __vibes_id, * FROM (S)) AS __vibes_cand
  ORDER BY vibes(P, __vibes_id, <roster>, <nonce>) dir, __vibes_id ASC
  LIMIT L
  ```
- **Roster, at `*` expansion.** In `selectExpander()`, once the column names are known, `<roster>` becomes
  `json_group_object(__vibes_id, json_object('c1', __vibes_cand.c1, ...)) OVER ()` and `__vibes_id` is removed
  from the result, and `<nonce>` becomes `min(random()) OVER ()`, one number per execution (per outer row when
  correlated), so one statement's rows share a failed scoring without caching it. The call shape
  `vibes(prompt, integer id, roster object, nonce)` and the roster JSON match the JDBC
  rewrite (byte for byte when the column names are unique), so the score cache is shared. A window aggregate
  replaces the rewrite's second CTE, so the candidates are computed once, with no CTE referenced twice.
- **Correlated prompts.** Stock 3.50.3 doesn't let a subquery's `ORDER BY` reference outer columns (newer releases
  relax this). The patch allows it only for the generated `ORDER BY`, so `SELECT p, (SELECT name FROM t RERANK
  BASED ON VIBES(prompts.p) LIMIT 1) FROM prompts` makes one batch per outer row.
- **Refused.** RERANK isn't allowed in `CREATE VIEW` or `CREATE TRIGGER`, because it makes a network call from
  schema objects. It also can't appear on a non-final member of a compound select (`RERANK clause should come
  after UNION not before`). `VALUES ... RERANK` is a syntax error.
- `sqlite_compileoption_used('VIBES_RERANK')` returns 1.

`vibes` is an ordinary function name that is resolved later. It can be the JVM function that Metabase registers
on each connection, the C extension from `local/vibes_plan_c_extension.md`, or the shell's fake.

### Known limits

- `SELECT x rerank BASED ...`: A column alias named `rerank` directly before the word `based` is read as the
  clause.
- The roster is a single `json_object` call. sqlite-jdbc compiles with `SQLITE_MAX_FUNCTION_ARG=127`, so it
  supports at most 63 selected columns. The JDBC rewrite has the same limit. A BLOB column fails the same way it
  does there.
- Candidate numbering follows the select's own `ORDER BY` (marked `SF_OrderByReqd`, so it isn't optimized away).
  Without an `ORDER BY`, numbering follows scan order. The numbering is used only as the tiebreak.
- The patch applies to SQLite 3.50.3 only. For 3.51 and later, the changes to `parse.y` and `select.c` must be
  reapplied.

## Tests

- **Engine:** `test/vibesrerank.test` contains 51 cases for SQLite's Tcl harness. It covers directions,
  LIMIT/OFFSET, the tiebreak, column names and duplicate names, `user_prompt`, subqueries in
  FROM/IN/EXISTS/scalar/CTE, compound selects, INSERT and CTAS, nested RERANK, the correlated batch count, bind
  parameters, errors, identifiers, and the query plan. Run it with
  `test/run-engine-tests.sh [test ...]`. By default, this also runs the upstream select/with/window/subquery/
  view/trigger/alter/json/keyword/limit/orderby suites. On the patch, `veryquick` reports 0 errors out of
  330,585 tests with no leaks, and the default set passes under `--enable-debug` with ASan.
- **JDBC:** `metabase-enterprise.semantic-search.vibes.engine-grammar-test` runs statements with the clause on a
  raw connection, with no proxy. Its tests are no-ops on the stock library. The other vibes tests pass on both
  libraries. The ones specific to the JDBC rewrite pin it with `native-rerank?` redefined to false.
