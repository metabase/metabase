(ns metabase.metabot.tools.recovery-hints
  "The v1 metabot / agent-api surface's recovery sentences for the shared representations
   pipeline's agent errors.

   The pipeline throws a bare statement of what went wrong plus structured `ex-data`; it does
   not know which tools the caller has. This namespace turns that `ex-data` into the sentence
   telling *this* surface's agent how to recover, and each v1 entry point hands it to the
   pipeline as `:recovery-hint`.

   Keep every sentence inside v1's own vocabulary — `read_resource`, `metabase://` URIs,
   portable FKs and `portable_entity_id`. An error key with no entry here yields no sentence,
   which is the intended failure mode: a missing hint reads as terse, a wrong one sends the
   agent at a tool it does not have.

   The hints for an unknown or ambiguous table, an unknown column and an ambiguous foreign key name
   the real id when the `ex-data` carries one. For example, such a hint names
   `metabase://database/1/tables` instead of `metabase://database/<numeric id>/tables`. A database id
   appears only when the current user can read that database."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.representations :as repr]
   [metabase.metabot.tools.recoverable.pipeline :as recoverable.pipeline]))

(set! *warn-on-reflection* true)

(defn- uri-hint
  "The `source-table:`-took-a-URI sentence, which varies by what the URI pointed at."
  [entity-type entity-id]
  (case entity-type
    "metric"
    (str "Metrics are aggregations, not sources. To use metric " entity-id ", build the stage on the source specified by its "
         "`<metric>` tag (in its search result or `read_resource metabase://metric/" entity-id "`): "
         "`base_table_fully_qualified_name` with `database_name` as `source-table:`, or "
         "`source_card_portable_entity_id` as `source-card:`. Then reference the metric as "
         "`aggregation: [[metric, {}, \"<portable_entity_id>\"]]`.")

    ("question" "model" "card")
    "To reference a saved question or model as a query source, put its `portable_entity_id` (the 21-char string from its search result or `read_resource`) into `source-card:` — not a URI."

    "table"
    (format "Use the portable FK `[<db-name>, <schema>, <table-name>]` in `source-table:` — not a URI. `read_resource metabase://table/%s` reports the exact names."
            (str entity-id))

    "`source-table:` accepts a portable FK `[<db-name>, <schema>, <table-name>]` or, via `source-card:`, a saved-card `portable_entity_id`."))

(defn- card-fields-hint
  "Return guidance for listing `what` from the source card, or nil when `data` names no card."
  [{:keys [source-card source-card-type]} what]
  (when (and source-card source-card-type)
    (str "Call `read_resource` with `metabase://" source-card-type "/" source-card "/fields` to list the " what
         " this " source-card-type " returns.")))

(defn- structural-validation-hint
  "Describe the failing paths in a humanized structural explanation, or nil when it has no errors."
  [humanized]
  (let [paths (repr/humanized->paths humanized)]
    (when (seq paths)
      (format "Invalid at %s. Fix the named paths." paths))))

(defn- placeholder-hint
  "The v1 recovery sentence for an agent error's `ex-data`, or nil.

  Some hints keep a `<numeric id>` placeholder. [[recovery-hint]] fills it only for the codes in
  `hint-id-fns`, and only when that code's function reads a `pos-int?` id from `data`."
  [{:keys [error entity-type entity-id humanized] :as data}]
  (case error
    :invalid-representations-query
    (structural-validation-hint humanized)

    :uri-in-source-table
    (uri-hint entity-type entity-id)

    :unknown-table
    "Call `read_resource` with `metabase://database/<numeric id>/tables` to list available tables and schemas, then retry with an exact portable FK from the response."

    :unknown-table-id
    ;; A numeric-id miss, not a portable-FK miss: pointing the agent at a portable FK (as
    ;; `:unknown-table` does) would be wrong advice. v1 authors portable FKs, so the right move
    ;; is to find the table by name and use its portable FK.
    "That numeric table id does not resolve. Call `read_resource` with `metabase://database/<numeric id>/tables` to find the table, then use its portable FK `[<db-name>, <schema>, <table-name>]` in `source-table:`."

    :ambiguous-table
    "Call `read_resource` with `metabase://database/<numeric id>/tables` to list available tables and retry with a more specific portable FK."

    (:unknown-field :unknown-field-id)
    "Call `read_resource` with `metabase://table/<numeric id>/fields` to list this table's columns."

    :ambiguous-field
    "The field name matches more than one column in this table, so it cannot be referenced by name. Tell the user about the ambiguous column name."

    :ambiguous-fk
    (or (card-fields-hint data "foreign-key columns")
        "Call `read_resource` with `metabase://table/<numeric id>/fields` for the source table to list the available foreign-key columns.")

    (:column-not-returned :unexportable-fk)
    (card-fields-hint data "columns")

    :no-fk-path
    "If a metric relates to that table, read its dimensions resource `metabase://metric/<metric_id>/dimensions`, which lists the exact `joins:` clause to paste and the columns it unlocks."

    (:unknown-card :unknown-card-id)
    "Do not invent or guess entity_ids: call `read_resource` with `metabase://question/<numeric id>` or `metabase://model/<numeric id>` first, then copy the exact `portable_entity_id` from the response into `source-card:`."

    (:unknown-measure :unknown-measure-id)
    "Do not invent or guess entity_ids: read the table that owns the measure with `read_resource` (`metabase://table/<numeric id>`) and copy the exact `portable_entity_id` from its `<measure>` tag."

    (:unknown-segment :unknown-segment-id)
    "Do not invent or guess entity_ids: read the table that owns the segment with `read_resource` (`metabase://table/<numeric id>`) and copy the exact `portable_entity_id` from its `<segment>` tag."

    (:cross-database-card :cross-database-measure :cross-database-segment)
    "A query can only reference saved questions, models, metrics, measures and segments from its own database. Use one from that database, or change the source to a table in the referenced item's database."

    :unknown-database
    "Use the exact database name as reported by search / `read_resource` (it appears as the first element of every portable FK, e.g. `source-table: [<db-name>, <schema>, <table>]`)."

    :ambiguous-database-name
    "Ask the user to rename one of the databases."

    :missing-source-in-first-stage
    "`source-table:` takes a portable FK `[<db-name>, <schema>, <table>]`; `source-card:` takes an entity_id string."

    nil))

(def ^:private hint-id-fns
  "For each code whose hint can name a real id, the function that reads that id from the `ex-data`."
  ;; Repair and resolve throw these errors. The permission sweep query-checks the tables of
  ;; `:table-id` and `:source-table` before repair and resolve run.
  {:unknown-table   recoverable.pipeline/readable-database-id
   :ambiguous-table recoverable.pipeline/readable-database-id
   :unknown-field   :table-id
   :ambiguous-fk    :source-table})

(defn- hint-id
  "The id that the hint for `data` names, or nil when its code names none or the id is not a `pos-int?`."
  [{:keys [error] :as data}]
  (when-let [id-fn (hint-id-fns error)]
    (let [id (id-fn data)]
      (when (pos-int? id)
        id))))

(defn- with-id
  "`hint` with its `<numeric id>` replaced by `id`, or unchanged when either is nil."
  [hint id]
  (cond-> hint
    (and hint id) (str/replace "<numeric id>" (str id))))

(defn recovery-hint
  "The v1 recovery sentence for an agent error's `ex-data`, or nil when it has none.

  For example, `{:error :unknown-field :table-id 5}` gives a sentence that names
  `metabase://table/5/fields`, and `{:error :unknown-field}` one that names
  `metabase://table/<numeric id>/fields`."
  [data]
  (with-id (placeholder-hint data) (hint-id data)))
