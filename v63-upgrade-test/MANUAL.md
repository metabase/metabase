# Manual verification steps

The scripts automate build + boot + log scanning. The UI setup, content checks, and the
before/after engine comparison are manual. Follow in order.

Handy DB peek (run any time):

```bash
. ./config.sh
docker exec -e PGPASSWORD="$PG_PASS" "$PG_CONTAINER" \
  psql -U "$PG_USER" -d "$PG_DB" -c \
  "select id, name, engine, is_sample from metabase_database where is_sample;"
```

---

## After `04-run-v62.sh` (v62 is up = pre-upgrade state)

1. Open http://localhost:3000. Complete the **admin setup** wizard (name, email, password).
   Skip the "add your data" step. Language/usage answers don't matter.
2. **Admin settings > Databases**: confirm a **Sample Database** exists.
   - Click it; the engine should be **H2**.
   - Or via the DB peek above: `engine` = `h2`.
3. Open the Sample Database, run a question (e.g. **Orders** table, or a simple count). Confirm
   it returns rows. This proves the H2 sample works pre-upgrade.
4. (Optional, tests content survival) Create a collection card and move it into the **Example**
   collection, OR just note which bundled items exist in the Example collection. You'll check
   these survive the engine swap.

Record: sample DB `engine = h2` ✔ before proceeding.

---

## After `05-run-v63.sh` (v63 is up = post-upgrade)

The script already prints the migration log lines and scans for H2 `ClassNotFound`. Also:

1. **It booted healthy** against the same app DB (script waited on `/api/health`). If it timed
   out, read `docker logs $MB_CONTAINER`.
2. Log in with the **same admin credentials** from the v62 setup (same app DB -> same user).
3. **Admin settings > Databases > Sample Database**: engine is now **SQLite**.
   - DB peek should show `engine = sqlite`, and the row `id` will be **new** (old sample DB was
     dropped and recreated — expected).
4. Open the Sample Database and run a question (e.g. Orders). Confirm it returns rows — the
   SQLite sample is queryable.
5. **Example collection** content you noted in step 4 above still exists (the collection is
   reused by entity id; only bundled cards/dashboards are replaced).
6. Sanity: expect **no** `org.h2` / `ClassNotFoundException` in logs. The migration must not have
   tried to read the old H2 file.

Record: sample DB `engine = sqlite` ✔, instance usable, no H2 class errors ✔.

---

## What "pass" means

- v63 image has **no `org/h2/*`** in its jar (asserted by `01-build-jar.sh`).
- v63 boots on a Postgres app DB that had an **H2** sample DB, and migrates it to **SQLite**
  without needing the H2 library.
- Users/content in the app DB survive; the sample DB is queryable afterward.
