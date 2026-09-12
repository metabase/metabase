(ns metabase.metabot.tools.recovery-hints
  "The v1 metabot / agent-api surface's recovery sentences for the shared representations
   pipeline's agent errors.

   The pipeline throws a bare statement of what went wrong plus structured `ex-data`; it does
   not know which tools the caller has. This namespace turns that `ex-data` into the sentence
   telling *this* surface's agent how to recover, and each v1 entry point hands it to the
   pipeline as `:recovery-hint`. v2's equivalent is
   [[metabase.mcp.v2.recovery-hints/recovery-hint]].

   Keep every sentence inside v1's own vocabulary — `read_resource`, `metabase://` URIs,
   portable FKs and `portable_entity_id`. An error key with no entry here yields no sentence,
   which is the intended failure mode: a missing hint reads as terse, a wrong one sends the
   agent at a tool it does not have."
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
    ;; `{0}` and `{1}` are both the entity id: `tru` rejects a repeated index, because
    ;; MessageFormat counts placeholder occurrences and distinct indices separately.
    (str (tru "Metrics are aggregations, not sources. To use metric {0}, put its base table into `source-table:` — combine the `database_name` and `base_table_fully_qualified_name` attributes from its search result or `read_resource metabase://metric/{1}` — and reference the metric as:"
              (str entity-id) (str entity-id))
         " `aggregation: [[metric, {}, \"<portable_entity_id>\"]]`.")

    ("question" "model" "card")
    (tru "To reference a saved question or model as a query source, put its `portable_entity_id` (the 21-char string from its search result or `read_resource`) into `source-card:` — not a URI.")

    "table"
    (tru "Use the portable FK `[<db-name>, <schema>, <table-name>]` in `source-table:` — not a URI. `read_resource metabase://table/{0}` reports the exact names."
         (str entity-id))

    (tru "`source-table:` accepts a portable FK `[<db-name>, <schema>, <table-name>]` or, via `source-card:`, a saved-card `portable_entity_id`.")))

(defn recovery-hint
  "The v1 recovery sentence for an agent error's `ex-data`, or nil when it has none."
  [{:keys [error entity-type entity-id]}]
  (case error
    :uri-in-source-table
    (uri-hint entity-type entity-id)

    :unknown-table
    (tru "Call `read_resource` with `metabase://database/<numeric id>/tables` to list available tables and schemas, then retry with an exact portable FK from the response.")

    :unknown-table-id
    ;; A numeric-id miss, not a portable-FK miss: pointing the agent at a portable FK (as
    ;; `:unknown-table` does) would be wrong advice. v1 authors portable FKs, so the right move
    ;; is to find the table by name and use its portable FK.
    (tru "That numeric table id does not resolve. Call `read_resource` with `metabase://database/<numeric id>/tables` to find the table, then use its portable FK `[<db-name>, <schema>, <table-name>]` in `source-table:`.")

    :ambiguous-table
    (tru "Call `read_resource` with `metabase://database/<numeric id>/tables` to list available tables and retry with a more specific portable FK.")

    (:unknown-field :unknown-field-id)
    (tru "Call `read_resource` with `metabase://table/<numeric id>/fields` to list this table''s columns.")

    :ambiguous-fk
    (tru "Call `read_resource` with `metabase://table/<numeric id>/fields` for the source table to list the available foreign-key columns.")

    :no-fk-path
    (tru "If a metric relates to that table, read its dimensions resource `metabase://metric/<metric_id>/dimensions`, which lists the exact `joins:` clause to paste and the columns it unlocks.")

    (:unknown-card :unknown-card-id)
    (tru "Do not invent or guess entity_ids: call `read_resource` with `metabase://question/<numeric id>` or `metabase://model/<numeric id>` first, then copy the exact `portable_entity_id` from the response into `source-card:`.")

    (:unknown-measure :unknown-measure-id)
    (tru "Do not invent or guess entity_ids: read the table that owns the measure with `read_resource` (`metabase://table/<numeric id>`) and copy the exact `portable_entity_id` from its `<measure>` tag.")

    (:unknown-segment :unknown-segment-id)
    (tru "Do not invent or guess entity_ids: read the table that owns the segment with `read_resource` (`metabase://table/<numeric id>`) and copy the exact `portable_entity_id` from its `<segment>` tag.")

    :unknown-database
    (tru "Use the exact database name as reported by search / `read_resource` (it appears as the first element of every portable FK, e.g. `source-table: [<db-name>, <schema>, <table>]`).")

    :missing-source-in-first-stage
    (tru "`source-table:` takes a portable FK `[<db-name>, <schema>, <table>]`; `source-card:` takes an entity_id string.")

    nil))
