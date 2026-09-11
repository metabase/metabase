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
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

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

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards
  "The Cards with `card-ids` (nil entries, e.g. from virtual dashcards, are ignored)."
  [card-ids :- [:maybe [:or [:set [:maybe ::lib.schema.id/card]] [:sequential [:maybe ::lib.schema.id/card]]]]]
  (t2/select :model/Card :id [:in card-ids]))

(mu/defn card-query-info
  "The query, type, result metadata, and schema of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :dataset_query :type :result_metadata :card_schema] :id card-id))

(mu/defn card-dataset-query
  "The `:dataset_query` of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :dataset_query [:model/Card :dataset_query :card_schema] :id card-id))

(mu/defn card-document-id
  "The `:document_id` of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :document_id :model/Card :id card-id))

(mu/defn card-parameters
  "The `:parameters` of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :parameters [:model/Card :parameters] :id card-id))

(mu/defn card-dimensions
  "The raw `:dimensions` row of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/query-one {:select [:dimensions]
                 :from   [:report_card]
                 :where  [:= :id card-id]}))

(mu/defn card-database-and-table-ids
  "The database and primary table IDs of the Card with `card-id`, as `:database-id` and `:table-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card [:database_id :database-id] [:table_id :table-id]] :id card-id))

(mu/defn card-queries
  "The IDs and queries of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select [:model/Card :id :dataset_query :card_schema] :id [:in card-ids]))

(mu/defn source-card-dependents
  "The IDs and source Card IDs of the Cards whose source Card is one of `source-card-ids`."
  [source-card-ids :- [:or [:set ::lib.schema.id/card] [:sequential ::lib.schema.id/card]]]
  (t2/select [:model/Card :id :source_card_id :card_schema] :source_card_id [:in source-card-ids]))

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
  "Rows of `:card_id` and `:count` of DashboardCards for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/query {:select   [[:%count.* :count] :card_id]
             :from     [:report_dashboardcard]
             :where    [:in :card_id card-ids]
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

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn database-name
  "The name of the Database with `database-id`."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name :model/Database :id database-id))

(mu/defn field-database-info-for-ids
  "The id, name, table name, and Database id of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/query {:select    [[:field.id :field-id]
                         [:field.name :field-name]
                         [:table.name :table-name]
                         [:table.db_id :field-db-id]]
             :from      [[:metabase_field :field]]
             :left-join [(warehouse-schema-overlay/table-query {:alias :table})
                         [:= :field.table_id :table.id]]
             :where     [:in :field.id field-ids]}))

(mu/defn field-table-ids
  "The set of Table IDs of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids] {:from [(warehouse-schema-overlay/field-query)]}))

(mu/defn snippets
  "The NativeQuerySnippets with `snippet-ids`."
  [snippet-ids :- [:set ::lib.schema.id/native-query-snippet]]
  (t2/select :model/NativeQuerySnippet :id [:in snippet-ids]))

(mu/defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one :model/Dashboard :id dashboard-id))

(mu/defn dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(mu/defn dashboard-collection-id
  "The `:collection_id` of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] :id dashboard-id))

(mu/defn dashboard-parameters
  "The `:parameters` of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :parameters [:model/Dashboard :parameters] :id dashboard-id))

(mu/defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`, returning the number updated."
  [dashboard-id :- ::lib.schema.id/dashboard
   changes      :- ::dashboards.schema/dashboard.update]
  (t2/update! :model/Dashboard dashboard-id changes))

(mu/defn dashcards-for-card
  "The DashboardCards showing the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/DashboardCard :card_id card-id))

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

(mu/defn implicit-action-ids-for-model
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

(mu/defn card-notification-ids
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
  [rows :- [:sequential :map]]
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
