# LIMITATION 001 — `UPDATE` / non-query `distance` crashes the process

Found in PLAN_001 Phase A, 2026-09-23. vec1 0.7 (`version-0.7`, sha256 `8571bb4f…4b86`, see
`bin/fetch-vec1.sh`), sqlite-jdbc 3.50.3.0 (bundled SQLite 3.50.3), macOS 26 aarch64, Temurin JDK 25.0.3.

## Summary

On a vec1 table that has been rebuilt into a flat index (`rebuild '{index:"flat", distance:"cos"}'` —
the mode we use), **any statement that reads the hidden `distance` column without a query vector
segfaults inside vec1**. `UPDATE` always does that, so **every `UPDATE` on the table crashes the JVM**.

There is no exception to catch: it is a SIGSEGV in native code, the whole Metabase process dies
(it killed the dev nREPL during the spike — `hs_err_pid3068.log`).

## What crashes / what does not

On a table rebuilt with `index:"flat"`:

| Statement | Result |
|---|---|
| `UPDATE search_vec SET vector = ? WHERE rowid = ?` | 💥 SIGSEGV |
| `UPDATE search_vec SET archived = 1 WHERE rowid = ?` (meta column only) | 💥 SIGSEGV |
| `UPDATE search_vec SET vector = ?, model = ?, archived = ? WHERE rowid = ?` | 💥 SIGSEGV |
| `SELECT rowid, distance FROM search_vec WHERE rowid = ?` (no query vector) | 💥 SIGSEGV |
| `SELECT rowid, vector, model, archived FROM search_vec WHERE rowid = ?` | ✅ |
| `DELETE FROM search_vec WHERE rowid = ?` | ✅ |
| `INSERT INTO search_vec(rowid, vector, …) VALUES (…)` | ✅ |
| `SELECT rowid, distance FROM search_vec(?, '{k: N}')` (KNN) | ✅ |

On a table that was **never** rebuilt (no index):

| Statement | Result |
|---|---|
| `SELECT rowid, distance … WHERE rowid = ?` | ✅ returns stats JSON `{bucket:0, coarse_error:…, reconstruction_error:…}` |
| `UPDATE … SET vector = ?` | ✅ |
| `search_vec(?, '{k: 2}')` | ⚠️ runs, but **is not a KNN**: rows come back unranked with the stats JSON as `distance` |

So an unindexed table is not a workaround — it can be updated but not searched.

## Crash signature

```
SIGSEGV (0xb)
Problematic frame:
C  [vec1.dylib+0x2ed4]  vec1ColumnMethod+0x204
C  [libsqlitejdbc.dylib+…]  (sqlite3_step)
j  org.sqlite.core.NativeDB.step(J)I
```

Identical frame for all four crashing statements.

## Root cause (from reading vec1.c, not debugged in a native debugger)

`vec1ColumnMethod` (vec1.c, xColumn) handles `iCol == VEC1_COLUMN_DISTANCE`:

- with a query (`pCsr->pQuery`) → returns the KNN distance;
- without one → `vec1DistanceStats(ctx, pCsr)` (vec1.c:7890), a **deliberate feature** that reports
  per-row quantization stats as JSON.

`vec1DistanceStats` works on an unindexed table but crashes once the table has a flat index — most
likely a null/unset model field (transform input / `aTmpVec` / centroid data) that exists only for
trained IVF-PQ models and is absent in the untrained flat model. It is inlined into
`vec1ColumnMethod`, hence the frame.

`UPDATE` hits it because SQLite's xUpdate for virtual tables passes *all* column values of the new row,
so it reads every column of the existing row via xColumn — including hidden `distance` — before calling
`vec1UpdateMethod`.

## Repro

```bash
cd native/vec1/spike
clojure -M -m spike select-distance-no-query   # crashes
clojure -M -m spike update-vector              # crashes
clojure -M -m spike update-meta                # crashes
clojure -M -m spike distance-no-index          # fine (no flat index)
clojure -M -m spike update-no-index            # fine, but table is not KNN-searchable
```

Pure SQL (sqlite3 shell with the extension loaded):

```sql
.load ./vec1
create virtual table v using vec1(vector);
insert into v(cmd, arg) values ('rebuild', '{index:"flat", distance:"cos"}');
insert into v(rowid, vector) values (1, x'0000803f000000000000000000000000');
select rowid, distance from v where rowid = 1;   -- segfault
```

Confirmed in the Homebrew `sqlite3` CLI 3.53.4 (`/opt/homebrew/opt/sqlite/bin/sqlite3`; Apple's
`/usr/bin/sqlite3` can't `.load`): exits 139 (SIGSEGV) on the `select`. So it is vec1 itself, independent
of sqlite-jdbc and of the bundled SQLite version.

## Rules for our code

1. **Never `UPDATE` a vec1 table.** Replace = `DELETE … WHERE rowid = ?` then `INSERT` with the same rowid,
   in one transaction.
2. **Never read `distance` outside a KNN call** (`search_vec(?, '{k: N}')`). No `select *` on the vec1
   table, no debugging queries that project `distance`.
3. All SQL touching the vec1 table lives in the store namespace behind functions; nothing else in the
   codebase writes raw SQL against it.
4. Add a test that exercises replace-by-delete+insert, so a regression to `UPDATE` fails CI instead of
   the process — but run vec1 tests knowing a crash takes the test JVM down.

## Impact

- Hackathon: none beyond the rules above; delete + insert costs nothing measurable (5 000 inserts in
  112 ms).
- Production: a class of mistake (one wrong query) takes the whole instance down. Together with the
  upstream maturity notes (pre-1.0, "testing is insufficient", memory-safety reports on the 0.7 forum
  thread), it argues for keeping vec1 behind a kill switch and for guarding the store API tightly.

## Upstream

- [ ] Report on sqlite.org/forum (vec1 thread): non-query `distance` xColumn segfaults on a flat-indexed
      table; UPDATE triggers it. Include the SQL repro above (confirmed in the CLI).
- [ ] Re-test on each vec1 version bump (`bin/fetch-vec1.sh`) with the spike checks above.
