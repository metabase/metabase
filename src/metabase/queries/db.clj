(ns metabase.queries.db
  "Application database queries for the queries module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration
  methods."
  (:require
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Cards ------------------------------------------------

(defn card
  "The Card with `card-id`, or nil."
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn cards
  "The Cards with `card-ids`."
  [card-ids]
  (t2/select :model/Card :id [:in card-ids]))

(defn card-query-info
  "The query, type, result metadata, and schema of the Card with `card-id`."
  [card-id]
  (t2/select-one [:model/Card :dataset_query :type :result_metadata :card_schema] :id card-id))

(defn card-dataset-query
  "The `:dataset_query` of the Card with `card-id`."
  [card-id]
  (t2/select-one-fn :dataset_query [:model/Card :dataset_query :card_schema] :id card-id))

(defn card-document-id
  "The `:document_id` of the Card with `card-id`."
  [card-id]
  (t2/select-one-fn :document_id :model/Card :id card-id))

(defn card-parameters
  "The `:parameters` of the Card with `card-id`."
  [card-id]
  (t2/select-one-fn :parameters [:model/Card :parameters] :id card-id))

(defn card-dimensions
  "The raw `:dimensions` row of the Card with `card-id`."
  [card-id]
  (t2/query-one {:select [:dimensions]
                 :from   [:report_card]
                 :where  [:= :id card-id]}))

(defn card-database-and-table-ids
  "The database and primary table IDs of the Card with `card-id`, as `:database-id` and `:table-id`."
  [card-id]
  (t2/select-one [:model/Card [:database_id :database-id] [:table_id :table-id]] :id card-id))

(defn card-queries
  "The IDs and queries of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :dataset_query :card_schema] :id [:in card-ids]))

(defn source-card-dependents
  "The IDs and source Card IDs of the Cards whose source Card is one of `source-card-ids`."
  [source-card-ids]
  (t2/select [:model/Card :id :source_card_id :card_schema] :source_card_id [:in source-card-ids]))

(defn metric-cards-for-source-cards
  "The unarchived metric Cards built on one of `source-card-ids`, ordered by name."
  [source-card-ids]
  (t2/select :model/Card
             :source_card_id [:in source-card-ids]
             :archived false
             :type :metric
             {:order-by [[:name :asc]]}))

(defn document-card-ids
  "The IDs of the Cards that belong to the Document with `document-id`."
  [document-id]
  (t2/select-pks-set :model/Card :document_id document-id))

(defn insert-card!
  "Insert `card` and return the new instance."
  [card]
  (t2/insert-returning-instance! :model/Card card))

(defn update-card!
  "Apply `changes` to the Card with `card-id`."
  [card-id changes]
  (t2/update! :model/Card card-id changes))

;;; ------------------------------------------- Card statistics -------------------------------------------

(defn dashcard-counts-by-card
  "Rows of `:card_id` and `:count` of DashboardCards for each of `card-ids`."
  [card-ids]
  (t2/query {:select   [[:%count.* :count] :card_id]
             :from     [:report_dashboardcard]
             :where    [:in :card_id card-ids]
             :group-by [:card_id]}))

(defn parameter-card-counts-by-card
  "Rows of `:card_id` and `:count` of ParameterCards for each of `card-ids`."
  [card-ids]
  (t2/query {:select   [[:%count.* :count] :card_id]
             :from     [:parameter_card]
             :where    [:in :card_id card-ids]
             :group-by [:card_id]}))

(defn average-running-times-by-card
  "Rows of `:card_id` and average `:running_time` of uncached executions for each of `card-ids`."
  [card-ids]
  (t2/query {:select   [[:%avg.running_time :running_time] :card_id]
             :from     [:query_execution]
             :where    [:and
                        [:not= :running_time nil]
                        [:not= :cache_hit true]
                        [:in :card_id card-ids]]
             :group-by [:card_id]}))

(defn last-query-starts-by-card
  "Rows of `:card_id` and latest `:started_at` of uncached executions for each of `card-ids`."
  [card-ids]
  (t2/query {:select   [[:%max.started_at :started_at] :card_id]
             :from     [:query_execution]
             :where    [:and
                        [:not= :running_time nil]
                        [:not= :cache_hit true]
                        [:in :card_id card-ids]]
             :group-by [:card_id]}))

(defn dashboards-for-cards
  "Rows of `:card_id` plus Dashboard columns for every Dashboard each of `card-ids` appears on, directly or as a series."
  [card-ids]
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

(defn databases
  "The Databases with `database-ids`."
  [database-ids]
  (t2/select :model/Database :id [:in database-ids]))

(defn database-name
  "The name of the Database with `database-id`."
  [database-id]
  (t2/select-one-fn :name :model/Database :id database-id))

(defn field-table-ids
  "The set of Table IDs of the Fields with `field-ids`."
  [field-ids]
  (t2/select-fn-set :table_id :model/Field :id [:in field-ids]))

(defn snippets
  "The NativeQuerySnippets with `snippet-ids`."
  [snippet-ids]
  (t2/select :model/NativeQuerySnippet :id [:in snippet-ids]))

(defn dashboard
  "The Dashboard with `dashboard-id`, or nil."
  [dashboard-id]
  (t2/select-one :model/Dashboard :id dashboard-id))

(defn dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids]
  (t2/select :model/Dashboard :id [:in dashboard-ids]))

(defn dashboard-collection-id
  "The `:collection_id` of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] :id dashboard-id))

(defn dashboard-parameters
  "The `:parameters` of the Dashboard with `dashboard-id`."
  [dashboard-id]
  (t2/select-one-fn :parameters [:model/Dashboard :parameters] :id dashboard-id))

(defn update-dashboard!
  "Apply `changes` to the Dashboard with `dashboard-id`."
  [dashboard-id changes]
  (t2/update! :model/Dashboard dashboard-id changes))

(defn dashcards-for-card
  "The DashboardCards showing the Card with `card-id`."
  [card-id]
  (t2/select :model/DashboardCard :card_id card-id))

(defn insert-dashcard!
  "Insert `dashcard`."
  [dashcard]
  (t2/insert! :model/DashboardCard dashcard))

(defn update-dashcard!
  "Apply `changes` to the DashboardCard with `dashcard-id`."
  [dashcard-id changes]
  (t2/update! :model/DashboardCard :id dashcard-id changes))

(defn delete-dashcards-for-card-on-dashboard!
  "Delete the DashboardCards showing the Card with `card-id` on the Dashboard with `dashboard-id`."
  [card-id dashboard-id]
  (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id dashboard-id))

(defn delete-dashcards-for-card-off-dashboard!
  "Delete the DashboardCards showing the Card with `card-id` on any Dashboard other than `dashboard-id`."
  [card-id dashboard-id]
  (t2/delete! :model/DashboardCard :card_id card-id :dashboard_id [:not= dashboard-id]))

(defn dashcard-series-for-card-on-dashboard
  "The IDs of the DashboardCardSeries showing the Card with `card-id` on the Dashboard with `dashboard-id`."
  [card-id dashboard-id]
  (t2/query {:select [[:dcs.id]]
             :from   [[:dashboardcard_series :dcs]]
             :join   [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]]
             :where  [:and
                      [:= :dc.dashboard_id dashboard-id]
                      [:= :dcs.card_id card-id]]}))

(defn dashcard-series-for-card-off-dashboard
  "The IDs of the DashboardCardSeries showing the Card with `card-id` on any Dashboard other than `dashboard-id`."
  [card-id dashboard-id]
  (t2/query {:select [[:dcs.id]]
             :from   [[:dashboardcard_series :dcs]]
             :join   [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]]
             :where  [:and
                      [:= :dcs.card_id card-id]
                      [:not= :dc.dashboard_id dashboard-id]]}))

(defn delete-dashcard-series!
  "Delete the DashboardCardSeries with `series-ids`."
  [series-ids]
  (t2/delete! :model/DashboardCardSeries :id [:in series-ids]))

(defn implicit-action-ids-for-model
  "The IDs of the implicit Actions of the model Card with `model-id`."
  [model-id]
  (t2/select-pks-set :model/Action {:select [:action.id]
                                    :from   [:action]
                                    :join   [:implicit_action [:= :action.id :implicit_action.action_id]]
                                    :where  [:= :action.model_id model-id]}))

(defn delete-actions!
  "Delete the Actions with `action-ids`."
  [action-ids]
  (t2/delete! :model/Action :id [:in action-ids]))

(defn archive-explicit-actions-for-model!
  "Archive the non-implicit Actions of the model Card with `model-id`."
  [model-id]
  (t2/update! :model/Action {:model_id model-id :type [:not= :implicit]} {:archived true}))

(defn delete-implicit-actions-for-model!
  "Delete the implicit Actions of the model Card with `model-id`."
  [model-id]
  (t2/delete! :model/Action :model_id model-id :type :implicit))

(defn delete-card-moderation-reviews!
  "Delete the ModerationReviews of the Card with `card-id`."
  [card-id]
  (t2/delete! :model/ModerationReview :moderated_item_type "card" :moderated_item_id card-id))

(defn delete-card-revisions!
  "Delete the Revisions of the Card with `card-id`."
  [card-id]
  (t2/delete! :model/Revision :model "Card" :model_id card-id))

(defn card-notification-ids
  "The IDs of the card Notifications attached to the Card with `card-id`."
  [card-id]
  (t2/select-pks-set :model/Notification
                     :payload_type :notification/card
                     :payload_id [:in ^:allow-subquery {:select [:id]
                                                        :from   [:notification_card]
                                                        :where  [:= :card_id card-id]}]))

(defn delete-notifications!
  "Delete the Notifications with `notification-ids`."
  [notification-ids]
  (t2/delete! :model/Notification :id [:in notification-ids]))

;;; --------------------------------------------- ParameterCard ---------------------------------------------

(defn parameter-cards-for-card
  "The ParameterCards drawing values from the Card with `card-id`."
  [card-id]
  (t2/select :model/ParameterCard :card_id card-id))

(defn parameter-card-card-ids
  "The set of Card IDs the parameters of the given parameterized object draw values from."
  [object-type object-id]
  (t2/select-fn-set :card_id :model/ParameterCard
                    :parameterized_object_type object-type
                    :parameterized_object_id object-id))

(defn parameter-card-exists?
  "Whether the given parameter of the given parameterized object has a ParameterCard."
  [object-type object-id parameter-id]
  (t2/exists? :model/ParameterCard
              :parameterized_object_type object-type
              :parameterized_object_id object-id
              :parameter_id parameter-id))

(defn set-parameter-card-card-id!
  "Point the ParameterCard of the given parameter of the given parameterized object at `card-id`."
  [object-type object-id parameter-id card-id]
  (t2/update! :model/ParameterCard
              {:parameterized_object_type object-type
               :parameterized_object_id   object-id
               :parameter_id              parameter-id}
              {:card_id card-id}))

(defn insert-parameter-card!
  "Insert `parameter-card`."
  [parameter-card]
  (t2/insert! :model/ParameterCard parameter-card))

(defn delete-parameter-cards-for-card!
  "Delete the ParameterCards drawing values from the Card with `card-id`."
  [card-id]
  (t2/delete! :model/ParameterCard :card_id card-id))

(defn delete-parameter-cards-for-object!
  "Delete every ParameterCard of the given parameterized object."
  [object-type object-id]
  (t2/delete! :model/ParameterCard
              :parameterized_object_type object-type
              :parameterized_object_id object-id))

(defn delete-parameter-cards-for-object-except!
  "Delete the ParameterCards of the given parameterized object whose parameter is not one of `parameter-ids`."
  [object-type object-id parameter-ids]
  (t2/delete! :model/ParameterCard
              :parameterized_object_type object-type
              :parameterized_object_id object-id
              :parameter_id [:not-in parameter-ids]))

;;; -------------------------------------------------- Query --------------------------------------------------

(defn average-execution-time
  "The recorded average execution time of the query with `query-hash`."
  [query-hash]
  (t2/select-one-fn :average_execution_time :model/Query :query_hash query-hash))

(defn backfill-query-and-average-execution-time!
  "Set the query text and average execution time of the query with `query-hash` if its text was never stored."
  [query-hash query-json average-expr]
  (t2/update! :model/Query
              {:query_hash query-hash, :query nil}
              {:query                  query-json
               :average_execution_time average-expr}))

(defn update-average-execution-time!
  "Set the average execution time of the query with `query-hash`."
  [query-hash average-expr]
  (t2/update! :model/Query {:query_hash query-hash} {:average_execution_time average-expr}))

(defn update-average-execution-times!
  "Set the average execution time of the queries with `query-hashes` to the SQL expression `average-expr`."
  [average-expr query-hashes]
  (t2/query {:update (t2/table-name :model/Query)
             :set    {:average_execution_time average-expr}
             :where  [:in :query_hash query-hashes]}))

(defn insert-queries!
  "Insert the Query `rows`."
  [rows]
  (t2/insert! :model/Query rows))

(defn query-hash-statuses-reducible
  "Reducible rows of `:query_hash` and `:missing_query` for the Query rows with `query-hashes`."
  [query-hashes]
  (t2/reducible-query {:select [:query_hash [[:= :query nil] :missing_query]]
                       :from   [(t2/table-name :model/Query)]
                       :where  [:in :query_hash query-hashes]}))

;;; ---------------------------------------------- StoredResult ----------------------------------------------

(defn stored-result-ids-used-by-cards
  "The subset of `stored-result-ids` used by one of the Cards with `card-ids`."
  [card-ids stored-result-ids]
  (t2/select-fn-set :stored_result_id :model/StoredResultUse
                    :card_id [:in card-ids]
                    :stored_result_id [:in stored-result-ids]))

(defn insert-stored-result-use!
  "Record that the Card with `card-id` uses the StoredResult with `stored-result-id`."
  [stored-result-id card-id]
  (t2/insert! :model/StoredResultUse {:stored_result_id stored-result-id
                                      :card_id          card-id}))

(defn stored-results-for-card
  "The StoredResults used by the Card with `card-id`."
  [card-id]
  (t2/select :model/StoredResult
             :id [:in ^:allow-subquery {:select [:stored_result_id]
                                        :from   [:stored_result_use]
                                        :where  [:= :card_id card-id]}]))
