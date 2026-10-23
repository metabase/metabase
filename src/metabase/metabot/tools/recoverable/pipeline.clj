(ns metabase.metabot.tools.recoverable.pipeline
  "One declared recoverable error per `:error` code the representations pipeline raises.

  The pipeline (`metabase.agent-lib.representations*`, `metabase.metabot.tools.construct`,
  `metabase.models.serialization.resolve.mp`) throws a bare statement of what went wrong plus
  structured `ex-data` carrying an `:error` keyword. It deliberately knows nothing about which tools
  its caller has, so it cannot say how to recover. This namespace supplies that half: each `:error`
  code gets a declaration whose recovery steps are written in the tool vocabulary — `read_resource`,
  `metabase://` URIs, portable FKs, `portable_entity_id` — and `tools.core/with-pipeline-errors`
  converts a pipeline exception into the matching declaration.

  The pipeline's own message, flattened validation paths, and entity references are the foreign
  text a payload here may carry. Everything else about the exception stays in the logs.

  A code with no declaration is not converted and becomes unrecoverable, which is why
  `metabase.metabot.tools.recoverable.pipeline-test` scans the pipeline sources and fails when a
  code here is missing. Recovery steps start from `metabase.metabot.tools.recovery-hints`, with
  `tru` removed — these are model-facing, not user-facing. A code whose recovery would be guesswork
  gets no steps at all: a missing step reads as terse, a wrong one sends the agent at the wrong
  tool."
  (:require
   [clojure.string :as str]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.tools.error :refer [defrecoverable]]
   [metabase.models.interface :as mi]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(mr/def ::payload
  "The payload every pipeline-error declaration takes.

  `:message` is the pipeline's own sentence. `:paths` is the flattened structural validation text
  the model reads. `:entity-type` and `:entity-id` are present only for the codes whose recovery
  depends on what was referenced (see [[uri-in-source-table!]]).
  `:source-card` and `:source-card-type` are the numeric ID and type of the stage's `source-card:`,
  present only for the codes a `source-card:` stage raises (see [[column-not-returned!]]).
  `:table-id` and `:database-id` are present only for the codes whose recovery steps name that
  table or database (see [[payload]])."
  [:map {:closed true}
   [:message          :string]
   [:paths            {:optional true} :string]
   [:entity-type      {:optional true} [:maybe :string]]
   [:entity-id        {:optional true} [:maybe [:or :string :int]]]
   [:source-card      {:optional true} [:maybe :int]]
   [:source-card-type {:optional true} [:maybe [:enum "model" "question"]]]
   [:table-id         {:optional true} pos-int?]
   [:database-id      {:optional true} pos-int?]])

(defn readable-database-id
  "The `:database-id` of the pipeline error `data`, when the current user can read that database.

  Never returns a routing destination's id."
  [data]
  (let [id (:database-id data)]
    (when (and (pos-int? id)
               ;; `read_resource` 404s on a destination even when the user can read its router.
               (empty? (metabot.db/destination-database-ids #{id}))
               (mi/can-read? :model/Database id))
      id)))

(def ^:private id-keys
  "For each code whose recovery steps name a table or a database, a map from the payload key to the
  function that reads that id from the `ex-data`."
  {:unknown-table   {:database-id readable-database-id}
   :ambiguous-table {:database-id readable-database-id}
   :unknown-field   {:table-id :table-id}
   :ambiguous-fk    {:table-id :source-table}})

(defn payload
  "The [[::payload]] for the pipeline exception `e`, whose `:error` code is `error`.

  A database id is kept only when [[readable-database-id]] returns it."
  [error e]
  (let [{:keys [entity-type entity-id source-card source-card-type] :as data} (ex-data e)
        {:keys [table-id database-id]} (update-vals (id-keys error) #(% data))]
    (cond-> {:message (or (ex-message e) "")}
      entity-type         (assoc :entity-type entity-type)
      (some? entity-id)   (assoc :entity-id entity-id)
      source-card         (assoc :source-card source-card
                                 :source-card-type source-card-type)
      ;; The pipeline checks permissions on the query's tables, but finds its database by name first.
      (pos-int? table-id) (assoc :table-id table-id)
      database-id         (assoc :database-id database-id))))

;;; ------------------------------------------- Shared recovery steps ----------------------------------------------

;; Each step names the tools its text mentions in `:uses`, so a profile without `read_resource` gets
;; the error with that step dropped rather than advice it cannot follow.

(defn- with-id
  "`step` with the `<numeric id>` in its text replaced by `id`, or unchanged when `id` is nil."
  [step id]
  (cond-> step
    id (update :text str/replace "<numeric id>" (str id))))

(def ^:private list-tables-step
  {:uses #{"read_resource"}
   :text (str "Call `read_resource` with `metabase://database/<numeric id>/tables` to list the available "
              "tables and schemas, then retry with an exact portable FK from the response.")})

(def ^:private list-fields-step
  {:uses #{"read_resource"}
   :text "Call `read_resource` with `metabase://table/<numeric id>/fields` to list this table's columns."})

(def ^:private list-fks-step
  {:uses #{"read_resource"}
   :text (str "Call `read_resource` with `metabase://table/<numeric id>/fields` for the source table to list "
              "the available foreign-key columns.")})

(def ^:private metric-dimensions-step
  {:uses #{"read_resource"}
   :text (str "If a metric relates to that table, read its dimensions resource "
              "`metabase://metric/<metric_id>/dimensions`, which lists the exact `joins:` clause to paste "
              "and the columns it unlocks.")})

(def ^:private card-entity-id-step
  {:uses #{"read_resource"}
   :text (str "Do not invent or guess entity_ids: call `read_resource` with "
              "`metabase://question/<numeric id>` or `metabase://model/<numeric id>` first, then copy the "
              "exact `portable_entity_id` from the response into `source-card:`.")})

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

(def ^:private cross-database-step
  {:uses #{}
   :text (str "A query can only reference saved questions, models, metrics, measures and segments "
              "from its own database. Use one from that database, or change the source to a table "
              "in the referenced item's database.")})

(defn- card-fields-step
  "Return a recovery step listing `what` from the source card, or nil when `payload` names no card."
  [{:keys [source-card source-card-type]} what]
  (when (and source-card source-card-type)
    {:uses #{"read_resource"}
     :text (str "Call `read_resource` with `metabase://" source-card-type "/" source-card "/fields` to list the "
                what " this " source-card-type " returns.")}))

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
   :recovery [(with-id list-tables-step database-id)]})

(defpipeline-error unknown-table-id!
  "A numeric table id did not resolve."
  ;; Not `list-tables-step`: this is a numeric-id miss, and pointing the agent at a portable FK
  ;; would be advice for the other failure. v1 authors portable FKs, so the move is to find the
  ;; table by name and use its portable FK.
  [{:uses #{"read_resource"}
    :text (str "That numeric table id does not resolve. Call `read_resource` with "
               "`metabase://database/<numeric id>/tables` to find the table, then use its portable FK "
               "`[<db-name>, <schema>, <table-name>]` in `source-table:`.")}])

(defrecoverable ambiguous-table!
  "A portable FK matched more than one table."
  {:payload ::payload}
  [{:keys [message database-id]}]
  {:message  message
   :recovery [(-> {:uses #{"read_resource"}
                   :text (str "Call `read_resource` with `metabase://database/<numeric id>/tables` to list the "
                              "available tables and retry with a more specific portable FK.")}
                  (with-id database-id))]})

;;; Database resolution

(defpipeline-error unknown-database!
  "The database name in a portable FK matched no database."
  [database-name-step])

(defpipeline-error unknown-database-id!
  "A numeric database id did not resolve."
  [database-name-step])

(defpipeline-error ambiguous-database-name!
  "The database name in a portable FK matched more than one database."
  [{:uses #{}
    :text "Ask the user to rename one of the databases."}])

;;; Field resolution

(defrecoverable unknown-field!
  "A field reference named no column of its source."
  {:payload ::payload}
  [{:keys [message table-id]}]
  {:message  message
   :recovery [(with-id list-fields-step table-id)]})

(defpipeline-error unknown-field-id!
  "A numeric field id did not resolve."
  [list-fields-step])

(defpipeline-error ambiguous-field!
  "A field reference matched more than one column."
  [{:uses #{}
    :text (str "The field name matches more than one column in this table, so it cannot be referenced by name. "
               "Tell the user about the ambiguous column name.")}])

(defpipeline-error invalid-field-fk!
  "A field's portable FK was not a well-formed `[db, schema, table, field]` path."
  [list-fields-step])

(defpipeline-error numeric-field-id!
  "A field was referenced by numeric id where a portable FK is required."
  [list-fields-step])

(defpipeline-error unresolved-cross-stage-field!
  "A later stage referenced a column no earlier stage returns."
  [list-fields-step])

(defpipeline-error unresolved-join-alias-field!
  "A reference through a join alias named a column that join does not return."
  ;; No step: the message already lists the columns the join returns, and for a grouped join those
  ;; are its breakouts and aggregations, not a table's fields.
  [])

(defrecoverable column-not-returned!
  "A field on a `source-card:` stage is on a table the card reads but is not a column the card returns."
  {:payload ::payload}
  [payload]
  {:message  (:message payload)
   :recovery (filterv some? [(card-fields-step payload "columns")])})

;;; Joins

(defrecoverable ambiguous-fk!
  "More than one foreign key connects the two tables, so the join path is ambiguous."
  {:payload ::payload}
  [{:keys [message table-id] :as payload}]
  {:message  message
   :recovery [(or (card-fields-step payload "foreign-key columns") (with-id list-fks-step table-id))]})

(defrecoverable unexportable-fk!
  "The only foreign key that reaches a field's table could not be resolved, so the field cannot be reached implicitly."
  {:payload ::payload}
  [payload]
  {:message  (:message payload)
   :recovery (filterv some? [(card-fields-step payload "columns")])})

(defpipeline-error ambiguous-fk-via-join!
  "More than one foreign key connects the joined tables, so the join path is ambiguous."
  [list-fks-step])

(defpipeline-error no-fk-path!
  "No foreign key connects the two tables, so they cannot be joined implicitly."
  [metric-dimensions-step])

(defpipeline-error wrong-source-field!
  "A field reference's `source-field` is not a foreign key to the table its column is on."
  [list-fks-step])

;;; Saved entities

(defpipeline-error unknown-card!
  "A `source-card:` entity_id matched no question or model."
  [card-entity-id-step])

(defpipeline-error unknown-card-id!
  "A numeric card id did not resolve."
  [card-entity-id-step])

(defpipeline-error missing-card-entity-id!
  "The referenced card has no stored `entity_id`, so the query cannot be exported."
  ;; The stored card has no portable ID for `read_resource` to return.
  [])

(defpipeline-error cross-database-card!
  "The referenced card belongs to a different database than the query."
  [cross-database-step])

(defpipeline-error unknown-measure!
  "A measure entity_id matched no measure."
  [measure-entity-id-step])

(defpipeline-error unknown-measure-id!
  "A numeric measure id did not resolve."
  [measure-entity-id-step])

(defpipeline-error missing-measure-entity-id!
  "The referenced measure has no stored `entity_id`, so the query cannot be exported."
  ;; The stored measure has no portable ID for `read_resource` to return.
  [])

(defpipeline-error cross-database-measure!
  "The referenced measure belongs to a different database than the query."
  [cross-database-step])

(defpipeline-error unknown-segment!
  "A segment entity_id matched no segment."
  [segment-entity-id-step])

(defpipeline-error unknown-segment-id!
  "A numeric segment id did not resolve."
  [segment-entity-id-step])

(defpipeline-error missing-segment-entity-id!
  "The referenced segment has no stored `entity_id`, so the query cannot be exported."
  ;; The stored segment has no portable ID for `read_resource` to return.
  [])

(defpipeline-error cross-database-segment!
  "The referenced segment belongs to a different database than the query."
  [cross-database-step])

(defpipeline-error incompatible-metric!
  "A metric was used with an incompatible stage source."
  ;; No step: the message names the source each metric needs, or says it has none.
  [])

;;; Query shape

(defpipeline-error missing-source-in-first-stage!
  "The first stage declared neither `source-table:` nor `source-card:`."
  [first-stage-source-step])

(defpipeline-error unknown-stage-key!
  "A stage carried a key the representations format does not define."
  [])

(defn- structural-recovery
  [{:keys [paths]}]
  (if (seq paths)
    [{:uses #{} :text (str "Invalid at " paths ". Fix the named paths.")}]
    []))

(defrecoverable invalid-representations-query!
  "The query did not parse as a representations query."
  {:payload ::payload}
  [payload]
  {:message (:message payload), :recovery (structural-recovery payload)})

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
                            ", build the stage on the source specified by its `<metric>` tag (in its search result or "
                            "`read_resource metabase://metric/" entity-id "`): `base_table_fully_qualified_name` "
                            "with `database_name` as `source-table:`, or `source_card_portable_entity_id` as "
                            "`source-card:`. Then reference the metric as "
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
