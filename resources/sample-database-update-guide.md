# Updating the Sample Database

The "Sample Database" users see in Metabase is the combination of two files:

1. **`resources/sample-database.db.mv.db`** — H2 binary, contains the actual row
   data (PEOPLE, PRODUCTS, ORDERS, REVIEWS, ACCOUNTS, FEEDBACK, INVOICES,
   ANALYTIC_EVENTS).
2. **`resources/sample-content.edn`** — app-DB state: collections, the
   "E-commerce Insights" dashboard, cards, parameters, permissions. Joined to
   the H2 file by table/column names.

If you edit columns, row values, or anything that affects query results, **both
files must stay in sync**. Most importantly, a handful of cards in
`sample-content.edn` have **hardcoded date bounds inside their query
definitions** — search for `\"20` in that file before you ship.

## Important: GUEST is now admin

As of DEV-1800, the `GUEST` user in `sample-database.db.mv.db` is an **admin**.
Previously it was non-admin, which meant the only way to dump the DB was via
`org.h2.tools.Recover` (a messy raw-MVStore dump). Now you can run `Script` and
`RunScript` directly with `-user GUEST -password guest` — no recovery step,
no temporary SA user. Keep GUEST admin when you rebuild, otherwise the next
person has to go through the Recover dance again.

## Recipe

Set up a shell variable for the H2 jar (any 2.1.x works):

```bash
H2=~/.m2/repository/com/h2database/h2/2.1.214/h2-2.1.214.jar
```

### 1. Dump binary → plain-text SQL

```bash
java -cp $H2 org.h2.tools.Script \
  -url "jdbc:h2:./resources/sample-database.db;IFEXISTS=TRUE" \
  -user GUEST -password guest \
  -script sample-database.sql
```

The file will have trailing whitespace on non-INSERT lines — strip it with
`sed -i 's/[[:space:]]*$//' sample-database.sql` for readability.

### 2. Edit

Plain-text SQL, so use whatever you like. For a uniform N-year shift, sed is
the right tool — simple, fast, diff-friendly. A few gotchas:

- Process year substitutions **from highest to lowest** to avoid cascading
  (e.g. `2026 → 2032` before `2020 → 2026`, otherwise the same row gets
  shifted twice).
- `BIRTH_DATE` columns use `DATE '...'` literals, not `TIMESTAMP` — shifting
  only `TIMESTAMP '...'` leaves birth dates alone.
- **Leap days**: `2024-02-29` and `2028-02-29` exist in the data. Shifting
  by +6 years would produce `2030-02-29` / `2034-02-29`, which are invalid.
  Pre-fix these to Feb 28 before the year shift, or use H2's `DATEADD` via
  SQL if you prefer column-aware shifts.

**Whatever dates you change, also update `resources/sample-content.edn`** —
grep for hardcoded date strings in card query definitions and shift them by
the same delta. The linked cards break visibly when the filter bounds drift
out of the data range.

### 3. Rebuild binary from SQL

```bash
rm -f resources/sample-database.db.mv.db
java -cp $H2 org.h2.tools.RunScript \
  -url "jdbc:h2:./resources/sample-database.db" \
  -user GUEST -password guest \
  -script sample-database.sql
```

H2 creates `GUEST` as the initial admin from the connection params, which is
exactly what we want. The `CREATE USER IF NOT EXISTS "GUEST"` line inside the
script becomes a no-op.

### 4. Compact

`RunScript` leaves the MVStore uncompacted (~60% larger than it needs to be).
Compact it:

```bash
(cd resources && java -cp $H2 org.h2.tools.Shell \
  -url "jdbc:h2:./sample-database.db" \
  -user GUEST -password guest \
  -sql "SHUTDOWN COMPACT")
```

Ignore the "Database is already closed" message — it's normal after
`SHUTDOWN COMPACT`.

### 5. Verify

```bash
(cd resources && java -cp $H2 org.h2.tools.Shell \
  -url "jdbc:h2:./sample-database.db;ACCESS_MODE_DATA=r;IFEXISTS=TRUE" \
  -user GUEST -password guest \
  -sql "SELECT COUNT(*) FROM ORDERS; SELECT MIN(CREATED_AT), MAX(CREATED_AT) FROM ORDERS")
```

ORDERS should have 18,760 rows. Spot-check any other table you touched.

### 6. Commit

Commit only `resources/sample-database.db.mv.db` and `resources/sample-content.edn`.
Do **not** commit `sample-database.sql` — the team has decided against tracking
it (the binary diff is noisy, but at this size the plain-text history adds more
churn than value).

## Expect e2e fallout

A date shift will break **many** Cypress e2e tests — anything that filters
`ORDERS.CREATED_AT` against a hardcoded date, any snapshot that includes a
specific year in the chart, any native-SQL spec with a literal date. The last
time this was done (PR #32047, +6 years) it touched ~60 spec files. Most of
those files have since been renamed, so a direct port won't work — let CI
tell you which tests are failing and fix them case-by-case.

Things to watch for beyond simple filter bounds:
- Snapshot images / chart baselines with year labels
- Tests that check "last N months" relative ranges
- Weekday-sensitive dates (shifting `Mon 2024-01-01` by 6 years lands on a
  different weekday)
- Release-note / version-string dates that **should not** shift (e.g.
  hardcoded Metabase release dates in admin-settings tests)
