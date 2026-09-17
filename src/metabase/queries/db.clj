(ns metabase.queries.db
  "Application database queries for the queries module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration
  methods."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

;;; The queries below follow [[::card-opts]], [[::parameter-card-opts]], [[::query-opts]],
;;; [[::query-execution-opts]], [[::query-table-opts]], [[::stored-result-opts]] and [[::stored-result-use-opts]];
;;; queries that do not fit one of those live in the queries-only section at the bottom of this namespace.

;;; ==================================================== Card ====================================================

(mr/def ::card-filters
  "Which Cards a query applies to. Keys mirror the columns of `report_card`: a scalar matches that value and a set
  matches any of its values. A nullable column also takes a `<column>_set` key, matching the rows where that column
  is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:id               {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:source_card_id   {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:document_id      {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:creator_id       {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:database_id      {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]
   [:table_id         {:optional true} [:or ::lib.schema.id/table [:set ::lib.schema.id/table]]]
   [:collection_id    {:optional true} [:maybe ::lib.schema.id/collection]]
   [:dashboard_id     {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:archived         {:optional true} :boolean]
   [:type             {:optional true} [:or ::queries.schema/card.type [:set ::queries.schema/card.type]]]
   [:display          {:optional true} [:or :keyword :string [:set [:or :keyword :string]]]]
   [:enable_embedding {:optional true} :boolean]
   [:public_uuid_set  {:optional true} :boolean]])

(mr/def ::card-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::card-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::queries.schema/card.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::queries.schema/card.column
                                              [:tuple ::queries.schema/card.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private card-set-columns
  "Maps each `<column>_set` filter key to the column whose nullness it tests."
  {:public_uuid_set :public_uuid})

(def ^:private card-lower-columns
  "Text columns ordered case-insensitively, so `Zebra` does not sort ahead of `apple`."
  #{:name})

(mu/defn- ->card-model
  "`columns`, narrowed to a Toucan 2 select target. `:card_schema` rides along with any narrowed select: the model's
  after-select hook throws if a plausible Card row (one with `:id` and `:dataset_query`, `:result_metadata`,
  `:database_id` or `:type`) is missing it."
  [columns :- [:maybe [:sequential :keyword]]]
  (u.query/model-with-columns :model/Card (when (seq columns) (distinct (cons :card_schema columns)))))

(defn- ->card-args
  [opts]
  (u.query/opts->args opts {:set-columns card-set-columns, :lower-columns card-lower-columns}))

(defn- ->card-kv-args
  [opts]
  (u.query/opts->kv-args opts {:set-columns card-set-columns}))

;;; ---- Reads ----

(mu/defn select-cards :- [:sequential ::queries.schema/card.partial]
  "The Cards matching `opts`."
  ([]
   (select-cards nil))
  ([{:keys [columns] :as opts} :- [:maybe ::card-opts]]
   (apply t2/select (->card-model columns) (->card-args opts))))

(mu/defn select-one-card :- [:maybe ::queries.schema/card.partial]
  "The first Card matching `opts`, or nil."
  ([]
   (select-one-card nil))
  ([{:keys [columns] :as opts} :- [:maybe ::card-opts]]
   (apply t2/select-one (->card-model columns) (->card-args opts))))

(mu/defn select-card-pks :- [:set ::lib.schema.id/card]
  "The ids of the Cards matching `opts`."
  ([]
   (select-card-pks nil))
  ([opts :- [:maybe ::card-opts]]
   (or (apply t2/select-pks-set :model/Card (->card-args opts)) #{})))

(mu/defn select-one-card-pk :- [:maybe ::lib.schema.id/card]
  "The id of the first Card matching `opts`, or nil."
  [opts :- [:maybe ::card-opts]]
  (apply t2/select-one-pk :model/Card (->card-args opts)))

(mu/defn select-card-pk->instance :- [:map-of ::lib.schema.id/card ::queries.schema/card.partial]
  "A map of id to the Card matching `opts`."
  [{:keys [columns] :as opts} :- [:maybe ::card-opts]]
  (apply t2/select-pk->fn identity (->card-model columns) (->card-args opts)))

(mu/defn count-cards :- :int
  "The number of Cards matching `opts`."
  ([]
   (count-cards nil))
  ([opts :- [:maybe ::card-opts]]
   (apply t2/count :model/Card (->card-args opts))))

(mu/defn card-exists? :- :boolean
  "Whether a Card matching `opts` exists."
  [opts :- [:maybe ::card-opts]]
  (apply t2/exists? :model/Card (->card-args opts)))

;;; ---- Writes ----

(mu/defn insert-card! :- ::queries.schema/card
  "Insert `card` and return the new instance."
  [card :- ::queries.schema/card.create]
  (t2/insert-returning-instance! :model/Card card))

(mu/defn update-cards! :- :int
  "Apply `changes` to every Card matching `opts`, returning the number updated."
  [opts    :- [:maybe ::card-opts]
   changes :- ::queries.schema/card.update]
  (apply t2/update! :model/Card (conj (->card-kv-args opts) changes)))

(mu/defn update-card! :- :int
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ::lib.schema.id/card
   changes :- ::queries.schema/card.update]
  (t2/update! :model/Card card-id changes))

(mu/defn update-cards-returning-pks! :- [:sequential ::lib.schema.id/card]
  "Apply `changes` to every Card matching `opts`, returning the ids of the updated rows."
  [opts    :- [:maybe ::card-opts]
   changes :- ::queries.schema/card.update]
  (apply t2/update-returning-pks! :model/Card (conj (->card-kv-args opts) changes)))

(mu/defn delete-cards! :- :int
  "Delete every Card matching `opts`, returning the number deleted."
  [opts :- [:maybe ::card-opts]]
  (apply t2/delete! :model/Card (->card-args opts)))

;;; ==================================================== Query ====================================================

(mr/def ::query-filters
  "Which Query rows a query applies to. Keyed by `:query_hash`; there is no `:id`. `:query_set` matches the rows
  whose `:query` column is set (`true`) or null (`false`)."
  [:map {:closed true}
   [:query_hash {:optional true} [:or [:or bytes? :string] [:set [:or bytes? :string]]]]
   [:query_set  {:optional true} :boolean]])

(mr/def ::query-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::query-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::queries.schema/query.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::queries.schema/query.column
                                              [:tuple ::queries.schema/query.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(def ^:private query-set-columns
  "Maps each `<column>_set` filter key to the column whose nullness it tests."
  {:query_set :query})

(defn- ->query-model
  [columns]
  (u.query/model-with-columns :model/Query columns))

(defn- ->query-args
  [opts]
  (u.query/opts->args opts {:set-columns query-set-columns}))

;;; ---- Reads ----

(mu/defn select-one-query :- [:maybe ::queries.schema/query.partial]
  "The first Query row matching `opts`, or nil."
  [opts :- [:maybe ::query-opts]]
  (apply t2/select-one (->query-model (:columns opts)) (->query-args opts)))

;;; ---- Writes ----

(mu/defn insert-queries! :- :int
  "Insert the Query `rows`, returning the number inserted."
  [rows :- [:sequential ::queries.schema/query.create]]
  (t2/insert! :model/Query rows))

;;; ================================================ QueryExecution ================================================

(mr/def ::query-execution-filters
  "Which QueryExecutions a query applies to. Keys mirror the columns of `query_execution`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id          {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:card_id     {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:dashboard_id {:optional true} [:or ::lib.schema.id/dashboard [:set ::lib.schema.id/dashboard]]]
   [:database_id {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]
   [:executor_id {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]])

(mr/def ::query-execution-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::query-execution-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::queries.schema/query-execution.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::queries.schema/query-execution.column
                                              [:tuple ::queries.schema/query-execution.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->query-execution-model
  [columns]
  (u.query/model-with-columns :model/QueryExecution columns))

(defn- ->query-execution-args
  [opts]
  (u.query/opts->args opts))

;;; ---- Reads ----

(mu/defn select-query-executions :- [:sequential ::queries.schema/query-execution.partial]
  "The QueryExecutions matching `opts`."
  ([]
   (select-query-executions nil))
  ([{:keys [columns] :as opts} :- [:maybe ::query-execution-opts]]
   (apply t2/select (->query-execution-model columns) (->query-execution-args opts))))

;;; ---- Writes ----
;;; No update primitive: `:model/QueryExecution` derives `::toucan2.tools.disallow/update`, so nothing may ever
;;; update a row after it is inserted.

(mu/defn insert-query-execution! :- ms/PositiveInt
  "Insert the QueryExecution `row` and return its id."
  [row :- ::queries.schema/query-execution.create]
  (t2/insert-returning-pk! :model/QueryExecution row))

(mu/defn insert-query-executions! :- :int
  "Insert the QueryExecution `rows`, returning the number inserted."
  [rows :- [:sequential ::queries.schema/query-execution.create]]
  (t2/insert! :model/QueryExecution rows))

;;; ================================================== QueryTable ==================================================

(mr/def ::query-table-filters
  "Which QueryTables a query applies to. Keys mirror the columns of `query_table`: a scalar matches that value and a
  set matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:card_id  {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:table_id {:optional true} [:or ::lib.schema.id/table [:set ::lib.schema.id/table]]]])

(mr/def ::query-table-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::query-table-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::queries.schema/query-table.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::queries.schema/query-table.column
                                              [:tuple ::queries.schema/query-table.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->query-table-model
  [columns]
  (u.query/model-with-columns :model/QueryTable columns))

(defn- ->query-table-args
  [opts]
  (u.query/opts->args opts))

;;; ---- Reads ----

(mu/defn select-query-tables :- [:sequential ::queries.schema/query-table.partial]
  "The QueryTables matching `opts`."
  ([]
   (select-query-tables nil))
  ([{:keys [columns] :as opts} :- [:maybe ::query-table-opts]]
   (apply t2/select (->query-table-model columns) (->query-table-args opts))))

;;; ---- Writes ----

(mu/defn insert-query-table! :- ::queries.schema/query-table
  "Insert `query-table` and return the new instance."
  [query-table :- ::queries.schema/query-table.create]
  (t2/insert-returning-instance! :model/QueryTable query-table))

(mu/defn delete-query-tables! :- :int
  "Delete every QueryTable matching `opts`, returning the number deleted."
  [opts :- [:maybe ::query-table-opts]]
  (apply t2/delete! :model/QueryTable (->query-table-args opts)))

;;; ================================================= StoredResult =================================================

(mr/def ::stored-result-filters
  "Which StoredResults a query applies to. Keys mirror the columns of `stored_result`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id           {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:creator_id   {:optional true} [:or ::lib.schema.id/user [:set ::lib.schema.id/user]]]
   [:database_id  {:optional true} [:or ::lib.schema.id/database [:set ::lib.schema.id/database]]]])

(mr/def ::stored-result-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::stored-result-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::queries.schema/stored-result.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::queries.schema/stored-result.column
                                              [:tuple ::queries.schema/stored-result.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->stored-result-model
  [columns]
  (u.query/model-with-columns :model/StoredResult columns))

(defn- ->stored-result-args
  [opts]
  (u.query/opts->args opts))

;;; ---- Reads ----

(mu/defn select-one-stored-result :- [:maybe ::queries.schema/stored-result.partial]
  "The first StoredResult matching `opts`, or nil."
  [opts :- [:maybe ::stored-result-opts]]
  (apply t2/select-one (->stored-result-model (:columns opts)) (->stored-result-args opts)))

;;; ---- Writes ----

(mu/defn insert-stored-result! :- ms/PositiveInt
  "Insert `stored-result` and return its id."
  [stored-result :- ::queries.schema/stored-result.create]
  (first (t2/insert-returning-pks! :model/StoredResult stored-result)))

(mu/defn delete-stored-results! :- :int
  "Delete every StoredResult matching `opts`, returning the number deleted."
  [opts :- [:maybe ::stored-result-opts]]
  (apply t2/delete! :model/StoredResult (->stored-result-args opts)))

;;; ============================================== StoredResultUse ===============================================

(mr/def ::stored-result-use-filters
  "Which StoredResultUses a query applies to. Keys mirror the columns of `stored_result_use`: a scalar matches that
  value and a set matches any of its values."
  [:map {:closed true}
   [:id                {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:stored_result_id  {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:card_id           {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:exploration_id    {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]])

(mr/def ::stored-result-use-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::stored-result-use-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::queries.schema/stored-result-use.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::queries.schema/stored-result-use.column
                                              [:tuple ::queries.schema/stored-result-use.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->stored-result-use-model
  [columns]
  (u.query/model-with-columns :model/StoredResultUse columns))

(defn- ->stored-result-use-args
  [opts]
  (u.query/opts->args opts))

;;; ---- Reads ----

(mu/defn select-stored-result-uses :- [:sequential ::queries.schema/stored-result-use.partial]
  "The StoredResultUses matching `opts`."
  ([]
   (select-stored-result-uses nil))
  ([{:keys [columns] :as opts} :- [:maybe ::stored-result-use-opts]]
   (apply t2/select (->stored-result-use-model columns) (->stored-result-use-args opts))))

;;; ---- Writes ----

(mu/defn insert-stored-result-use! :- ::queries.schema/stored-result-use
  "Insert `stored-result-use` and return the new instance."
  [stored-result-use :- ::queries.schema/stored-result-use.create]
  (t2/insert-returning-instance! :model/StoredResultUse stored-result-use))

;;; ================================================= ParameterCard =================================================

(mr/def ::parameter-card-filters
  "Which ParameterCards a query applies to. Keys mirror the columns of `parameter_card`: a scalar matches that value
  and a set matches any of its values."
  [:map {:closed true}
   [:id                        {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:card_id                   {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]
   [:parameterized_object_type {:optional true} [:or [:or :keyword :string] [:set [:or :keyword :string]]]]
   [:parameterized_object_id   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:parameter_id              {:optional true} [:or :string [:set :string]]]])

(mr/def ::parameter-card-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::parameter-card-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::queries.schema/parameter-card.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::queries.schema/parameter-card.column
                                              [:tuple ::queries.schema/parameter-card.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->parameter-card-model
  [columns]
  (u.query/model-with-columns :model/ParameterCard columns))

(defn- ->parameter-card-args
  [opts]
  (u.query/opts->args opts))

(defn- ->parameter-card-kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ---- Reads ----

(mu/defn select-parameter-cards :- [:sequential ::queries.schema/parameter-card.partial]
  "The ParameterCards matching `opts`."
  ([]
   (select-parameter-cards nil))
  ([{:keys [columns] :as opts} :- [:maybe ::parameter-card-opts]]
   (apply t2/select (->parameter-card-model columns) (->parameter-card-args opts))))

(mu/defn parameter-card-exists? :- :boolean
  "Whether a ParameterCard matching `opts` exists."
  [opts :- [:maybe ::parameter-card-opts]]
  (apply t2/exists? :model/ParameterCard (->parameter-card-args opts)))

;;; ---- Writes ----

(mu/defn insert-parameter-card! :- :int
  "Insert `parameter-card`, returning the number inserted."
  [parameter-card :- ::queries.schema/parameter-card.create]
  (t2/insert! :model/ParameterCard parameter-card))

(mu/defn update-parameter-cards! :- :int
  "Apply `changes` to every ParameterCard matching `opts`, returning the number updated."
  [opts    :- [:maybe ::parameter-card-opts]
   changes :- ::queries.schema/parameter-card.update]
  (apply t2/update! :model/ParameterCard (conj (->parameter-card-kv-args opts) changes)))

(mu/defn delete-parameter-cards! :- :int
  "Delete every ParameterCard matching `opts`, returning the number deleted."
  [opts :- [:maybe ::parameter-card-opts]]
  (apply t2/delete! :model/ParameterCard (->parameter-card-args opts)))

;;; ---------------------------------- Queries used only by the queries module ----------------------------------

;;; ---- Card ----

(def ^:private not-in-exploration-document
  "The `:where` fragment excluding Cards that belong to an exploration Summary document.

  Such a Card is materialized by the Summary itself — its `name` and `dataset_query` are copied from the
  `ExplorationQuery` it renders, so they carry dimension values discovered under the creator's data-access lens. Its
  parent Document is never serialized (see `metabase.documents.models.document`'s `extract-query`), and this Card's
  `deserialization-dependencies` name that Document, so exporting the Card without it would leave a dangling
  reference even setting the lens question aside."
  [:or
   [:= :document_id nil]
   [:in :document_id ^:allow-subquery {:select [:id]
                                       :from   [:document]
                                       :where  [:= :exploration_id nil]}]])

(mu/defn reducible-select-cards-for-serdes
  "A reducible of the Cards to export via serdes: those whose `:collection_id` is in `collection-set` (nil in the set
  counts as the root collection; an empty or nil set means every collection), further restricted to the rows whose
  `filter-column` is one of `filter-ids` when `filter-column` is given, never a Card materialized by an exploration
  Summary document, and ordered ascending by `order-columns` (unordered when empty)."
  [collection-set :- [:maybe [:or [:set [:maybe ::lib.schema.id/collection]] [:sequential [:maybe ::lib.schema.id/collection]]]]
   filter-column  :- [:maybe :keyword]
   filter-ids     :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns  :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select :model/Card
                       (cond-> {:where [:and
                                        (when (seq collection-set)
                                          [:or
                                           [:in :collection_id collection-set]
                                           (when (some nil? collection-set)
                                             [:= :collection_id nil])])
                                        (when filter-column
                                          [:in filter-column filter-ids])
                                        not-in-exploration-document]}
                         (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(mu/defn select-card-dimensions
  "The raw `:dimensions` row of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/query-one {:select [:dimensions]
                 :from   [:report_card]
                 :where  [:= :id card-id]}))

(mu/defn select-card-database-and-table-ids
  "The database and primary table IDs of the Card with `card-id`, as `:database-id` and `:table-id`."
  [card-id :- ::lib.schema.id/card]
  (when-let [card (select-one-card {:id card-id :columns [:database_id :table_id]})]
    {:database-id (:database_id card), :table-id (:table_id card)}))

(mu/defn select-card-queries
  "The IDs and queries of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (select-cards {:id (set card-ids) :columns [:id :dataset_query]}))

(mu/defn select-card-dependents-of-source-cards
  "The IDs and source Card IDs of the Cards whose source Card is one of `source-card-ids`."
  [source-card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
  (select-cards {:source_card_id (set source-card-ids) :columns [:id :source_card_id]}))

(mu/defn select-metric-cards-for-source-cards
  "The unarchived metric Cards built on one of `source-card-ids`, ordered by name."
  [source-card-ids :- [:sequential ::lib.schema.id/card]]
  (select-cards {:source_card_id (set source-card-ids), :archived false, :type :metric, :order-by [:name]}))

;;; ---- Card statistics ----

(mu/defn select-dashcard-counts-by-card
  "Rows of `:card_id` and `:count` of DashboardCards for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%count.* :count] :card_id]
             :from     [:report_dashboardcard]
             :where    [:in :card_id card-ids]
             :group-by [:card_id]}))

(mu/defn select-parameter-card-counts-by-card
  "Rows of `:card_id` and `:count` of ParameterCards for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%count.* :count] :card_id]
             :from     [:parameter_card]
             :where    [:in :card_id card-ids]
             :group-by [:card_id]}))

(mu/defn select-average-running-times-by-card
  "Rows of `:card_id` and average `:running_time` of uncached executions for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%avg.running_time :running_time] :card_id]
             :from     [:query_execution]
             :where    [:and
                        [:not= :running_time nil]
                        [:not= :cache_hit true]
                        [:in :card_id card-ids]]
             :group-by [:card_id]}))

(mu/defn select-last-query-starts-by-card
  "Rows of `:card_id` and latest `:started_at` of uncached executions for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%max.started_at :started_at] :card_id]
             :from     [:query_execution]
             :where    [:and
                        [:not= :running_time nil]
                        [:not= :cache_hit true]
                        [:in :card_id card-ids]]
             :group-by [:card_id]}))

(defn card-dashboards
  "The Dashboards `card` appears in, hydrating `:in_dashboards` unless it is already present."
  [card]
  (or (:in_dashboards card)
      (:in_dashboards (t2/hydrate card :in_dashboards))))

(mu/defn select-dashboards-for-cards
  "Rows of `:card_id` plus Dashboard columns for every Dashboard each of `card-ids` appears on, directly or as a series."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:union-all [^:allow-subquery {:nest
                                           ^:allow-subquery {:select   [[:dc.card_id :card_id]
                                                                        :d.name
                                                                        :d.collection_id
                                                                        :d.description
                                                                        :d.id
                                                                        :d.archived
                                                                        :d.enable_embedding]
                                                             :from     [[:report_dashboardcard :dc]]
                                                             :join     [[:report_dashboard :d] [:= :dc.dashboard_id :d.id]]
                                                             :where    [:in :dc.card_id card-ids]
                                                             :order-by [[:d.id :asc]]}}
                         ^:allow-subquery {:nest
                                           ^:allow-subquery {:select   [[:dcs.card_id :card_id]
                                                                        :d.name
                                                                        :d.collection_id
                                                                        :d.description
                                                                        :d.id
                                                                        :d.archived
                                                                        :d.enable_embedding]
                                                             :from     [[:dashboardcard_series :dcs]]
                                                             :join     [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]
                                                                        [:report_dashboard :d] [:= :d.id :dc.dashboard_id]]
                                                             :where    [:in :dcs.card_id card-ids]
                                                             :order-by [[:d.id :asc]]}}]}))

;;; ---- Related models ----

(mu/defn select-field-database-info-for-ids
  "The id, name, table name, and Database id of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/query {:select    [[:field.id :field-id]
                         [:field.name :field-name]
                         [:table.name :table-name]
                         [:table.db_id :field-db-id]]
             :from      [[:metabase_field :field]]
             :left-join [(warehouse-schema-overlay/table-query {:alias :table, :user-settings? false})
                         [:= :field.table_id :table.id]]
             :where     [:in :field.id field-ids]}))

(mu/defn select-field-table-ids
  "The set of Table IDs of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn select-snippets
  "The NativeQuerySnippets with `snippet-ids`."
  [snippet-ids :- [:set ::lib.schema.id/native-query-snippet]]
  (t2/select :model/NativeQuerySnippet :id [:in snippet-ids]))

(mu/defn select-dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn select-dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(mu/defn select-dashboard-collection-id
  "The `:collection_id` of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] :id dashboard-id))

(mu/defn select-dashboard-parameters
  "The `:parameters` of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :parameters [:model/Dashboard :parameters] :id dashboard-id))

(mu/defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::dashboards.schema/dashboard.update]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn select-dashcards-for-card
  "The DashboardCards showing the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/DashboardCard :card_id card-id))

(mu/defn insert-dashcard!
  "Insert `dashcard`, returning the number inserted."
  [dashcard :- ::dashboards.schema/dashboard-card.create]
  (t2/insert! :model/DashboardCard dashcard))

(mu/defn update-dashcard!
  "Apply `changes` to the DashboardCard with `dashcard-id`, returning the number updated."
  [dashcard-id :- ::lib.schema.id/dashcard
   changes     :- ::dashboards.schema/dashboard-card.update]
  (t2/update! :model/DashboardCard :id dashcard-id changes))

(mu/defn delete-dashcards-for-card-on-dashboard!
  "Delete the DashboardCards showing the Card with `card-id` on the Dashboard with `dashboard-id`, returning the
  number deleted."
  [card-id      :- ::lib.schema.id/card
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id dashboard-id))

(mu/defn delete-dashcards-for-card-off-dashboard!
  "Delete the DashboardCards showing the Card with `card-id` on any Dashboard other than `dashboard-id`, returning
  the number deleted."
  [card-id      :- ::lib.schema.id/card
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id [:not= dashboard-id]))

(mu/defn select-dashcard-series-for-card-on-dashboard
  "The IDs of the DashboardCardSeries showing the Card with `card-id` on the Dashboard with `dashboard-id`."
  [card-id      :- ::lib.schema.id/card
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/query {:select [[:dcs.id]]
             :from   [[:dashboardcard_series :dcs]]
             :join   [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]]
             :where  [:and
                      [:= :dc.dashboard_id dashboard-id]
                      [:= :dcs.card_id card-id]]}))

(mu/defn select-dashcard-series-for-card-off-dashboard
  "The IDs of the DashboardCardSeries showing the Card with `card-id` on any Dashboard other than `dashboard-id`."
  [card-id      :- ::lib.schema.id/card
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/query {:select [[:dcs.id]]
             :from   [[:dashboardcard_series :dcs]]
             :join   [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]]
             :where  [:and
                      [:= :dcs.card_id card-id]
                      [:not= :dc.dashboard_id dashboard-id]]}))

(mu/defn delete-dashcard-series!
  "Delete the DashboardCardSeries with `series-ids`, returning the number deleted."
  [series-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/DashboardCardSeries :id [:in series-ids]))

(mu/defn select-implicit-action-ids-for-model
  "The IDs of the implicit Actions of the model Card with `model-id`."
  [model-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Action {:select [:action.id]
                                    :from   [:action]
                                    :join   [:implicit_action [:= :action.id :implicit_action.action_id]]
                                    :where  [:= :action.model_id model-id]}))

(mu/defn delete-actions!
  "Delete the Actions with `action-ids`, returning the number deleted."
  [action-ids :- [:set ::lib.schema.id/action]]
  (t2/delete! :model/Action :id [:in action-ids]))

(mu/defn archive-explicit-actions-for-model!
  "Archive the non-implicit Actions of the model Card with `model-id`, returning the number updated."
  [model-id :- ms/PositiveInt]
  (t2/update! :model/Action {:model_id model-id :type [:not= :implicit]} {:archived true}))

(mu/defn delete-implicit-actions-for-model!
  "Delete the implicit Actions of the model Card with `model-id`, returning the number deleted."
  [model-id :- ms/PositiveInt]
  (t2/delete! :model/Action :model_id model-id :type :implicit))

(mu/defn delete-card-moderation-reviews!
  "Delete the ModerationReviews of the Card with `card-id`, returning the number deleted."
  [card-id :- ::lib.schema.id/card]
  (t2/delete! :model/ModerationReview :moderated_item_type "card" :moderated_item_id card-id))

(mu/defn delete-card-revisions!
  "Delete the Revisions of the Card with `card-id`, returning the number deleted."
  [card-id :- ::lib.schema.id/card]
  (t2/delete! :model/Revision :model "Card" :model_id card-id))

(mu/defn select-card-notification-ids
  "The IDs of the card Notifications attached to the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-pks-set :model/Notification
                     :payload_type :notification/card
                     :payload_id [:in ^:allow-subquery {:select [:id]
                                                        :from   [:notification_card]
                                                        :where  [:= :card_id card-id]}]))

(mu/defn delete-notifications!
  "Delete the Notifications with `notification-ids`, returning the number deleted."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Notification :id [:in notification-ids]))

;;; ---- Query ----

(defn- int-casting-type
  "MySQL doesn't accept `integer`, so we have to use `unsigned`; Postgres doesn't accept `unsigned` so we have to use
  `integer`. Yay SQL dialect differences :D"
  []
  (if (= (mdb/db-type) :mysql)
    :unsigned
    :integer))

(defn- rolling-average-expr
  [c0 c1]
  (h2x/cast (int-casting-type)
            (h2x/round (h2x/+ (h2x/* c0 :average_execution_time)
                              c1)
                       [:inline 0])))

(mu/defn backfill-query-and-average-execution-time!
  "Set the query text and average execution time (`c0 * average_execution_time + c1`, rounded and cast to an integer)
  of the query with `query-hash` if its text was never stored, returning the number updated."
  [query-hash  :- bytes?
   query-json  :- :string
   c0          :- number?
   c1          :- number?]
  (t2/update! :model/Query
              {:query_hash query-hash, :query nil}
              {:query                  query-json
               :average_execution_time (rolling-average-expr c0 c1)}))

(mu/defn update-average-execution-time!
  "Set the average execution time of the query with `query-hash` to `c0 * average_execution_time + c1`, rounded and
  cast to an integer, returning the number updated."
  [query-hash :- bytes?
   c0         :- number?
   c1         :- number?]
  (t2/update! :model/Query {:query_hash query-hash} {:average_execution_time (rolling-average-expr c0 c1)}))

(mu/defn update-average-execution-times!
  "Set the average execution time of each Query identified by the `[query-hash c0 c1]` triples in `hash+coefficients`
  to `c0 * average_execution_time + c1`, rounded and cast to an integer."
  [hash+coefficients :- [:sequential [:tuple bytes? number? number?]]]
  (t2/query {:update (t2/table-name :model/Query)
             :set    {:average_execution_time (into [:case]
                                                    (mapcat (fn [[query-hash c0 c1]]
                                                              [[:= :query_hash query-hash] (rolling-average-expr c0 c1)]))
                                                    hash+coefficients)}
             :where  [:in :query_hash (map first hash+coefficients)]}))

(mu/defn reducible-select-query-hash-statuses
  "Reducible rows of `:query_hash` and `:missing_query` for the Query rows with `query-hashes`."
  [query-hashes :- [:sequential bytes?]]
  (t2/reducible-query {:select [:query_hash [[:= :query nil] :missing_query]]
                       :from   [(t2/table-name :model/Query)]
                       :where  [:in :query_hash query-hashes]}))

;;; ---- StoredResult ----

(mu/defn select-stored-results-for-card
  "The StoredResults used by the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/StoredResult
             :id [:in ^:allow-subquery {:select [:stored_result_id]
                                        :from   [:stored_result_use]
                                        :where  [:= :card_id card-id]}]))

;;; ---- ParameterCard ----

(mu/defn delete-parameter-cards-for-object-except!
  "Delete the ParameterCards of the given parameterized object whose parameter is not one of `parameter-ids`,
  returning the number deleted."
  [object-type    :- [:or :keyword :string]
   object-id      :- ms/PositiveInt
   parameter-ids  :- [:sequential :string]]
  (t2/delete! :model/ParameterCard
              :parameterized_object_type object-type
              :parameterized_object_id object-id
              :parameter_id [:not-in parameter-ids]))
