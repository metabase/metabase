(ns metabase.metabot.tools.util
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.metabot.db :as metabot.db]
   [metabase.models.interface :as mi]
   [metabase.util :as u]))

(defn handle-agent-error
  "Return an agent output for agent errors, re-throw `e` otherwise.
   Preserves :status-code and :terminal-error? from ex-data."
  [e]
  (let [{:keys [agent-error? status-code terminal-error?]} (ex-data e)]
    (if agent-error?
      (cond-> {:output (ex-message e)}
        status-code     (assoc :status-code status-code)
        terminal-error? (assoc :terminal-error? true))
      (throw e))))

(defn convert-field-type
  "Return tool type for `column`."
  [column]
  (let [column (u/normalize-map column)]
    (cond
      (lib.types.isa/boolean? column)                :boolean
      (lib.types.isa/string-or-string-like? column)  :string
      (lib.types.isa/numeric? column)                :number
      (isa? (:effective-type column) :type/DateTime) :datetime
      (isa? (:effective-type column) :type/Time)     :time
      (lib.types.isa/temporal? column)               :date)))

(defn add-table-reference
  "Add table-reference to columns that have FK relationships."
  [query col]
  (cond-> col
    (and (:fk-field-id col)
         (:table-id col))
    (assoc :table-reference (->> (lib.metadata/field query (:fk-field-id col))
                                 (lib/display-name query)
                                 lib/display-name-without-id))))

(defn- column-portable-fk
  "Build the portable FK path `[db-name, schema-or-null, table-name, field-name …]` for a column
  that has a real numeric `:id`. Returns nil for expression / aggregation columns that don't
  correspond to a database field."
  [query column]
  (when (and (:id column) (:table-id column))
    (let [table (lib.metadata/table query (:table-id column))
          db    (lib.metadata/database query)
          ;; walk the `:parent-id` chain in case this is a JSON-unfolded nested field
          chain (loop [acc [(:name column)]
                       pid (:parent-id column)]
                  (if pid
                    (let [parent (lib.metadata/field query pid)]
                      (recur (cons (:name parent) acc) (:parent-id parent)))
                    acc))]
      (when (and (:name db) (:name table))
        (into [(:name db) (:schema table) (:name table)] chain)))))

(defn- fk-target-portable-fk
  "If `column` is an FK (has a non-nil `:fk-target-field-id`), return the portable FK path of
  the target field, walking the parent-id chain for JSON-unfolded targets. Returns nil for
  non-FK columns or when the target can't be resolved."
  [query column]
  (when-let [tgt-id (:fk-target-field-id column)]
    (when-let [tgt (lib.metadata/field query tgt-id)]
      (column-portable-fk query tgt))))

(defn ->result-column
  "Return tool result column for `column` of `query`.
  Uses the real field `:id` when available, falling back to column name for
  expression/aggregation columns that don't have a database field ID.

  Also includes a `:portable_fk` key with the portable foreign-key path
  `[db-name, schema, table-name, field-name …]` when the column maps to a real database field.
  The representations-format notebook query tool expects fields to be referenced by this path
  rather than by numeric id."
  [query column]
  (let [base-type         (some-> (:base-type column) u/qualified-name)
        effective-type    (some-> (:effective-type column) u/qualified-name)
        semantic-type     (some-> (:semantic-type column) u/qualified-name)
        coercion-strategy (some-> (:coercion-strategy column) u/qualified-name)
        field-id          (or (:id column)
                              (:lib/desired-column-alias column)
                              (:lib/source-column-alias column))
        portable-fk       (try (column-portable-fk query column)
                               (catch Exception _ nil))
        fk-target-fk      (try (fk-target-portable-fk query column)
                               (catch Exception _ nil))]
    (-> {:field_id field-id
         :name (or (:lib/desired-column-alias column)
                   (:lib/source-column-alias column))
         :display_name (lib/display-name query (dissoc column :table-reference))
         :type (convert-field-type column)}
        (m/assoc-some :description (:description column)
                      :base_type base-type
                      :effective_type (when (not= effective-type base-type) effective-type)
                      :semantic_type semantic-type
                      :database_type (:database-type column)
                      :coercion_strategy coercion-strategy
                      :field_values (:field-values column)
                      :portable_fk portable-fk
                      :fk_target_portable_fk fk-target-fk
                      :table_reference (:table-reference column)))))

(defn find-column-by-field-id
  "Find a column in `columns` by its real field ID.
  `field-id` may be an integer or a string-encoded integer.
  Returns the matching column or throws an agent error if not found."
  [field-id columns]
  (let [numeric-id (cond
                     (int? field-id) field-id
                     (string? field-id) (parse-long field-id)
                     :else nil)]
    (or (when numeric-id
          (m/find-first #(= (:id %) numeric-id) columns))
        (throw (ex-info (str "Field " field-id " not found")
                        {:agent-error? true
                         :status-code  404
                         :field-id     field-id})))))

(defn schedule->schedule-map
  "Convert a tool schedule map to the schedule-map format used by cron and pulse channels.
  E.g. {:frequency :daily :hour 9} => {:schedule_type \"daily\" :schedule_hour 9 ...}"
  [{:keys [frequency hour day-of-week day-of-month]}]
  {:schedule_type  (name frequency)
   :schedule_hour  hour
   :schedule_day   (or (some-> day-of-week name (subs 0 3) u/lower-case-en)
                       (some->> day-of-month
                                name
                                u/lower-case-en
                                (re-find #"^(?:first|last)-(mon|tue|wed|thu|fri|sat|sun)")
                                second))
   :schedule_frame (some->> day-of-month name (re-find #"^(?:first|mid|last)"))})

(defn get-database
  "Get the `fields` of the database with ID `id`."
  [id & fields]
  (-> (metabot.db/database-with-columns (into [:model/Database :id] fields) id)
      api/read-check))

(defn get-table
  "Get the `fields` of the table with ID `id`."
  [id & fields]
  (-> (metabot.db/active-table-with-columns (into [:model/Table :id] fields) id)
      api/read-check))

(defn get-card
  "Retrieve the card with `id` from the app DB."
  [id]
  (-> (metabot.db/card id)
      api/read-check))

(defn get-card-by-entity-id
  "Retrieve a readable card by its 21-char NanoID `entity_id`, or `nil` if not found. Used by
  [[metabase.metabot.tools.construct/resolve-database-id-from-first-stage]] to look up the
  database-id of a `source-card:` stage before the metadata provider is built.

  Does NOT go through the serdes `lookup-by-id` machinery because we want `nil` on miss
  (not a thrown exception) so the caller can surface a tool-specific agent error. If the
  card exists but the current user cannot read it, `api/read-check` raises a 403 instead of
  silently letting the representations resolver use an inaccessible card."
  [entity-id]
  (some-> (metabot.db/card-by-entity-id entity-id)
          api/read-check))

(defn card-query
  "Return a query based on the card with ID `card-id`."
  [card-id]
  (when-let [card (get-card card-id)]
    (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
      (lib/query mp (cond-> (lib.metadata/card mp card-id)
                      ;; pivot questions have strange result-columns so we work with the dataset-query
                      (#{:question} (:type card)) (get :dataset-query))))))

(defn metric-query
  "Return a query based on the metric with ID `metric-id`."
  [metric-id]
  (when-let [card (get-card metric-id)]
    (let [mp (lib-be/application-database-metadata-provider (:database_id card))]
      (lib/query mp (lib.metadata/metric mp metric-id)))))

(defn table-query
  "Return a query based on the table with ID `table-id`."
  [table-id]
  (when-let [table (get-table table-id :db_id)]
    (let [mp (lib-be/application-database-metadata-provider (:db_id table))]
      (lib/query mp (lib.metadata/table mp table-id)))))

(defn- destination-db-ids
  "Returns the subset of `db-ids` that back a destination (routed) database -- routing internals
  reachable only through their router database (see
  [[metabase.metabot.tools.resources/check-resource-database]])."
  [db-ids]
  (when (seq db-ids)
    (metabot.db/destination-database-ids db-ids)))

(defn get-metrics-and-models
  "Retrieve the metric and model cards for the Metabot instance with ID `metabot-id` from the app DB.

  Only cards visible to the current user are returned, excluding those backed by a destination
  (routed) database (see [[destination-db-ids]])."
  [metabot-id & {:keys [limit]}]
  (let [cards (metabot.db/metabot-metrics-and-models metabot-id limit)
        destination-ids (destination-db-ids (into #{} (keep :database_id) cards))]
    (if (seq destination-ids)
      (remove #(contains? destination-ids (:database_id %)) cards)
      cards)))

;;; ------------------------------------------ metric sources ------------------------------------------
;;;
;;; One answer to "what source must this metric be consumed from?", shared by the three surfaces that ask:
;;; the `construct_notebook_query` gate, `metric-details`, and search enrichment. They disagreed before, and
;;; a metric paired with the wrong source is a QP `Incompatible metric` throw -- a 500 to the user.

(defn metric-card-shape-get
  "Read a key off either card shape the metric surfaces accept: `kebab-k` on a lib metadata map, `snake-k` on a t2 row.

  Dispatches on `:lib/type` rather than probing both with `or`: a lib metadata map is a `SnakeHatingMap` that throws
  a deprecation error on a snake_case read, so the fallback arm must be unreachable for that shape. Every key read
  through here is legitimately nil on some cards, which is exactly when an `or` would reach it."
  [card kebab-k snake-k]
  (if (:lib/type card)
    (get card kebab-k)
    (get card snake-k)))

(defn readable-source-cards
  "`{card-id -> row}` for the cards in `card-ids` the current user may read, in one column-restricted select.

  The rows carry `:name` and `:entity_id` for display, and the columns `can-read?` needs to answer on the narrowed
  row itself. Cards that no longer exist are simply absent, which is why callers prefer this to the pk arity of
  `can-read?` -- that one resolves the row and throws when it is gone."
  [card-ids]
  (when (seq card-ids)
    (into {}
          (comp (filter mi/can-read?) (map (juxt :id identity)))
          (metabot.db/card-source-rows card-ids))))

(defn metric-required-source
  "The one source `card` -- a metric -- can be consumed from, or nil when its definition cannot be read.

    {:kind :card,  :card-id C}
    {:kind :table, :table-id T, :bare-table-only? <boolean>}

  Mirrors the QP's rule (see [[metabase.query-processor.middleware.metrics]], `splice-compatible-metrics`), which
  compares the consuming query against the metric definition *after* full preprocessing:

    (and (= (primary-source-table-id query) (primary-source-table-id metric-query))
         (or (= (stage-count metric-query) 1)
             (= (:qp/stage-had-source-card (last (:stages metric-query)))
                (:qp/stage-had-source-card (query-stage query agg-stage-index)))))

  Two facts collapse that into a read of the *unresolved* definition, with no preprocessing:

  1. `:qp/stage-had-source-card` is the source card's id, stamped on the stage that literally carried `:source-card`;
     resolution splices the card's own stages in *front* of it.
  2. Only the initial stage of a query may carry a source at all (`:metabase.lib.schema/stage.additional`).

  So the metric's last stage carries a `:source-card` exactly when the definition is single-stage and card-based,
  and the rule is a three-way classification:

  | definition                  | required source                                                          |
  |-----------------------------|--------------------------------------------------------------------------|
  | 1 stage, `:source-table T`  | table T -- any stage resolving to T, including a `source-card:` over it   |
  | 1 stage, `:source-card C`   | card C, exactly                                                          |
  | 2+ stages, `:source-table T`| table T, and only a bare `source-table:` stage                           |
  | 2+ stages, `:source-card C` | the *base table* -- its last stage carries no `:source-card`             |

  That last row is why this reads the stages rather than `report_card.source_card_id`: that column is
  `lib/primary-source-card-id`, i.e. stage *0*, where the QP reads the *last* stage. The two disagree exactly for a
  multi-stage card-based metric, whose only usable source is the base table `report_card.table_id` already resolves
  to.

  `:table-id` is legitimately nil (a metric over a native question); callers treat that as no usable source.

  A legacy definition (lib metadata's `:dataset-query` is not guaranteed to be MBQL 5 yet) is converted first rather
  than read as stageless: its `\"card__N\"` source is exactly the card-based case, and falling back to the table for it
  would offer the base table the QP rejects.

  When the definition itself cannot be read -- a blank `dataset_query` (see
  [[metabase.queries.models.card/monitor-blank-dataset-query]], which exists because MBQL 4->5 conversion failures
  really do ship these) or a legacy one that fails to convert -- falls back to `report_card.table_id`, read as
  single-stage. Returns nil only when there is no table either."
  [card]
  (let [definition (metric-card-shape-get card :dataset-query :dataset_query)
        stages     (or (not-empty (:stages definition))
                       (when (seq definition)
                         (try
                           (:stages (lib/->mbql5 definition))
                           (catch Exception _ nil))))
        table-id   (metric-card-shape-get card :table-id :table_id)]
    (cond
      (seq stages)
      (if-let [card-id (and (= 1 (count stages)) (:source-card (first stages)))]
        {:kind :card, :card-id card-id}
        {:kind             :table
         :table-id         table-id
         :bare-table-only? (> (count stages) 1)})

      table-id
      {:kind :table, :table-id table-id, :bare-table-only? false})))

(defn metric-compatible-with-stage?
  "Can a metric requiring `required` (from [[metric-required-source]]) be spliced into a stage whose source is
  `stage-card-id` / `stage-table-id`? `stage-table-id` is the stage's *resolved* primary table -- for a
  `source-card:` stage, the table that card reads from."
  [required {:keys [stage-card-id stage-table-id]}]
  (case (:kind required)
    :card  (= (:card-id required) stage-card-id)
    :table (and (some? (:table-id required))
                (= (:table-id required) stage-table-id)
                (or (not (:bare-table-only? required))
                    (nil? stage-card-id)))
    (throw (ex-info "Unrecognized metric source kind" {:required required}))))
