(ns metabase.queries.db
  "Application database queries for the queries module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration
  methods."
  (:require
   [clojure.string :as str]
   [metabase.app-db.core :as mdb]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.card-schema :as queries.card-schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.schema]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn stored-result :- [:maybe ::queries.schema/stored-result]
  "The ::queries.schema/stored-result with `stored-result-id`, or nil."
  [stored-result-id :- ms/PositiveInt]
  (t2/select-one :model/StoredResult :id [:auto/param stored-result-id]))

(mu/defn stored-result-data
  "The serialized result bytes of the StoredResult with `stored-result-id`, or nil."
  [stored-result-id :- ms/PositiveInt]
  (t2/select-one-fn :result_data [:model/StoredResult :result_data] :id [:auto/param stored-result-id]))

;;; ------------------------------------------------ Cards ------------------------------------------------

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

(mu/defn cards-for-serdes-reducible
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

(mu/defn card :- [:maybe ::queries.schema/card]
  "The ::queries.schema/card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id [:auto/param card-id]))

(mu/defn cards
  "The Cards with `card-ids` (nil entries, e.g. from virtual dashcards, are ignored)."
  [card-ids :- [:maybe [:or [:set [:maybe ::lib.schema.id/card]] [:sequential [:maybe ::lib.schema.id/card]]]]]
  (t2/select :model/Card :id [:in card-ids]))

(mu/defn card-query-info
  "The query-related fields of the Card with `card-id`.

  Accepts kv-args:
  - `:include` is a seq of extra columns to select."
  [card-id :- ::lib.schema.id/card
   & {:keys [include]} :- [:maybe [:map {:closed true}
                                   [:include {:optional true} [:seqable :keyword]]]]]
  (t2/select-one (queries.card-schema/selection include) :id card-id))

(mu/defn card-dataset-query
  "The `:dataset_query` of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (:dataset_query (card-query-info card-id)))

(mu/defn raw-card-dimensions
  "The raw `:dimensions` row of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/query-one {:select [:dimensions]
                 :from   [:report_card]
                 :where  [:= :id card-id]}))

(mu/defn cards-queries-info
  "The IDs and query-related fields of the Cards with `card-ids`.

  Accepts optional kv-args:
  - `:include` a seq of extra columns to select."
  [card-ids :- [:seqable ::lib.schema.id/card]
   & {:keys [include]} :- [:maybe [:map {:closed true}
                                   [:include {:optional true} [:seqable :keyword]]]]]
  (t2/select (queries.card-schema/selection include) :id [:in card-ids]))

(mu/defn mbql-model-cards
  "The unarchived MBQL models that query the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/select (queries.card-schema/selection)
             :database_id database-id
             :type        :model
             :query_type  :query
             :archived    false))

(mu/defn source-card-dependents
  "The IDs and source Card IDs of the Cards whose source Card is one of `source-card-ids`."
  [source-card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
  (t2/select [:model/Card :id :source_card_id] :source_card_id [:in source-card-ids]))

(mu/defn metric-cards-for-source-cards
  "The unarchived metric Cards built on one of `source-card-ids`, ordered by name."
  [source-card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select :model/Card
             :source_card_id [:in source-card-ids]
             :archived false
             :type :metric
             {:order-by [[:name :asc]]}))

(mu/defn document-card-ids
  "The IDs of the Cards that belong to the Document with `document-id`."
  [document-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Card :document_id document-id))

(mu/defn insert-card!
  "Insert `card` and return the new instance."
  [card :- ::queries.schema/card.update]
  (t2/insert-returning-instance! :model/Card card))

(mu/defn update-card!
  "Apply `changes` to the Card with `card-id`, returning the number updated."
  [card-id :- ::lib.schema.id/card
   changes :- ::queries.schema/card.update]
  (t2/update! :model/Card card-id changes))

;;; ------------------------------------------- Card statistics -------------------------------------------

(mu/defn dashcard-counts-by-card
  "Rows of `:card_id` and `:count` of DashboardCards each of `card-ids` appears on, directly or as a series."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%count.* :count] :card_id]
             :from     [[^:allow-subquery {:union-all [^:allow-subquery {:select [:card_id]
                                                                         :from   [:report_dashboardcard]
                                                                         :where  [:in :card_id card-ids]}
                                                       ^:allow-subquery {:select [:card_id]
                                                                         :from   [:dashboardcard_series]
                                                                         :where  [:in :card_id card-ids]}]}
                         :placements]]
             :group-by [:card_id]}))

(mu/defn parameter-card-counts-by-card
  "Rows of `:card_id` and `:count` of ParameterCards for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%count.* :count] :card_id]
             :from     [:parameter_card]
             :where    [:in :card_id card-ids]
             :group-by [:card_id]}))

(mu/defn average-running-times-by-card
  "Rows of `:card_id` and average `:running_time` of uncached executions for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%avg.running_time :running_time] :card_id]
             :from     [:query_execution]
             :where    [:and
                        [:not= :running_time nil]
                        [:not= :cache_hit true]
                        [:in :card_id card-ids]]
             :group-by [:card_id]}))

(mu/defn last-query-starts-by-card
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

(mu/defn dashboards-for-cards
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

;;; ------------------------------------------- Related models --------------------------------------------

(mu/defn field-database-info-for-ids
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

(mu/defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::dashboards.schema/dashboard.update]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn insert-dashcard!
  "Insert `dashcard`, returning the number inserted."
  [dashcard :- ::dashboards.schema/dashboard-card.update]
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

(mu/defn dashcard-series-for-card-on-dashboard
  "The IDs of the DashboardCardSeries showing the Card with `card-id` on the Dashboard with `dashboard-id`."
  [card-id      :- ::lib.schema.id/card
   dashboard-id :- ::lib.schema.id/dashboard]
  (t2/query {:select [[:dcs.id]]
             :from   [[:dashboardcard_series :dcs]]
             :join   [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]]
             :where  [:and
                      [:= :dc.dashboard_id dashboard-id]
                      [:= :dcs.card_id card-id]]}))

(mu/defn dashcard-series-for-card-off-dashboard
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

(mu/defn move-actions-of-model!
  "Move the Actions of the model Card with `model-id` to the Collection with `collection-id`, returning the number
  updated."
  [model-id      :- ::lib.schema.id/card
   collection-id :- [:maybe ::lib.schema.id/collection]]
  (t2/update! :model/Action {:model_id model-id} {:collection_id collection-id}))

(mu/defn delete-actions-of-model!
  "Delete the Actions of the Card with `model-id`, returning the number deleted."
  [model-id :- ms/PositiveInt]
  (t2/delete! :model/Action :model_id model-id))

(mu/defn delete-actions!
  "Delete the Actions with `action-ids`, returning the number deleted."
  [action-ids :- [:set ::lib.schema.id/action]]
  (t2/delete! :model/Action :id [:in action-ids]))

(mu/defn delete-card-moderation-reviews!
  "Delete the ModerationReviews of the Card with `card-id`, returning the number deleted."
  [card-id :- ::lib.schema.id/card]
  (t2/delete! :model/ModerationReview :moderated_item_type "card" :moderated_item_id card-id))

(mu/defn delete-card-revisions!
  "Delete the Revisions of the Card with `card-id`, returning the number deleted."
  [card-id :- ::lib.schema.id/card]
  (t2/delete! :model/Revision :model "Card" :model_id card-id))

(mu/defn delete-notifications!
  "Delete the Notifications with `notification-ids`, returning the number deleted."
  [notification-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/Notification :id [:in notification-ids]))

;;; --------------------------------------------- ParameterCard ---------------------------------------------

(mu/defn parameter-cards-for-card
  "The ParameterCards drawing values from the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/ParameterCard :card_id card-id))

(mu/defn parameter-card-card-ids
  "The set of Card IDs the parameters of the given parameterized object draw values from."
  [object-type :- [:or :keyword :string]
   object-id   :- ms/PositiveInt]
  (t2/select-fn-set :card_id :model/ParameterCard
                    :parameterized_object_type object-type
                    :parameterized_object_id object-id))

(mu/defn parameter-card-exists?
  "Whether the given parameter of the given parameterized object has a ParameterCard."
  [object-type  :- [:or :keyword :string]
   object-id    :- ms/PositiveInt
   parameter-id :- :string]
  (t2/exists? :model/ParameterCard
              :parameterized_object_type object-type
              :parameterized_object_id object-id
              :parameter_id parameter-id))

(mu/defn set-parameter-card-card-id!
  "Point the ParameterCard of the given parameter of the given parameterized object at `card-id`, returning the
  number updated."
  [object-type  :- [:or :keyword :string]
   object-id    :- ms/PositiveInt
   parameter-id :- :string
   card-id      :- ::lib.schema.id/card]
  (t2/update! :model/ParameterCard
              {:parameterized_object_type object-type
               :parameterized_object_id   object-id
               :parameter_id              parameter-id}
              {:card_id card-id}))

(mu/defn insert-parameter-card!
  "Insert `parameter-card`, returning the number inserted."
  [parameter-card :- ::queries.schema/parameter-card.update]
  (t2/insert! :model/ParameterCard parameter-card))

(mu/defn delete-parameter-cards-for-card!
  "Delete the ParameterCards drawing values from the Card with `card-id`, returning the number deleted."
  [card-id :- ::lib.schema.id/card]
  (t2/delete! :model/ParameterCard :card_id card-id))

(mu/defn delete-parameter-cards-for-object!
  "Delete every ParameterCard of the given parameterized object, returning the number deleted."
  [object-type :- [:or :keyword :string]
   object-id   :- ms/PositiveInt]
  (t2/delete! :model/ParameterCard
              :parameterized_object_type object-type
              :parameterized_object_id object-id))

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

;;; -------------------------------------------------- Query --------------------------------------------------

(mu/defn average-execution-time
  "The recorded average execution time of the query with `query-hash`."
  [query-hash :- bytes?]
  (t2/select-one-fn :average_execution_time :model/Query :query_hash query-hash))

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

(mu/defn insert-queries!
  "Insert the Query `rows`, returning the number inserted."
  [rows :- [:sequential [:map {:closed true}
                         [:query                  [:or
                                                   ::lib-be.schema/empty-query
                                                   :metabase.query-processor.schema/any-query]]
                         [:query_hash             bytes?]
                         [:average_execution_time number?]]]]
  (t2/insert! :model/Query rows))

(mu/defn query-hash-statuses-reducible
  "Reducible rows of `:query_hash` and `:missing_query` for the Query rows with `query-hashes`."
  [query-hashes :- [:sequential bytes?]]
  (t2/reducible-query {:select [:query_hash [[:= :query nil] :missing_query]]
                       :from   [(t2/table-name :model/Query)]
                       :where  [:in :query_hash query-hashes]}))

;;; ---------------------------------------------- StoredResult ----------------------------------------------

(mu/defn stored-result-ids-used-by-cards
  "The subset of `stored-result-ids` used by one of the Cards with `card-ids`."
  [card-ids          :- [:set ::lib.schema.id/card]
   stored-result-ids :- [:set ms/PositiveInt]]
  (t2/select-fn-set :stored_result_id :model/StoredResultUse
                    :card_id [:in card-ids]
                    :stored_result_id [:in stored-result-ids]))

(mu/defn insert-stored-result-use!
  "Record that the Card with `card-id` uses the StoredResult with `stored-result-id`, returning the number inserted."
  [stored-result-id :- ms/PositiveInt
   card-id          :- ::lib.schema.id/card]
  (t2/insert! :model/StoredResultUse {:stored_result_id stored-result-id
                                      :card_id          card-id}))

(mu/defn stored-results-for-card
  "The StoredResults used by the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/StoredResult
             :id [:in ^:allow-subquery {:select [:stored_result_id]
                                        :from   [:stored_result_use]
                                        :where  [:= :card_id card-id]}]))

(def ^:private library-metrics-collection-type
  "The `:type` of the Collection that holds the Library's metrics, as in `metabase.collections.core`, which this
  namespace cannot require without closing a load cycle."
  "library-metrics")

(mu/defn library-metric-ids :- [:set ::lib.schema.id/card]
  "Among `card-ids`, the IDs of the metrics in the Library's Metrics collection or one of its subcollections."
  [card-ids :- [:set {:min 1} ::lib.schema.id/card]]
  (or (t2/select-fn-set :id [:model/Card :report_card.id] {:join  [:collection [:= :collection.id :report_card.collection_id]]
                                                           :where [:and
                                                                   [:in :report_card.id card-ids]
                                                                   [:= :report_card.type "metric"]
                                                                   [:= :collection.type library-metrics-collection-type]]})
      #{}))

(defn card-ids-outside-collection
  "Among `card-ids`, the IDs of the cards that are not in the collection with `collection-id`."
  [card-ids collection-id]
  (t2/select-pks-set :model/Card {:where [:and
                                          [:in :id card-ids]
                                          [:or [:= :collection_id nil] [:not= :collection_id collection-id]]]}))

;;; ---------------------------------------------- Card reads ----------------------------------------------

(def ^:private card-ids-schema
  [:maybe [:or [:set [:maybe ::lib.schema.id/card]] [:sequential [:maybe ::lib.schema.id/card]]]])

(def ^:private card-summary-columns
  [:id :name :type :description :collection_id :database_id :table_id])

(def ^:private exploration-card-columns
  [:id :name :description :collection_id :database_id :table_id :type :entity_id
   :card_schema :dataset_query :result_metadata :dimensions :dimension_mappings])

(mu/defn cards-by-id :- [:map-of ::lib.schema.id/card :map]
  "A map of Card id to Card for the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select-pk->fn identity :model/Card :id [:in card-ids]))

(mu/defn unarchived-cards
  "The unarchived Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select :model/Card :id [:in card-ids] :archived false))

(mu/defn any-card-among
  "One Card whose id is in `card-ids`, or nil."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select-one :model/Card :id [:in card-ids]))

(mu/defn card-exists?
  "Whether a Card with `card-id` exists."
  [{:keys [card-id]} :- [:map {:closed true}
                         [:card-id ::lib.schema.id/card]]]
  (t2/exists? :model/Card :id [:auto/param card-id]))

(mu/defn card-by-entity-id
  "The Card with `entity-id`, or nil."
  [{:keys [entity-id]} :- [:map {:closed true}
                           [:entity-id :string]]]
  (t2/select-one :model/Card :entity_id [:auto/param entity-id]))

(mu/defn card-names
  "The id and name of the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card :id :name] :id [:in card-ids]))

(mu/defn card-entity-ids
  "A map of Card id to entity id for the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select-pk->fn :entity_id :model/Card :id [:in card-ids]))

(mu/defn card-names-by-id
  "A map of Card id to name for the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select-pk->fn :name :model/Card :id [:in card-ids]))

(mu/defn card-dataset-queries
  "A map of Card id to `:dataset_query` for the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select-pk->fn :dataset_query :model/Card :id [:in card-ids]))

(mu/defn raw-card-dataset-queries
  "Raw `:id` and `:dataset_query` rows of the Cards with `card-ids`, bypassing the Card model's transforms."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [(t2/table-name :model/Card) :id :dataset_query] :id [:in card-ids]))

(mu/defn raw-card-result-metadata
  "Raw `:id` and `:result_metadata` rows of the Cards with `card-ids`, bypassing the Card model's transforms."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [(t2/table-name :model/Card) :id :result_metadata] :id [:in card-ids]))

(mu/defn raw-card-result-metadata-reducible
  "Reducible raw `:id` and `:result_metadata` rows of the Cards of the Database with `database-id`."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (t2/reducible-select [(t2/table-name :model/Card) :id :result_metadata] :database_id [:auto/param database-id]))

(mu/defn card-source-rows
  "The id, name, entity id, Collection id, and Document id of the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card :id :name :entity_id :collection_id :document_id] :id [:in card-ids]))

(mu/defn card-search-rows
  "The id, name, description, Database id, Collection id, and type of the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card :id :name :description :database_id :collection_id :type] :id [:in card-ids]))

(mu/defn card-summaries
  "The summary columns of the unarchived Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select (into [:model/Card] card-summary-columns) :id [:in card-ids] :archived false))

(mu/defn card-collection-ids
  "The id and Collection id of the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card :id :collection_id] :id [:in card-ids]))

(mu/defn card-database-ids
  "The id and Database id of the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card :id :database_id] :id [:in card-ids]))

(mu/defn card-types
  "The id, type, and display of the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card :id :type :display] :id [:in card-ids]))

(mu/defn card-types-by-id
  "A map of Card id to type for the Cards with `card-ids`."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select-fn->fn :id :type [:model/Card :id :type] :id [:in card-ids]))

(mu/defn card-counts-by-type :- [:map-of :keyword :int]
  "The number of Cards with `card-ids` by type."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select-fn->fn :type :count [:model/Card :type [:%count.* :count]] :id [:in card-ids] {:group-by [:type]}))

(mu/defn cards-for-explorations
  "The exploration columns of the Cards with `card-ids`, restricted to metrics when `metric-only?`."
  [{:keys [card-ids metric-only?]} :- [:map {:closed true}
                                       [:card-ids card-ids-schema]
                                       [:metric-only? {:optional true} [:maybe :boolean]]]]
  (if metric-only?
    (t2/select (into [:model/Card] exploration-card-columns) :id [:in card-ids] :type "metric")
    (t2/select (into [:model/Card] exploration-card-columns) :id [:in card-ids])))

(mu/defn cards-with-moderated-status
  "The query-metadata columns of the Cards with `card-ids`, with their latest moderation status."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select :model/Card
             {:select    [:c.id :c.dataset_query :c.result_metadata :c.name
                          :c.description :c.collection_id :c.database_id :c.type
                          :c.source_card_id :c.created_at :c.entity_id :c.card_schema
                          :c.dimensions :c.dimension_mappings
                          [:r.status :moderated_status]]
              :from      [[:report_card :c]]
              :left-join [[^:allow-subquery {:select   [:moderated_item_id :status]
                                             :from     [:moderation_review]
                                             :where    [:and
                                                        [:= :moderated_item_type "card"]
                                                        [:= :most_recent true]]
                                             :order-by [[:id :desc]]
                                             :limit    1} :r]
                          [:= :r.moderated_item_id :c.id]]
              :where     [:in :c.id card-ids]}))

(mu/defn stale-cards
  "The listing columns of the Cards with `card-ids`, with their latest moderation status."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card
              :id :dashboard_id :description :collection_id :name :entity_id :archived :collection_position :display
              :collection_preview :database_id [nil :location] :dataset_query :card_schema :type :result_metadata
              :dimensions :dimension_mappings :last_used_at
              [^:allow-subquery
               {:select   [:status]
                :from     [:moderation_review]
                :where    [:and
                           [:= :moderated_item_type "card"]
                           [:= :moderated_item_id :report_card.id]
                           [:= :most_recent true]]
                :order-by [[:id :desc]]
                :limit    1}
               :moderated_status]]
             :id [:in card-ids]))

(mu/defn recent-cards
  "The Cards with `card-ids` with their Collection and Dashboard names."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select [:model/Card
              :id :name :collection_id :description :display
              :dataset_query :type :archived :card_schema
              :entity_id :result_metadata :dimensions :dimension_mappings
              :collection.authority_level [:collection.name :collection_name]
              [:dashboard.name :dashboard_name] :dashboard_id]
             {:where     [:in :report_card.id card-ids]
              :left-join [:collection [:= :collection.id :report_card.collection_id]
                          [:report_dashboard :dashboard] [:= :dashboard.id :report_card.dashboard_id]]}))

(mu/defn cards-for-recent-views
  "The Cards with `card-ids` with their Dashboard, Collection, and moderation status."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select :model/Card
             {:select    [:card.name
                          :card.description
                          :card.archived
                          :card.id
                          :card.database_id
                          :card.display
                          :card.card_schema
                          :card.type
                          :card.dimensions
                          :card.dimension_mappings
                          :card.result_metadata
                          :card.dataset_query
                          :card.entity_id
                          :card.visualization_settings
                          [:dashboard.id :dashboard_id]
                          [:dashboard.name :dashboard_name]
                          [:card.collection_id :entity-coll-id]
                          [:mr.status :moderated-status]
                          [:collection.id :collection_id]
                          [:collection.name :collection_name]
                          [:collection.authority_level :collection_authority_level]]
              :from      [[:report_card :card]]
              :where     [:in :card.id card-ids]
              :left-join [[:moderation_review :mr]
                          [:and
                           [:= :mr.moderated_item_id :card.id]
                           [:= :mr.moderated_item_type "card"]
                           [:= :mr.most_recent true]]
                          [:collection]
                          [:and
                           [:= :collection.id :card.collection_id]
                           [:= :collection.archived false]]
                          [:report_dashboard :dashboard]
                          [:= :dashboard.id :card.dashboard_id]]}))

(mu/defn pulse-cards
  "The Cards of the Pulses with `pulse-ids` with their PulseCard options in position order, excluding archived Cards
  unless `include-archived?`."
  [{:keys [pulse-ids include-archived?]} :- [:map {:closed true}
                                             [:pulse-ids [:sequential ::lib.schema.id/pulse]]
                                             [:include-archived? {:optional true} [:maybe :boolean]]]]
  (t2/select
   :model/Card
   {:select    [:c.id :c.name :c.description :c.collection_id :c.display :pc.include_csv :pc.include_xls
                :pc.format_rows :pc.pivot_results :pc.dashboard_card_id :dc.dashboard_id [nil :parameter_mappings]
                [:p.id :pulse_id]]
    :from      [[:pulse :p]]
    :join      [[:pulse_card :pc] [:= :p.id :pc.pulse_id]
                [:report_card :c] [:= :c.id :pc.card_id]]
    :left-join [[:report_dashboardcard :dc] [:= :pc.dashboard_card_id :dc.id]]
    :where     [:and
                [:in :p.id pulse-ids]
                (when-not include-archived? [:= :c.archived false])]
    :order-by  [[:pc.position :asc]]}))

(mu/defn series-cards-for-dashcards
  "The series Cards of the DashboardCards with `dashcard-ids`, each with its `:dashboardcard_id`, in series order."
  [{:keys [dashcard-ids]} :- [:map {:closed true}
                              [:dashcard-ids [:sequential ::lib.schema.id/dashcard]]]]
  (t2/select [:model/Card :id :name :description :display :dataset_query :type :database_id
              :visualization_settings :collection_id :card_schema :entity_id :result_metadata
              :dimensions :dimension_mappings :series.dashboardcard_id]
             {:left-join [[:dashboardcard_series :series] [:= :report_card.id :series.card_id]]
              :where     [:in :series.dashboardcard_id dashcard-ids]
              :order-by  [[:series.position :asc]]}))

(mu/defn sandboxing-cards
  "The Cards that Sandboxes are built on."
  []
  (t2/select :model/Card
             {:select [:c.id :c.dataset_query :c.database_id :c.card_schema
                       :c.type :c.entity_id :c.result_metadata :c.dimensions :c.dimension_mappings]
              :from   [[(t2/table-name :model/Card) :c]]
              :where  [:exists ^:allow-subquery {:select [[[:inline 1]]]
                                                 :from   [[(t2/table-name :model/Sandbox) :s]]
                                                 :where  [:= :s.card_id :c.id]}]}))

(mu/defn card-state :- [:maybe [:map
                                [:updated_at {:optional true} :any]
                                [:result_metadata {:optional true} :any]]]
  "The `:updated_at` and `:result_metadata` of the Card with `card-id`, locking its row until the transaction ends
  when `lock?`, or nil."
  [{:keys [card-id lock?]} :- [:map {:closed true}
                               [:card-id ::lib.schema.id/card]
                               [:lock? {:optional true} [:maybe :boolean]]]]
  (some-> (t2/select-one [:model/Card :updated_at :result_metadata]
                         (cond-> {:where [:= :id [:auto/param card-id]]} lock? (assoc :for :update)))
          (select-keys [:updated_at :result_metadata])))

;;; ------------------------------------------- Card reads by scope -------------------------------------------

(mu/defn cards-in-collection
  "The Cards in the Collection with `collection-id`."
  [{:keys [collection-id]} :- [:map {:closed true}
                               [:collection-id [:maybe ::lib.schema.id/collection]]]]
  (t2/select :model/Card :collection_id collection-id))

(mu/defn unarchived-cards-in-collection
  "The unarchived Cards in the Collection with `collection-id`, in name then id order."
  [{:keys [collection-id]} :- [:map {:closed true}
                               [:collection-id ::lib.schema.id/collection]]]
  (t2/select :model/Card {:where    [:and [:= :collection_id [:auto/param collection-id]] [:= :archived false]]
                          :order-by [[:name :asc] [:id :asc]]}))

(mu/defn card-summaries-in-collection
  "The summary columns of the unarchived Cards in the Collection with `collection-id`, ordered by name."
  [{:keys [collection-id]} :- [:map {:closed true}
                               [:collection-id [:maybe ::lib.schema.id/collection]]]]
  (t2/select (into [:model/Card] card-summary-columns)
             {:where    [:and [:= :collection_id collection-id] [:= :archived false]]
              :order-by [[:%lower.name :asc]]}))

(mu/defn top-level-cards-in-collection
  "The Cards in the Collection with `collection-id` that belong to no Dashboard, newest first."
  [{:keys [collection-id]} :- [:map {:closed true}
                               [:collection-id [:maybe ::lib.schema.id/collection]]]]
  (t2/select :model/Card {:where    [:and
                                     [:= :collection_id collection-id]
                                     [:= :dashboard_id nil]]
                          :order-by [[:id :desc]]}))

(mu/defn all-card-ids-in-collection
  "The IDs of every Card in the Collection with `collection-id`."
  [{:keys [collection-id]} :- [:map {:closed true}
                               [:collection-id ::lib.schema.id/collection]]]
  (t2/select-pks-vec :model/Card :collection_id [:auto/param collection-id]))

(mu/defn card-ids-in-collections
  "The subset of `card-ids` living in the Collections with `collection-ids`."
  [{:keys [card-ids collection-ids]} :- [:map {:closed true}
                                         [:card-ids card-ids-schema]
                                         [:collection-ids [:sequential [:maybe ::lib.schema.id/collection]]]]]
  (t2/select-pks-set :model/Card {:where [:and
                                          [:in :id card-ids]
                                          [:in :collection_id collection-ids]]}))

(mu/defn card-types-in-collections
  "The set of Card types present in the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true}
                                [:collection-ids [:sequential ::lib.schema.id/collection]]]]
  (t2/select-fn-set :type [:model/Card :type] :collection_id [:in collection-ids]))

(mu/defn card-in-collections-exists?
  "Whether a Card is in one of the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true}
                                [:collection-ids [:sequential ::lib.schema.id/collection]]]]
  (t2/exists? :model/Card :collection_id [:in collection-ids]))

(mu/defn library-cards-in-collections
  "The id, name, description, and type of the unarchived metric and model Cards in the Collections with
  `collection-ids`, narrowed to `card-id` when given."
  [{:keys [collection-ids card-id]} :- [:map {:closed true}
                                        [:collection-ids [:sequential ::lib.schema.id/collection]]
                                        [:card-id {:optional true} [:maybe ::lib.schema.id/card]]]]
  (t2/select [:model/Card :id :name :description :type]
             {:where [:and
                      [:in :collection_id collection-ids]
                      [:= :archived false]
                      [:in :type ["metric" "model"]]
                      (when card-id [:= :id card-id])]}))

(mu/defn unarchived-metric-count-in-collections
  "The number of unarchived metric Cards in the Collections with `collection-ids`."
  [{:keys [collection-ids]} :- [:map {:closed true}
                                [:collection-ids [:set ::lib.schema.id/collection]]]]
  (t2/count :model/Card {:where [:and
                                 [:= :type "metric"]
                                 [:= :archived false]
                                 [:in :collection_id collection-ids]]}))

(mu/defn cards-of-table
  "The Cards on the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ::lib.schema.id/table]]]
  (t2/select :model/Card :table_id [:auto/param table-id]))

(mu/defn card-with-table-exists?
  "Whether one of the Cards with `card-ids` is on the Table with `table-id`."
  [{:keys [card-ids table-id]} :- [:map {:closed true}
                                   [:card-ids card-ids-schema]
                                   [:table-id ::lib.schema.id/table]]]
  (t2/exists? :model/Card :id [:in card-ids] :table_id [:auto/param table-id]))

(mu/defn card-summaries-of-table
  "The summary columns of the unarchived Cards on the Table with `table-id`, ordered by name."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ::lib.schema.id/table]]]
  (t2/select (into [:model/Card] card-summary-columns)
             :table_id [:auto/param table-id]
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn model-summaries-of-database
  "The summary columns of the unarchived model Cards on the Database with `database-id`, ordered by name."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (t2/select (into [:model/Card] card-summary-columns)
             :type :model
             :database_id [:auto/param database-id]
             :archived false
             {:order-by [[:%lower.name :asc]]}))

(mu/defn unarchived-metric-cards-of-tables
  "The unarchived metric Cards of the Tables with `table-ids`, ordered by name."
  [{:keys [table-ids]} :- [:map {:closed true}
                           [:table-ids [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]]]
  (t2/select :model/Card :table_id [:in table-ids] :archived false :type :metric {:order-by [[:name :asc]]}))

(mu/defn unarchived-metric-cards-of-table
  "The unarchived metric Cards of the Table with `table-id`, which may be nil."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id [:maybe ::lib.schema.id/table]]]]
  (t2/select :model/Card :table_id table-id :type :metric :archived false))

(mu/defn unarchived-cards-of-table-with-types
  "The unarchived Cards of the Table with `table-id`, which may be nil, whose type is one of `card-types`."
  [{:keys [table-id card-types]} :- [:map {:closed true}
                                     [:table-id [:maybe ::lib.schema.id/table]]
                                     [:card-types [:sequential :keyword]]]]
  (t2/select :model/Card :table_id table-id :type [:in card-types] :archived false))

(mu/defn unarchived-metric-cards
  "The unarchived metric Cards."
  []
  (t2/select [:model/Card :id :database_id :dataset_query :card_schema :type :entity_id :result_metadata :dimensions
              :dimension_mappings]
             :type "metric" :archived false))

(mu/defn unpersisted-model-cards
  "The model Cards of the Database with `database-id` that have no PersistedInfo."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (t2/select :model/Card
             {:where [:and
                      [:= :database_id [:auto/param database-id]]
                      [:= :type "model"]
                      [:not [:exists ^:allow-subquery
                             {:select [1]
                              :from   [:persisted_info]
                              :where  [:= :persisted_info.card_id :report_card.id]}]]]}))

(mu/defn universe-cards
  "The id, name, type, and Collection id of the unarchived metric and model Cards outside the Database with
  `audit-database-id`."
  [{:keys [audit-database-id]} :- [:map {:closed true}
                                   [:audit-database-id ::lib.schema.id/database]]]
  (t2/select [:model/Card :id :name :type :collection_id]
             :type        [:in ["metric" "model"]]
             :archived    false
             :database_id [:not= audit-database-id]))

(mu/defn card-ids-of-databases
  "The ids of the Cards of the Databases with `database-ids`."
  [{:keys [database-ids]} :- [:map {:closed true}
                              [:database-ids [:sequential ::lib.schema.id/database]]]]
  (t2/select-fn-vec :id [:model/Card :id] :database_id [:in database-ids]))

(mu/defn saved-cards-for-conversation
  "The id and chart id of the unarchived Cards saved from the MetabotConversation with `conversation-id`, in id order."
  [{:keys [conversation-id]} :- [:map {:closed true}
                                 [:conversation-id :string]]]
  (t2/select [:model/Card :id :metabot_chart_id]
             :metabot_conversation_id [:auto/param conversation-id]
             :archived false
             {:order-by [[:id :asc]]}))

(mu/defn non-internal-card-collection-ids
  "The Collection id of every non-internal Card."
  []
  (t2/select [:model/Card :collection_id] {:where [:and (mi/exclude-internal-content-hsql :model/Card)]}))

;;; --------------------------------------------- Card counts ---------------------------------------------

(mu/defn unarchived-card-count
  "The number of unarchived Cards of `card-type`."
  [{:keys [card-type]} :- [:map {:closed true}
                           [:card-type [:or :keyword :string]]]]
  (t2/count :model/Card :archived false :type [:auto/param card-type]))

(mu/defn unarchived-pivot-table-count
  "The number of unarchived pivot table Cards."
  []
  (t2/count :model/Card :display :pivot :archived false))

(mu/defn embedded-card-count
  "The number of Cards with embedding enabled."
  []
  (t2/count :model/Card :enable_embedding true))

(mu/defn embedded-card-exists?
  "Whether a Card with embedding enabled exists."
  []
  (t2/exists? :model/Card :enable_embedding true))

(mu/defn public-card-exists?
  "Whether a publicly shared Card exists."
  []
  (t2/exists? :model/Card :public_uuid [:not= nil]))

(mu/defn document-owned-card-ids
  "The ids of every Card a Document owns."
  []
  (t2/select-pks-set [:model/Card :id] {:where [:not= :document_id nil]}))

;;; ------------------------------------------- Dashboard and Document Cards -------------------------------------------

(mu/defn internal-dashboard-question-ids
  "The ids of the Cards internal to the Dashboard with `dashboard-id`."
  [{:keys [dashboard-id]} :- [:map {:closed true}
                              [:dashboard-id ::lib.schema.id/dashboard]]]
  (t2/select-pks-set :model/Card :dashboard_id [:auto/param dashboard-id]))

(mu/defn unarchived-dashboard-question-exists?
  "Whether an unarchived Card internal to the Dashboard with `dashboard-id` exists."
  [{:keys [dashboard-id]} :- [:map {:closed true}
                              [:dashboard-id ::lib.schema.id/dashboard]]]
  (t2/exists? :model/Card :dashboard_id [:auto/param dashboard-id] :archived false))

(mu/defn card-internal-to-other-dashboard-exists?
  "Whether any of the Cards with `card-ids` is internal to a Dashboard other than `dashboard-id`."
  [{:keys [dashboard-id card-ids]} :- [:map {:closed true}
                                       [:dashboard-id ::lib.schema.id/dashboard]
                                       [:card-ids card-ids-schema]]]
  (t2/exists? :model/Card
              {:where [:and
                       [:not= :dashboard_id [:auto/param dashboard-id]]
                       [:not= :dashboard_id nil]
                       [:in :id card-ids]]}))

(mu/defn unarchived-card-ids
  "The ids among `card-ids` of unarchived Cards, restricted to those belonging to the Dashboard with `dashboard-id` or
  to no Dashboard when `dashboard-id` is given."
  [{:keys [card-ids dashboard-id]} :- [:map {:closed true}
                                       [:card-ids card-ids-schema]
                                       [:dashboard-id {:optional true} [:maybe ::lib.schema.id/dashboard]]]]
  (t2/select-pks-set :model/Card
                     {:where [:and
                              [:in :id card-ids]
                              [:= :archived false]
                              (when dashboard-id
                                [:or
                                 [:= :dashboard_id dashboard-id]
                                 [:= :dashboard_id nil]])]}))

(mu/defn document-cards-among
  "The Cards among `card-ids` that belong to a Document."
  [{:keys [card-ids]} :- [:map {:closed true}
                          [:card-ids card-ids-schema]]]
  (t2/select :model/Card :id [:in card-ids] :document_id [:<> nil]))

(mu/defn cards-for-document
  "The Cards of the Document with `document-id`."
  [{:keys [document-id]} :- [:map {:closed true}
                             [:document-id ms/PositiveInt]]]
  (t2/select :model/Card :document_id [:auto/param document-id]))

(mu/defn cards-not-in-document
  "The Cards with `card-ids` that do not belong to the Document with `document-id`."
  [{:keys [card-ids document-id]} :- [:map {:closed true}
                                      [:card-ids card-ids-schema]
                                      [:document-id ms/PositiveInt]]]
  (t2/select :model/Card {:where [:and [:in :id card-ids]
                                  [:or [:<> :document_id [:auto/param document-id]]
                                   [:= :document_id nil]]]}))

(mu/defn unarchived-cards-for-documents
  "The unarchived Cards of the Documents with `document-ids`."
  [{:keys [document-ids]} :- [:map {:closed true}
                              [:document-ids [:sequential ms/PositiveInt]]]]
  (t2/select :model/Card :document_id [:in document-ids] :archived false))

(mu/defn unarchived-card-in-document-exists?
  "Whether the unarchived Card with `card-id` belongs to the Document with `document-id`."
  [{:keys [card-id document-id]} :- [:map {:closed true}
                                     [:card-id ::lib.schema.id/card]
                                     [:document-id ms/PositiveInt]]]
  (t2/exists? :model/Card
              :id [:auto/param card-id]
              :document_id [:auto/param document-id]
              :archived false))

;;; ------------------------------------------------ Public sharing ------------------------------------------------

(mu/defn unarchived-cards-by-public-uuid-prefix
  "The unarchived Cards whose public uuid prefix is `prefix`."
  [{:keys [prefix]} :- [:map {:closed true}
                        [:prefix :string]]]
  (t2/select :model/Card :public_uuid_prefix [:auto/param prefix] :archived false))

(mu/defn unarchived-card-ids-and-public-uuids-by-prefix
  "The id and public uuid of the unarchived Cards whose public uuid prefix is `prefix`."
  [{:keys [prefix]} :- [:map {:closed true}
                        [:prefix :string]]]
  (t2/select [:model/Card :id :public_uuid] :public_uuid_prefix [:auto/param prefix] :archived false))

;;; ------------------------------------------------ Metrics ------------------------------------------------

(defn- autocomplete-cards-search-clause
  "The `:where` fragment matching Cards against `search-card-slug`: a bare number is a prefix match on the id, a
  number followed by text is an exact id match plus a name prefix match, and bare text is a name substring match."
  [search-card-slug]
  (let [search-id   (re-find #"\d*" search-card-slug)
        search-name (-> (re-matches #"\d*-?(.*)" search-card-slug)
                        second
                        (str/replace #"-" " ")
                        u/lower-case-en)]
    (cond
      (and (not-empty search-id) (empty? search-name))
      [:like
       (h2x/cast (if (= (mdb/db-type) :mysql) :char :text) :report_card.id)
       (str search-id "%")]

      (and (not-empty search-id) (not-empty search-name))
      [:and
       [:= :report_card.id (parse-long search-id)]
       [:like [:lower :report_card.name] (h2x/like-prefix search-name)]]

      (and (empty? search-id) (not-empty search-name))
      [:like [:lower :report_card.name] (h2x/like-substring search-name)])))

(mu/defn autocomplete-cards
  "Up to 50 unarchived Cards of the Database with `database-id` matching `search-card-slug`, with their Collection
  name, models first then newest first, excluding Dashboard questions unless `include-dashboard-questions?`."
  [{:keys [database-id search-card-slug include-dashboard-questions?]}
   :- [:map {:closed true}
       [:database-id ::lib.schema.id/database]
       [:search-card-slug :string]
       [:include-dashboard-questions? {:optional true} [:maybe :boolean]]]]
  (t2/select [:model/Card :id :type :database_id :name :collection_id
              [:collection.name :collection_name]]
             {:where     [:and
                          [:= :report_card.database_id database-id]
                          [:= :report_card.archived false]
                          (when-not include-dashboard-questions?
                            [:= :report_card.dashboard_id nil])
                          (autocomplete-cards-search-clause search-card-slug)]
              :left-join [[:collection :collection] [:= :collection.id :report_card.collection_id]]
              :order-by  [[:type :asc]
                          [:report_card.id :desc]]
              :limit     50}))

;;; ------------------------------------------- Queries and executions -------------------------------------------

(mu/defn query-execution-hash-counts
  "The `:hash` and execution count `:n` of the QueryExecutions started at or after `started-at` and before
  `started-before`, grouped by hash."
  [{:keys [started-at started-before]} :- [:map {:closed true}
                                           [:started-at ms/TemporalInstant]
                                           [:started-before ms/TemporalInstant]]]
  (t2/select [:model/QueryExecution :hash [:%count.* :n]]
             {:where    [:and
                         [:>= :started_at [:auto/param started-at]]
                         [:<  :started_at [:auto/param started-before]]]
              :group-by [:hash]}))

(mu/defn queries-reducible
  "A reducible over `conn` of the hash and query of the Queries with `query-hashes`."
  [{:keys [conn query-hashes]} :- [:map {:closed true}
                                   [:conn (ms/InstanceOfClass java.sql.Connection)]
                                   [:query-hashes [:sequential {:min 1} bytes?]]]]
  (t2/reducible-select :conn conn [:model/Query :query_hash :query] :query_hash [:in [:auto/param query-hashes]]))

(mu/defn query-average-execution-times
  "A map of query hash to average execution time for the Queries with `query-hashes`."
  [{:keys [query-hashes]} :- [:map {:closed true}
                              [:query-hashes [:sequential bytes?]]]]
  (t2/select-fn->fn :query_hash :average_execution_time :model/Query :query_hash [:in query-hashes]))

(mu/defn recent-card-runs
  "Up to `limit` most recently run question Cards with their run counts and last runner."
  [{:keys [limit]} :- [:map {:closed true}
                       [:limit ms/PositiveInt]]]
  (t2/select [:model/QueryExecution
              [:%min.executor_id :user_id]
              [:query_execution.card_id :model_id]
              [:%count.* :cnt]
              [:%max.started_at :max_ts]]
             {:group-by [:query_execution.card_id :context]
              :where    [:and
                         [:= :context (h2x/literal :question)]]
              :order-by [[:max_ts :desc]]
              :limit    limit}))

(mu/defn query-execution-ids-excluding-database
  "Up to `limit` ids of QueryExecutions not run against the Database with `database-id`."
  [{:keys [database-id limit]} :- [:map {:closed true}
                                   [:database-id [:maybe ::lib.schema.id/database]]
                                   [:limit ms/PositiveInt]]]
  (t2/select-fn-set :id :model/QueryExecution
                    {:where [:or
                             [:not= :database_id database-id]
                             [:= :database_id nil]]
                     :limit limit}))

(mu/defn query-execution-count-since
  "The number of QueryExecutions started at or after `since`."
  [{:keys [since]} :- [:map {:closed true}
                       [:since ms/TemporalInstant]]]
  (t2/count :model/QueryExecution :started_at [:>= since]))

(def ^:private duration-scope-schema
  [:map {:closed true}
   [:model         :string]
   [:model-id      ms/PositiveInt]
   [:rerun-cutoff  ms/TemporalInstant]])

(mu/defn duration-queries-to-rerun
  "The query definitions to rerun for the duration cache `scopes`, each `{:model :model-id :rerun-cutoff}`, counting
  only executions started after `started-after`; `parameterized?` selects parameterized or plain queries."
  [{:keys [scopes started-after parameterized?]} :- [:map {:closed true}
                                                     [:scopes [:sequential duration-scope-schema]]
                                                     [:started-after ms/TemporalInstant]
                                                     [:parameterized? :boolean]]]
  (t2/select
   :model/Query
   {:select [:u.query :u.cache-hash :u.card-id :u.dashboard-id :u.count]
    :from   [[^:allow-subquery
              {:union (for [{:keys [model model-id rerun-cutoff]} scopes]
                        ^:allow-subquery
                        {:nest
                         ^:allow-subquery
                         {:select   [[:q.query :query]
                                     [:qc.query_hash :cache-hash]
                                     [:qe.card_id :card-id]
                                     [:qe.dashboard_id :dashboard-id]
                                     [[:count :q.query_hash] :count]]
                          :from     [[(t2/table-name :model/Query) :q]]
                          :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]
                                     [(t2/table-name :model/QueryCache) :qc] [:= :qc.query_hash :qe.cache_hash]]
                          :where    [:and
                                     (case model
                                       "question"  [:= :qe.card_id model-id]
                                       "dashboard" [:= :qe.dashboard_id model-id])
                                     [:<= :qc.updated_at rerun-cutoff]
                                     [:>= :qe.started_at started-after]
                                     [:= :qe.error nil]
                                     [:= :qe.is_sandboxed false]
                                     (if parameterized?
                                       [:and
                                        [:= :qe.parameterized true]
                                        [:= :qe.cache_hit true]
                                        [:not= :qe.context "cache-refresh"]]
                                       [:= :qe.parameterized false])]
                          :group-by [:q.query_hash :q.query :qc.query_hash :qe.card_id :qe.dashboard_id]}})}
              :u]]}))

(mu/defn scheduled-base-query-to-rerun
  "The unparameterized query definition of the Card with `card-id` executed most recently after `started-after`, or
  nil."
  [{:keys [card-id started-after]} :- [:map {:closed true}
                                       [:card-id ::lib.schema.id/card]
                                       [:started-after ms/TemporalInstant]]]
  (t2/select-one :model/Query
                 {:select   [:q.query [:qe.card_id :card-id]]
                  :from     [[(t2/table-name :model/Query) :q]]
                  :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
                  :where    [:and
                             [:= :qe.card_id card-id]
                             [:= :qe.parameterized false]
                             [:= :qe.error nil]
                             [:= :qe.is_sandboxed false]
                             [:>= :qe.started_at started-after]]
                  :order-by [[:qe.started_at :desc]]
                  :limit    1}))

(mu/defn scheduled-parameterized-queries-to-rerun
  "The `limit` most common parameterized query definitions of the Card with `card-id` executed after `rerun-cutoff`."
  [{:keys [card-id rerun-cutoff limit]} :- [:map {:closed true}
                                            [:card-id ::lib.schema.id/card]
                                            [:rerun-cutoff ms/TemporalInstant]
                                            [:limit ms/PositiveInt]]]
  (t2/select :model/Query
             {:select   [:q.query [:qe.card_id :card-id]]
              :from     [[(t2/table-name :model/Query) :q]]
              :join     [[(t2/table-name :model/QueryExecution) :qe] [:= :qe.hash :q.query_hash]]
              :where    [:and
                         [:= :qe.card_id card-id]
                         [:>= :qe.started_at rerun-cutoff]
                         [:not= :qe.context "cache-refresh"]
                         [:= :parameterized true]
                         [:= :qe.error nil]
                         [:= :qe.is_sandboxed false]]
              :group-by [:q.query_hash :q.query :qe.card_id]
              :order-by [[[:count :q.query_hash] :desc]
                         [[:min :qe.started_at] :asc]]
              :limit    limit}))

;;; ------------------------------------------------ QueryTable ------------------------------------------------

(def ^:private quoted-identifier-chars
  "Characters that quote a SQL identifier, making its match against a Table name/schema case-sensitive."
  "\"`")

(defn- quote-stripper
  [quote-char]
  (let [doubled (str quote-char quote-char)
        single  (str quote-char)]
    #(-> (subs % 1 (dec (count %)))
         (str/replace doubled single))))

(def ^:private quote-char->stripper
  (zipmap quoted-identifier-chars (map quote-stripper quoted-identifier-chars)))

(defn- table-part-clause
  "Exact match for a quoted `value`, case-insensitive match for an unquoted `value`."
  [field value]
  (if-let [strip (quote-char->stripper (first value))]
    [:= field (strip value)]
    [:= [:lower field] (u/lower-case-en value)]))

(defn- table-match-clause
  [{:keys [schema table]}]
  (if-not schema
    (table-part-clause :t.name table)
    [:and
     (table-part-clause :t.name table)
     (table-part-clause :t.schema schema)]))

(mu/defn query-table-reference
  "The first Table id, name, and schema in the Database with `db-id` matching `table` and `schema` when given, as a
  query table reference, where matching is case-insensitive unless quoted with `\"` or `` ` ``."
  [{:keys [db-id schema table]} :- [:map {:closed true}
                                    [:db-id ::lib.schema.id/database]
                                    [:schema [:maybe :string]]
                                    [:table :string]]]
  (t2/select-one :model/QueryTable
                 {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
                  :from   [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
                  :where  [:and
                           [:= :t.db_id db-id]
                           (table-match-clause {:schema schema :table table})]}))

(mu/defn query-table-references
  "The Table ids, names, and schemas in the Database with `db-id` matching any of `tables`, each a map of `:schema`
  and `:table`, as query table references."
  [{:keys [db-id tables]} :- [:map {:closed true}
                              [:db-id ::lib.schema.id/database]
                              [:tables [:sequential [:map {:closed true}
                                                     [:schema [:maybe :string]]
                                                     [:table :string]]]]]]
  (t2/select :model/QueryTable
             {:select [[:t.id :table-id] [:t.name :table] [:t.schema :schema]]
              :from   [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
              :where  [:and
                       [:= :t.db_id db-id]
                       (into [:or] (map table-match-clause) tables)]}))
