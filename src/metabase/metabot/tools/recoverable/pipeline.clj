(ns metabase.metabot.tools.recoverable.pipeline
  "What each `:error` code the representations pipeline raises becomes: a declared recoverable error, or,
  for the few the model can't fix, an [[unrecoverable]] one.

  The pipeline (`metabase.agent-lib.representations*`, `metabase.metabot.tools.construct`,
  `metabase.models.serialization.resolve.mp`) throws a bare statement of what went wrong plus
  structured `ex-data` carrying an `:error` keyword. It deliberately knows nothing about which tools
  its caller has, so it cannot say how to recover. This namespace supplies that half: each `:error`
  code gets a declaration whose recovery steps are written in the tool vocabulary — `read_resource`,
  `metabase://` URIs, portable FKs, `portable_entity_id` — and `tools.core/with-pipeline-errors`
  converts a pipeline exception into the matching declaration.

  The pipeline's own message is authored text (it is built with `tru` and already reaches the model
  today), so it is the one foreign message a payload here may carry. Everything else about the
  exception stays in the logs.

  A code with no declaration is not converted and becomes unrecoverable, which is why
  `metabase.metabot.tools.recoverable.pipeline-test` scans the pipeline sources and fails when a
  code here is missing. Recovery steps start from `metabase.metabot.tools.recovery-hints`, with
  `tru` removed — these are model-facing, not user-facing. A code whose recovery would be guesswork
  gets no steps at all: a missing step reads as terse, a wrong one sends the agent at the wrong
  tool."
  (:require
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.error :refer [defrecoverable]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::payload
  "The payload every pipeline-error declaration takes.

  `:message` is the pipeline's own sentence. `:entity-type` and `:entity-id` are present only for
  the codes whose recovery depends on what was referenced (see [[uri-in-source-table!]]).
  `:table-id` and `:database-id` are the ids a code's recovery steps name, present only when the
  pipeline knew them and the current user may read them (see [[payload]])."
  [:map {:closed true}
   [:message     :string]
   [:entity-type {:optional true} [:maybe :string]]
   [:entity-id   {:optional true} [:maybe [:or :string :int]]]
   [:table-id    {:optional true} pos-int?]
   [:database-id {:optional true} pos-int?]])

(def ^:private payload-ids
  {:unknown-table {:database-id :database-id}
   :unknown-field {:table-id :table-id}
   :ambiguous-fk  {:table-id :source-table}})

(defn payload
  "The payload for the pipeline exception `e`, raised with `:error` code `error`: the pipeline's own
  sentence, and the ids that code's recovery steps name.

  The tables behind `:table-id` already passed the pipeline's permission sweep. A database is not
  checked by the sweep, so `:database-id` is kept only when the current user can read it."
  [error e]
  (let [data (ex-data e)]
    (reduce-kv (fn [acc payload-key data-key]
                 (let [id (get data data-key)]
                   (cond-> acc
                     (and (pos-int? id)
                          (or (not= :database-id payload-key)
                              (metabot.db/readable-database? id)))
                     (assoc payload-key id))))
               (cond-> {:message (or (ex-message e) "")}
                 (:entity-type data)       (assoc :entity-type (:entity-type data))
                 (some? (:entity-id data)) (assoc :entity-id (:entity-id data)))
               (get payload-ids error))))

;;; ------------------------------------------- Shared recovery steps ----------------------------------------------

;; Each step names the tools its text mentions in `:uses`, so a profile without `read_resource` gets
;; the error with that step dropped rather than advice it cannot follow.

(defn- id-or-placeholder
  [id]
  (if id (str id) "<numeric id>"))

(defn- list-tables-steps
  [database-id]
  [{:uses #{"read_resource"}
    :text (str "Call `read_resource` with `metabase://database/" (id-or-placeholder database-id) "/tables` to "
               "list the available tables and schemas, then retry with an exact portable FK from the response.")}
   {:uses #{"search"}
    :text "Call `search` with the table's name to find it, then build its portable FK from the result."}])

(defn- list-fields-steps
  [table-id]
  (cond-> [{:uses #{"read_resource"}
            :text (str "Call `read_resource` with `metabase://table/" (id-or-placeholder table-id) "/fields` to "
                       "list this table's columns.")}]
    table-id (conj {:uses #{"list_available_fields"}
                    :text (str "Call `list_available_fields` with `table_ids: [" table-id "]` to list this "
                               "table's columns.")})))

(defn- list-fks-steps
  [table-id]
  (cond-> [{:uses #{"read_resource"}
            :text (str "Call `read_resource` with `metabase://table/" (id-or-placeholder table-id) "/fields` to "
                       "list the source table's foreign-key columns, then set `source-field` on the field "
                       "clause to the one you mean.")}]
    table-id (conj {:uses #{"list_available_fields"}
                    :text (str "Call `list_available_fields` with `table_ids: [" table-id "]` to list the "
                               "source table's foreign-key columns, then set `source-field` on the field "
                               "clause to the one you mean.")})))

(def ^:private list-fields-step
  {:uses #{"read_resource"}
   :text "Call `read_resource` with `metabase://table/<numeric id>/fields` to list this table's columns."})

(def ^:private metric-dimensions-step
  {:uses #{"read_resource"}
   :text (str "If a metric relates to that table, read its dimensions resource "
              "`metabase://metric/<metric_id>/dimensions`, which lists the exact `joins:` clause to paste "
              "and the columns it unlocks.")})

(def ^:private content-entity-id-steps
  [{:uses #{"read_resource"}
    :text (str "Do not invent or guess entity_ids: call `read_resource` with `metabase://question/<numeric id>`, "
               "`metabase://model/<numeric id>` or `metabase://metric/<numeric id>` first, then copy the exact "
               "`portable_entity_id` from the response.")}
   {:uses #{"search"}
    :text (str "Call `search` to find the question, model or metric, then copy the exact `portable_entity_id` "
               "from its result.")}])

(def ^:private measure-entity-id-step
  {:uses #{"read_resource"}
   :text (str "Do not invent or guess entity_ids: read the table that owns the measure with `read_resource` "
              "(`metabase://table/<numeric id>`) and copy the exact `portable_entity_id` from its "
              "`<measure>` tag.")})

(def ^:private segment-entity-id-step
  {:uses #{"read_resource"}
   :text (str "Do not invent or guess entity_ids: read the table that owns the segment with `read_resource` "
              "(`metabase://table/<numeric id>`) and copy the exact `portable_entity_id` from its "
              "`<segment>` tag.")})

(def ^:private database-name-step
  ;; Names no tool, so it survives into every profile: the advice is about where the database name
  ;; comes from in data the agent already has, not about making another call.
  {:uses #{}
   :text (str "Use the exact database name as it appears in the data you already have — it is the first "
              "element of every portable FK, e.g. `source-table: [<db-name>, <schema>, <table>]`.")})

(def ^:private first-stage-source-step
  {:uses #{}
   :text (str "`source-table:` takes a portable FK `[<db-name>, <schema>, <table>]`; `source-card:` takes an "
              "entity_id string.")})

(def unrecoverable
  "Pipeline `:error` codes the model can't fix by changing its query, each mapped to a function from the
  error's ex-data to the message the user is shown, or to nil for the generic one.

  They come from duplicate names in the app DB's metadata or from content that can't be exported, so
  `tools.core/with-pipeline-errors` turns them into unrecoverable errors that end the turn instead of
  sending the agent to retry."
  {:ambiguous-database-name   (fn [{:keys [database]}]
                                (tru "More than one database is named {0}, so Metabot can''t tell which one to query. An admin can rename one of them."
                                     database))
   :ambiguous-table           (fn [{[_db _schema table] :path}]
                                (tru "This database has more than one table named {0}, so Metabot can''t tell which one to query."
                                     table))
   :ambiguous-field           (fn [{[_db _schema table] :path segment :segment}]
                                (tru "The table {0} has more than one column named {1}, so Metabot can''t tell which one to use."
                                     table segment))
   :unknown-database-id       (constantly nil)
   :missing-card-entity-id    (constantly nil)
   :missing-measure-entity-id (constantly nil)
   :missing-segment-entity-id (constantly nil)})

;;; ------------------------------------------- Declarations -------------------------------------------------------

(defmacro ^:private defpipeline-error
  "Declare the recoverable error for one pipeline `:error` code.

  The message is always the pipeline's own sentence, so a declaration only has to say how to
  recover: `recovery` is a vector of recovery steps, usually the shared ones above. Use
  `defrecoverable` directly for a code whose recovery depends on the payload."
  {:style/indent [:defn]}
  [sym docstring recovery]
  `(defrecoverable ~sym ~docstring {:payload ::payload} [payload#]
     {:message  (:message payload#)
      :recovery ~recovery}))

;;; Table resolution

(defrecoverable unknown-table!
  "A portable FK `[db, schema, table]` in `source-table:` matched no active table."
  {:payload ::payload}
  [{:keys [message database-id]}]
  {:message  message
   :recovery (list-tables-steps database-id)})

(defpipeline-error unknown-table-id!
  "A numeric table id did not resolve."
  ;; Not `list-tables-step`: this is a numeric-id miss, and pointing the agent at a portable FK
  ;; would be advice for the other failure. v1 authors portable FKs, so the move is to find the
  ;; table by name and use its portable FK.
  [{:uses #{"read_resource"}
    :text (str "That numeric table id does not resolve. Call `read_resource` with "
               "`metabase://database/<numeric id>/tables` to find the table, then use its portable FK "
               "`[<db-name>, <schema>, <table-name>]` in `source-table:`.")}])

;;; Database resolution

(defpipeline-error unknown-database!
  "The database name in a portable FK matched no database."
  [database-name-step])

;;; Field resolution

(defrecoverable unknown-field!
  "A field reference named no column of its source."
  {:payload ::payload}
  [{:keys [message table-id]}]
  {:message  message
   :recovery (list-fields-steps table-id)})

(defpipeline-error unknown-field-id!
  "A numeric field id did not resolve."
  [list-fields-step])

(defpipeline-error invalid-field-fk!
  "A field's portable FK was not a well-formed `[db, schema, table, field]` path."
  [list-fields-step])

(defpipeline-error numeric-field-id!
  "A field was referenced by numeric id where a portable FK is required."
  [list-fields-step])

(defpipeline-error unresolved-cross-stage-field!
  "A later stage referenced a column no earlier stage returns."
  [])

;;; Joins

(defrecoverable ambiguous-fk!
  "More than one foreign key connects the two tables, so the join path is ambiguous."
  {:payload ::payload}
  [{:keys [message table-id]}]
  {:message  message
   :recovery (list-fks-steps table-id)})

(defpipeline-error ambiguous-fk-via-join!
  "More than one foreign key connects the joined tables, so the join path is ambiguous."
  [])

(defpipeline-error no-fk-path!
  "No foreign key connects the two tables, so they cannot be joined implicitly."
  [metric-dimensions-step])

;;; Saved entities

(defpipeline-error unknown-card!
  "A `source-card:` entity_id matched no question or model."
  content-entity-id-steps)

(defpipeline-error unknown-card-id!
  "A numeric card id did not resolve."
  content-entity-id-steps)

(defpipeline-error cross-database-card!
  "The referenced card belongs to a different database than the query."
  ;; No step: the fix is to pick a different source entirely, and which one depends on the question
  ;; the agent is answering, not on anything it can look up.
  [])

(defpipeline-error unknown-measure!
  "A measure entity_id matched no measure."
  [measure-entity-id-step])

(defpipeline-error unknown-measure-id!
  "A numeric measure id did not resolve."
  [measure-entity-id-step])

(defpipeline-error cross-database-measure!
  "The referenced measure belongs to a different database than the query."
  [])

(defpipeline-error unknown-segment!
  "A segment entity_id matched no segment."
  [segment-entity-id-step])

(defpipeline-error unknown-segment-id!
  "A numeric segment id did not resolve."
  [segment-entity-id-step])

(defpipeline-error cross-database-segment!
  "The referenced segment belongs to a different database than the query."
  [])

;;; Query shape

(defpipeline-error missing-source-in-first-stage!
  "The first stage declared neither `source-table:` nor `source-card:`."
  [first-stage-source-step])

(defpipeline-error unknown-stage-key!
  "A stage carried a key the representations format does not define."
  [])

(defpipeline-error invalid-representations-query!
  "The query did not parse as a representations query."
  [])

(defpipeline-error invalid-external-query!
  "A query supplied from outside the pipeline was not a valid MBQL query."
  [])

(defpipeline-error query-not-runnable!
  "The query parsed but would not run — the editor's own run gate rejects it."
  [])

(defpipeline-error not-implemented-yet!
  "The query used a representations feature the pipeline does not support yet."
  ;; No step: nothing the agent does to this query will make the feature exist. It can still make
  ;; progress by answering a different way, which is why this is recoverable rather than a dead end.
  [])

;;; Aggregations and expressions

(defpipeline-error aggregation-entry-not-aggregation!
  "An entry under `aggregation:` was not an aggregation clause."
  [])

(defpipeline-error aggregation-ref-no-aggregations!
  "An aggregation reference appeared in a stage with no aggregations."
  [])

(defpipeline-error aggregation-ref-out-of-range!
  "An aggregation reference pointed past the stage's aggregation list."
  [])

(defpipeline-error blank-expression-ref!
  "An expression reference named no expression."
  [])

(defpipeline-error case-default-in-opts!
  "A `case` expression put its default in the options map instead of the clause."
  [])

(defpipeline-error sexp-legacy-op-as-clause!
  "A legacy MBQL operator was written where a representations s-expression belongs."
  [])

(defpipeline-error expression-editor-rejection!
  "The expression editor rejected the expression."
  [])

(defpipeline-error post-agg-filter-needs-multi-stage!
  "A filter on an aggregate needs its own stage after the aggregating one."
  [])

(defpipeline-error post-agg-filter-with-trailing-clauses!
  "A post-aggregation filter was combined with clauses that have to precede it."
  [])

;;; Temporal handling

(defpipeline-error invalid-temporal-literal!
  "A temporal literal was not in a format the pipeline can parse."
  [])

(defpipeline-error temporal-unit-on-non-temporal-column!
  "A temporal bucket was applied to a column that is not a date or time."
  [list-fields-step])

(defpipeline-error unencodable-temporal-clause!
  "A temporal clause has no representations encoding."
  [])

;;; Payload-dependent

(defrecoverable uri-in-source-table!
  "A `metabase://` URI was used where `source-table:` expects a portable FK."
  {:payload ::payload}
  [{:keys [message entity-type entity-id]}]
  ;; The right correction depends on what the URI pointed at: a metric is not a source at all, a
  ;; card goes in a different key, and a table needs its portable FK.
  {:message  message
   :recovery [(case entity-type
                "metric"
                {:uses #{"read_resource"}
                 :text (str "Metrics are aggregations, not sources. To use metric " entity-id
                            ", put its base table into `source-table:` — combine the `database_name` and "
                            "`base_table_fully_qualified_name` attributes from its search result or "
                            "`read_resource metabase://metric/" entity-id "` — and reference the metric as "
                            "`aggregation: [[metric, {}, \"<portable_entity_id>\"]]`.")}

                ("question" "model" "card")
                {:uses #{"read_resource"}
                 :text (str "To reference a saved question or model as a query source, put its "
                            "`portable_entity_id` (the 21-char string from its search result or "
                            "`read_resource`) into `source-card:` — not a URI.")}

                "table"
                {:uses #{"read_resource"}
                 :text (str "Use the portable FK `[<db-name>, <schema>, <table-name>]` in `source-table:` — "
                            "not a URI. `read_resource metabase://table/" entity-id
                            "` reports the exact names.")}

                first-stage-source-step)]})
