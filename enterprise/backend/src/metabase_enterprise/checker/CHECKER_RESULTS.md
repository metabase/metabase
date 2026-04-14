# Checker Results Analysis (2026-04-13)

177 entities, 157 OK, 20 failures. 3 minute runtime.

## Categories

### True errors (legitimate issues in the serdes export) — 4

| Entity | ID | Issue |
|--------|------|-------|
| Cancellation surveys + Account | BX0OXDlHjKSP_FAuyMcrx | Missing card ref `RYLHsYEbrGw0JApYR9BUk` |
| Fancy too complicated transform | FpYgwX6EFQpsmj4kvS6mS | Missing card refs `RYLHsYEbrGw0JApYR9BUk`, `ix2LGlbtLk7nd_V7l_U0m` |
| Paying customers by US city | of01cDny6qcVPJEFzoGB- | Missing card refs (same two) |
| Registrants with Cleaned Titles | foxwZ1sAkwfDaA_yg47vJ | Missing card ref `kQqRfZV6WxYcJDvhNDr2U` |

These are real: the referenced cards aren't in the export. Correct behavior.

### True errors — missing columns from schema (columns genuinely not in table) — 5

| Entity | ID | Issue |
|--------|------|-------|
| AWS Cost Staging vamsi test 1 | psiMYYSUAr-mP_qtIangD | 23 missing columns from `public.aws_focus_data` |
| pa-events-to-sankey | XtcsdtFeFaL51g8Vl_JaV | 4 missing columns from `pa_events` |
| pa-to-sankey-internal-tools | AMXAz3WGIzg5Jug-77tTK | 1 missing column from `pa_events` |
| self_hosted_daily_stats... | 6-izJVKT0GpANlRkvreaA | 47 missing columns from `stg_selfhosted_daily_instance_metrics` |
| stg_survey_monkey_response_answer | Soy0J0v2WFHXGoUAqB3TA | 8 missing columns — cross-schema refs to `stitchdata_incoming.raw_survey_monkey` |

These are likely real schema drift (table exists but columns were added/removed since export).

### True errors — duplicate columns — 6

| Entity | ID | Duplicated |
|--------|------|------------|
| (Census ETL) Account -> Salesforce Token | sIzDLZgTNSvlJqJDzDFeY | `created_at` |
| (TEST) Generation 1 Pokemon Overview | fm5ekHd_P6bPuFh4xN3xW | `name` |
| hackathon_salesforce_account | bNbuQSO-NirhnMwT5FfI1 | `name` |
| hackathon_salesforce_opp | yEIn_6cep-rhwY5jhs7ng | `name` |
| test_combined_self_hosted_events | fK4-VfWVw7gduQSuigQq9 | 12 duplicate columns |
| testing transfomr | W71V9dLyTCfTVuPSHMieI | `asd` (test junk) |

Real issues — JOINs producing duplicate column names.

### Checker bug — CTE alias case sensitivity — 1

| Entity | ID | Issue |
|--------|------|-------|
| (Census ETL) Webinar Registrant -> Salesforce Campaign | OFanELVrB0FrNIOOAv1KN | `final AS (...) SELECT * FROM FINAL` |

**Bug:** SQLGlot or our resolver treats `FINAL` as unresolved because the CTE was defined as `final`. SQL is case-insensitive for identifiers — this should match. Needs investigation in `sql-tools`.

### Fixed — template tag placeholder — 1

| Entity | ID | Issue |
|--------|------|-------|
| Test Double Var In Incremental Transforms | s5bICwlCbXg7NbvUzKnH8 | `{{table_one}}` (type: table) was not substituted |

**Fixed:** Table-type template tags are now substituted with placeholders and errors
referencing placeholders are filtered out. Future work: resolve `table-id` from the
schema to validate columns (see Linear issue).

### True error — intentionally broken snippet — 1

| Entity | ID | Issue |
|--------|------|-------|
| Test snippet it will fail | 4tu_hMpDPOPTCW_d584ia | syntax-error for `{{snippet: ...}}{{snippet: ...}}` |

Intentionally broken test entity (name says "it will fail"). Two snippets concatenated with no SQL between them.

### Checker bug — dim_dates generate_series — 1

| Entity | ID | Issue |
|--------|------|-------|
| dim_dates | c2bPawXweaxcZIs37E-Jh | `missing-column: datum` |

**Bug:** `datum` is defined in a subquery `(SELECT '2000-01-01'::DATE + SEQUENCE.DAY AS datum ...) DQ` but the checker can't resolve it. Likely a SQLGlot limitation with `GENERATE_SERIES` or subquery alias resolution.

## Summary

| Category | Count | Action |
|----------|-------|--------|
| True errors (missing refs) | 4 | Correct behavior |
| True errors (missing columns) | 5 | Correct — schema drift |
| True errors (duplicate columns) | 6 | Correct behavior |
| True errors (intentionally broken) | 1 | Correct behavior |
| Fixed (template tag) | 1 | Resolved |
| Checker bugs | 2 | Need fixes |
| **Total** | **20** | |

## Performance

- 177 entities in ~90s after optimizations
- Setup (indexing): ~100ms
- First entity per database pays ~5-8s for table directory listing + ID assignment
- Complex native SQL queries: 5-20s in SQLGlot parsing
- Bottleneck is now SQL parsing, not data loading
- Future: parallelize entity checking (architecture is ready, provider-per-thread)
