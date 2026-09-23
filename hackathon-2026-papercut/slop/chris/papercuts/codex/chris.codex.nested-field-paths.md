# Mixed `nfc_path` conventions silently dropped nested fields

Source: Codex session 2026-08-18, [transcript](/Users/christruter/.codex/sessions/2026/08/18/rollout-2026-08-18T12-11-50-01a0145b-1ade-79b2-b2e2-0628330ec55e.jsonl).

Observed failure: commit `f8ba34c0491` (“Name nested fields by nfc_path alone”) made BigQuery fields `r.a` and `r.b` both resolve to `r`. Deduplication silently removed one sibling from the field list sent to the LLM and destabilized the context basis. The user reports that the corrected conditional and test passed ([line 427](/Users/christruter/.codex/sessions/2026/08/18/rollout-2026-08-18T12-11-50-01a0145b-1ade-79b2-b2e2-0628330ec55e.jsonl#L427)).

Mechanism: `nfc_path` is stored under two conventions. Mongo and SQL/JDBC include the field's leaf; BigQuery stores ancestors only and keeps the leaf in `name`. Treating either convention as universal corrupts the other. The user supplied this source-verified distinction and asked that the code and docstring name it ([line 305](/Users/christruter/.codex/sessions/2026/08/18/rollout-2026-08-18T12-11-50-01a0145b-1ade-79b2-b2e2-0628330ec55e.jsonl#L305)).

Agent trap: a clean-looking simplification of `field-path` appeared safe because a single field shape looked representative. A second reviewer briefly called a failing test a pre-existing inconsistency while another agent had edited the test but not the implementation; it corrected that diagnosis once the concurrent edit was understood (line 427). This makes a useful test case for distinguishing an actual historical regression from an observation of half-applied work.

Code: `src/metabase/warehouse_schema/models/table.clj`, with coverage in `table_test.clj`. Remaining design issue noted by the user: an unrecognized third path convention falls through and can be silently misnamed; canonicalizing the representation during sync was left as a TODO.

Classification: confirmed code papercut; introduced subtle wrong output; root cause is inconsistent data representation plus an implicit normalization contract.
