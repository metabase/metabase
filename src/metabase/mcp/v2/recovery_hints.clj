(ns metabase.mcp.v2.recovery-hints
  "The v2 surface's recovery sentences for the shared representations pipeline's agent errors.

   The pipeline throws a bare statement of what went wrong plus structured `ex-data`; it does
   not know which tools the caller has. This namespace turns that `ex-data` into the sentence
   telling *this* surface's agent how to recover. Its first consumer arrives with the query
   tools (which hand it to the pipeline as `:recovery-hint`); it lands here so those slices wire
   it in without also authoring it. v1's equivalent is
   [[metabase.metabot.tools.recovery-hints/recovery-hint]].

   Keep every sentence inside v2's own vocabulary — `browse_data`, `search`, numeric ids. An
   error key with no entry here yields no sentence, which is the intended failure mode: a
   missing hint reads as terse, a wrong one sends the agent at a tool it does not have."
  (:require
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- uri-hint
  "The `source-table:`-took-a-URI sentence, which varies by what the URI pointed at."
  [entity-type entity-id]
  (case entity-type
    ;; The `{}` options slot has to sit outside the format string — MessageFormat reads a brace
    ;; as a placeholder, and `tru` rejects the escaped form as a skipped argument index.
    "metric"
    (str (tru "Metrics are aggregations, not sources. To use metric {0}, put its base table''s numeric id into `source-table:` (find it via `search` or `browse_data`) and reference the metric by its numeric id:"
              (str entity-id))
         " `aggregation: [[metric, {}, " entity-id "]]`.")

    ("question" "model" "card")
    (tru "To reference a saved question or model as a query source, put its bare numeric id into `source-card:` — not a URI: `\"source-card\": {0}`."
         (str entity-id))

    "table"
    (tru "Use the bare numeric table id in `source-table:` — not a URI: `\"source-table\": {0}`."
         (str entity-id))

    (tru "`source-table:` accepts a numeric table id; `source-card:` accepts a saved-card numeric id.")))

(defn recovery-hint
  "The v2 recovery sentence for an agent error's `ex-data`, or nil when it has none."
  [{:keys [error entity-type entity-id]}]
  (case error
    :uri-in-source-table
    (uri-hint entity-type entity-id)

    (:unknown-table :unknown-table-id)
    (tru "Call `browse_data` with action \"list_tables\" to list available tables with their numeric ids, then use one as `source-table`.")

    :ambiguous-table
    (tru "Call `browse_data` with action \"list_tables\" for the database, then retry with the numeric table id — it is never ambiguous.")

    (:unknown-field :unknown-field-id)
    (tru "Call `browse_data` with action \"get_fields\" for the table to list its columns with their numeric ids.")

    :ambiguous-fk
    (tru "Call `browse_data` with action \"get_fields\" for the source table to list the available foreign-key columns.")

    (:unknown-card :unknown-card-id)
    (tru "Find the question or model with `search` and put its bare numeric id into `source-card:`.")

    (:unknown-measure :unknown-measure-id)
    (tru "Call `browse_data` with action \"get_fields\" for the table that owns the measure and use the numeric id from its measures list.")

    (:unknown-segment :unknown-segment-id)
    (tru "Call `browse_data` with action \"get_fields\" for the table that owns the segment and use the numeric id from its segments list.")

    :unknown-database
    (tru "Use a numeric table id in `source-table:` (from `browse_data` action \"list_tables\"), which needs no database name at all.")

    :missing-source-in-first-stage
    (tru "`source-table:` takes a numeric table id; `source-card:` takes a saved-card numeric id.")

    nil))
