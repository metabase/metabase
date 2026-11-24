(ns metabase.queries.db
  "Application database queries for the queries module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration
  methods."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.collections.listing :as collections.listing]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.collections.schema :as collections.schema]
   [metabase.embedding.settings :as embed.settings]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.queries.card-schema :as queries.card-schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor.schema]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.remote-sync.schema :as remote-sync.schema]
   [metabase.revisions.sql :as revisions.sql]
   [metabase.settings.core :as setting]
   [metabase.staleness.core :as staleness]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; ------------------------------------------------ Cards ------------------------------------------------

(mu/defn synced-cards-clause :- [:fn vector?]
  "The clause over the Card table aliased `alias` selecting the Cards remote sync syncs."
  [alias :- :keyword
   opts  :- ::remote-sync.schema/synced-filter-opts]
  [:and
   (when-not (:include-archived? opts)
     [:= (u/qualified-key alias :archived) false])
   (remote-sync/synced-fk-clause alias :collection_id :model/Collection opts)])

(mu/defn card
  "The Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one :model/Card :id card-id))

(mu/defn cards
  "The Cards with `card-ids` (nil entries, e.g. from virtual dashcards, are ignored)."
  [card-ids :- [:maybe [:or [:set [:maybe ::lib.schema.id/card]] [:sequential [:maybe ::lib.schema.id/card]]]]]
  (mdb/select-batched #(t2/select :model/Card :id [:in %]) card-ids))

(mu/defn cards-by-ids
  "The Cards with `card-ids`, by id."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn identity :model/Card :id [:in %]) card-ids))

(mu/defn timelines
  "The Timelines with `timeline-ids`; ids of deleted Timelines are skipped."
  [timeline-ids :- [:set ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/Timeline :id [:in %]) timeline-ids))

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

(mu/defn card-document-id
  "The `:document_id` of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :document_id :model/Card :id card-id))

(mu/defn card-document-ids
  "The `:document_id` of each of the Cards with `card-ids`, by Card id."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :document_id [:model/Card :id :document_id] :id [:in %]) card-ids))

(mu/defn card-parameters
  "The `:parameters` of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :parameters [:model/Card :parameters] :id card-id))

(mu/defn card-parameters-for-cards
  "The id, `:parameters`, and `:embedding_params` of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select [:model/Card :id :parameters :embedding_params] :id [:in card-ids]))

(mu/defn cards-parameters
  "A map of ID to `:parameters` for the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :parameters [:model/Card :id :parameters] :id [:in %]) card-ids))

(mu/defn raw-card-dimensions
  "The raw `:dimensions` row of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/query-one {:select [:dimensions]
                 :from   [:report_card]
                 :where  [:= :id card-id]}))

(mu/defn card-ids-with-raw-dimensions :- [:set ::lib.schema.id/card]
  "The ids of those of the Cards with `card-ids` whose raw `:dimensions` are set."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (into #{}
        (map :id)
        (mdb/select-batched #(t2/query {:select [:id]
                                        :from   [:report_card]
                                        :where  [:and
                                                 [:in :id [:auto/param %]]
                                                 [:not= :dimensions nil]]})
                            card-ids)))

(mu/defn card-database-and-table-ids
  "The database and primary table IDs of the Card with `card-id`, as `:database-id` and `:table-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card [:database_id :database-id] [:table_id :table-id]] :id card-id))

(mu/defn cards-table-ids
  "The `:id`, `:table_id` and `:database_id` of each of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select [:model/Card :id :table_id :database_id] :id [:in %]) card-ids))

(mu/defn card-schema-versions
  "The stored `:card_schema` of each of the Cards with `card-ids`, by id."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched-map #(t2/select-pk->fn :card_schema [:model/Card :id :card_schema] :id [:in %]) card-ids))

(mu/defn cards-queries-info
  "The IDs and query-related fields of the Cards with `card-ids`.

  Accepts optional kv-args:
  - `:include` a seq of extra columns to select."
  [card-ids :- [:seqable ::lib.schema.id/card]
   & {:keys [include]} :- [:maybe [:map {:closed true}
                                   [:include {:optional true} [:seqable :keyword]]]]]
  (mdb/select-batched #(t2/select (queries.card-schema/selection include) :id [:in %]) card-ids))

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
  (mdb/select-batched #(t2/select [:model/Card :id :source_card_id] :source_card_id [:in %]) source-card-ids))

(mu/defn metric-cards-for-source-cards
  "The unarchived metric Cards built on one of `source-card-ids`, ordered by name."
  [source-card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select :model/Card
             :source_card_id [:in source-card-ids]
             :archived false
             :type :metric
             {:order-by [[:name :asc]]}))

(mu/defn document-collection-and-exploration
  "The Document with `document-id` narrowed to `:id`, `:collection_id` and `:exploration_id`, or nil."
  [document-id :- ms/PositiveInt]
  (t2/select-one [:model/Document :id :collection_id :exploration_id] :id document-id))

(mu/defn documents-collection-and-exploration
  "The Documents with `document-ids` narrowed to `:id`, `:collection_id` and `:exploration_id`."
  [document-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select [:model/Document :id :collection_id :exploration_id] :id [:in %]) document-ids))

(mu/defn explorations
  "The Explorations with `exploration-ids`."
  [exploration-ids :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/Exploration :id [:in %]) exploration-ids))

(mu/defn document-card-ids
  "The IDs of the Cards that belong to the Document with `document-id`."
  [document-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Card :document_id document-id))

(mu/defn insert-cards!
  "Insert the Card `rows` with one statement for each set of columns they have and return the new instances, in the
  order of `rows`."
  [rows :- [:sequential ::queries.schema/card.create]]
  (mdb/insert-returning-instances! :model/Card rows))

(mu/defn update-cards! :- :nil
  "Apply each of `updates`, the `:id` of a Card and the columns to change, with one statement for each set of columns
  that rows have in common."
  [updates :- [:sequential :map]]
  (mdb/update-grouped! :model/Card updates)
  nil)

(mu/defn dashboards-for-placement
  "The ID, `archived` flag and Collection ID of each of the Dashboards with `dashboard-ids`, by ID."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (u/index-by :id (mdb/select-batched #(t2/select [:model/Dashboard :id :archived :collection_id] :id [:in %]) dashboard-ids)))

(mu/defn archived-document-ids
  "The IDs among `document-ids` of the Documents that are archived."
  [document-ids :- [:set ms/PositiveInt]]
  (if (seq document-ids)
    (mdb/select-batched-set #(t2/select-pks-set :model/Document :id [:in %] :archived true) document-ids)
    #{}))

;;; ------------------------------------------- Card statistics -------------------------------------------

(mu/defn dashcard-counts-by-card
  "Rows of `:card_id` and `:count` of DashboardCards each of `card-ids` appears on, directly or as a series."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/query {:select   [[:%count.* :count] :card_id]
                                  :from     [[^:allow-subquery {:union-all [^:allow-subquery {:select [:card_id]
                                                                                              :from   [:report_dashboardcard]
                                                                                              :where  [:in :card_id %]}
                                                                            ^:allow-subquery {:select [:card_id]
                                                                                              :from   [:dashboardcard_series]
                                                                                              :where  [:in :card_id %]}]}
                                              :placements]]
                                  :group-by [:card_id]})
                      card-ids))

(mu/defn parameter-card-counts-by-card
  "Rows of `:card_id` and `:count` of ParameterCards for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/query {:select   [[:%count.* :count] :card_id]
                                  :from     [:parameter_card]
                                  :where    [:in :card_id %]
                                  :group-by [:card_id]})
                      card-ids))

(mu/defn average-running-times-by-card
  "Rows of `:card_id` and average `:running_time` of uncached executions for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/query {:select   [[:%avg.running_time :running_time] :card_id]
                                  :from     [:query_execution]
                                  :where    [:and
                                             [:not= :running_time nil]
                                             [:not= :cache_hit true]
                                             [:in :card_id %]]
                                  :group-by [:card_id]})
                      card-ids))

(mu/defn last-query-starts-by-card
  "Rows of `:card_id` and latest `:started_at` of uncached executions for each of `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/query {:select   [[:%max.started_at :started_at] :card_id]
                                  :from     [:query_execution]
                                  :where    [:and
                                             [:not= :running_time nil]
                                             [:not= :cache_hit true]
                                             [:in :card_id %]]
                                  :group-by [:card_id]})
                      card-ids))

(mu/defn dashboards-for-cards
  "Rows of `:card_id` plus Dashboard columns for every Dashboard each of `card-ids` appears on, directly or as a series."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/query {:union-all [^:allow-subquery {:nest
                                                                ^:allow-subquery {:select   [[:dc.card_id :card_id]
                                                                                             :d.name
                                                                                             :d.collection_id
                                                                                             :d.description
                                                                                             :d.id
                                                                                             :d.archived
                                                                                             :d.enable_embedding]
                                                                                  :from     [[:report_dashboardcard :dc]]
                                                                                  :join     [[:report_dashboard :d] [:= :dc.dashboard_id :d.id]]
                                                                                  :where    [:in :dc.card_id %]
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
                                                                                  :where    [:in :dcs.card_id %]
                                                                                  :order-by [[:d.id :asc]]}}]})
                      card-ids))

;;; ------------------------------------------- Related models --------------------------------------------

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:set ::lib.schema.id/database]]
  (mdb/select-batched #(t2/select :model/Database :id [:in %]) database-ids))

(mu/defn database-name
  "The name of the Database with `database-id`."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one-fn :name :model/Database :id database-id))

(mu/defn field-database-info-for-ids
  "The id, name, table name, and Database id of the Fields with `field-ids`."
  [field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched #(t2/query {:select    [[:field.id :field-id]
                                              [:field.name :field-name]
                                              [:table.name :table-name]
                                              [:table.db_id :field-db-id]]
                                  :from      [[:metabase_field :field]]
                                  :left-join [[(t2/table-name :model/Table) :table]
                                              [:= :field.table_id :table.id]]
                                  :where     [:in :field.id %]})
                      field-ids))

(mu/defn field-id->table-id :- [:map-of ::lib.schema.id/field ::lib.schema.id/table]
  "Map of the ID of each Field with `field-ids` to its Table ID."
  [field-ids :- [:set ::lib.schema.id/field]]
  (mdb/select-batched-map #(t2/select-pk->fn :table_id :model/Field :id [:in %]) field-ids))

(mu/defn snippets
  "The NativeQuerySnippets with `snippet-ids`."
  [snippet-ids :- [:set ::lib.schema.id/native-query-snippet]]
  (mdb/select-batched #(t2/select :model/NativeQuerySnippet :id [:in %]) snippet-ids))

(mu/defn dashboards
  "The Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:set ::lib.schema.id/dashboard]]
  (mdb/select-batched #(t2/select :model/Dashboard :id [:in %]) dashboard-ids))

(mu/defn dashboard-archived?
  "Whether the Dashboard with `dashboard-id` is archived."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/exists? :model/Dashboard :id dashboard-id :archived true))

(mu/defn dashboard-collection-id
  "The `:collection_id` of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :collection_id [:model/Dashboard :collection_id] :id dashboard-id))

(mu/defn dashboard-parameters
  "The `:parameters` of the Dashboard with `dashboard-id`."
  [dashboard-id :- ::lib.schema.id/dashboard]
  (t2/select-one-fn :parameters [:model/Dashboard :parameters] :id dashboard-id))

(mu/defn dashboards-parameters
  "A map of ID to `:parameters` for the Dashboards with `dashboard-ids`."
  [dashboard-ids :- [:sequential ::lib.schema.id/dashboard]]
  (mdb/select-batched-map #(t2/select-pk->fn :parameters [:model/Dashboard :id :parameters] :id [:in %]) dashboard-ids))

(mu/defn dashcards-for-card
  "The DashboardCards showing the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/DashboardCard :card_id card-id))

(mu/defn dashcards-for-cards
  "The DashboardCards showing the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/DashboardCard :card_id [:in %]) card-ids))

(mu/defn dashcard-series-for-cards
  "The `:id`, `:card_id` and `:dashboard_id` of each DashboardCardSeries showing one of the Cards with `card-ids`, with
  the Dashboard of the DashboardCard it belongs to."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/query {:select [[:dcs.id :id] [:dcs.card_id :card_id] [:dc.dashboard_id :dashboard_id]]
                                  :from   [[:dashboardcard_series :dcs]]
                                  :join   [[:report_dashboardcard :dc] [:= :dc.id :dcs.dashboardcard_id]]
                                  :where  [:in :dcs.card_id [:auto/param %]]})
                      card-ids))

(mu/defn implicit-action-ids-for-model
  "The IDs of the implicit Actions of the model Card with `model-id`."
  [model-id :- ms/PositiveInt]
  (t2/select-pks-set :model/Action {:select [:action.id]
                                    :from   [:action]
                                    :join   [:implicit_action [:= :action.id :implicit_action.action_id]]
                                    :where  [:= :action.model_id model-id]}))

(mu/defn implicit-action-ids-for-models
  "The IDs of the implicit Actions of the model Cards with `model-ids`."
  [model-ids :- [:sequential ::lib.schema.id/card]]
  (if (seq model-ids)
    (mdb/select-batched-set #(t2/select-pks-set :model/Action {:select [:action.id]
                                                               :from   [:action]
                                                               :join   [:implicit_action [:= :action.id :implicit_action.action_id]]
                                                               :where  [:in :action.model_id %]}) model-ids)
    #{}))

(mu/defn card-notification-ids-for-cards
  "The IDs of the card Notifications attached to the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (if (seq card-ids)
    (mdb/select-batched-set #(t2/select-pks-set :model/Notification
                                                :payload_type :notification/card
                                                :payload_id [:in ^:allow-subquery {:select [:id]
                                                                                   :from   [:notification_card]
                                                                                   :where  [:in :card_id %]}]) card-ids)
    #{}))

(mu/defn parameter-cards-for-card
  "The ParameterCards drawing values from the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select :model/ParameterCard :card_id card-id))

(mu/defn parameter-cards-for-cards
  "The ParameterCards drawing values from the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/select-batched #(t2/select :model/ParameterCard :card_id [:in %]) card-ids))

(mu/defn parameter-card-card-ids
  "The set of Card IDs the parameters of the given parameterized object draw values from."
  [object-type :- [:or :keyword :string]
   object-id   :- ms/PositiveInt]
  (t2/select-fn-set :card_id :model/ParameterCard
                    :parameterized_object_type object-type
                    :parameterized_object_id object-id))

(mu/defn parameter-cards-for-objects
  "The ParameterCards of the parameterized objects of `object-type` with `object-ids`."
  [object-type :- [:or :keyword :string]
   object-ids  :- [:sequential ms/PositiveInt]]
  (mdb/select-batched #(t2/select :model/ParameterCard
                                  :parameterized_object_type object-type
                                  :parameterized_object_id [:in %])
                      object-ids))

(mu/defn insert-parameter-cards!
  "Insert `parameter-cards` in one statement, returning the number inserted."
  [parameter-cards :- [:sequential ::queries.schema/parameter-card.create]]
  (t2/insert! :model/ParameterCard parameter-cards))

(mu/defn set-parameter-cards-card-id!
  "Point the ParameterCards with `parameter-card-ids` at `card-id`, returning the number updated."
  [parameter-card-ids :- [:sequential ms/PositiveInt]
   card-id            :- ::lib.schema.id/card]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/ParameterCard :id [:in %] {:card_id card-id}) parameter-card-ids))

(mu/defn delete-parameter-cards-by-id!
  "Delete the ParameterCards with `parameter-card-ids`, returning the number deleted."
  [parameter-card-ids :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/ParameterCard :id [:in %]) parameter-card-ids))

(mu/defn delete-parameter-cards-for-cards!
  "Delete the ParameterCards drawing values from the Cards with `card-ids`, returning the number deleted."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/ParameterCard :card_id [:in %]) card-ids))

(mu/defn delete-parameter-cards-for-objects!
  "Delete every ParameterCard of the parameterized objects of `object-type` with `object-ids`, returning the number
  deleted."
  [object-type :- [:or :keyword :string]
   object-ids  :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/ParameterCard
                                                          :parameterized_object_type object-type
                                                          :parameterized_object_id [:in %]) object-ids))

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

(mu/defn backfill-queries-and-average-execution-times!
  "Set the query text of each Query identified by the `[query-hash query-json c0 c1]` entries of `entries`, and its
  average execution time to `c0 * average_execution_time + c1`, rounded and cast to an integer, in one statement per
  partition of entries."
  [entries :- [:sequential {:min 1} [:tuple bytes? :string number? number?]]]
  (run! #(t2/query {:update (t2/table-name :model/Query)
                    :set    {:query                  (into [:case]
                                                           (mapcat (fn [[query-hash query-json]]
                                                                     [[:= :query_hash query-hash] query-json]))
                                                           %)
                             :average_execution_time (into [:case]
                                                           (mapcat (fn [[query-hash _query-json c0 c1]]
                                                                     [[:= :query_hash query-hash] (rolling-average-expr c0 c1)]))
                                                           %)}
                    :where  [:in :query_hash (map first %)]})
        (partition-all mdb/update-partition-size entries)))

(mu/defn update-average-execution-times!
  "Set the average execution time of each Query identified by the `[query-hash c0 c1]` triples in `hash+coefficients`
  to `c0 * average_execution_time + c1`, rounded and cast to an integer."
  [hash+coefficients :- [:sequential [:tuple bytes? number? number?]]]
  (run! #(t2/query {:update (t2/table-name :model/Query)
                    :set    {:average_execution_time (into [:case]
                                                           (mapcat (fn [[query-hash c0 c1]]
                                                                     [[:= :query_hash query-hash] (rolling-average-expr c0 c1)]))
                                                           %)}
                    :where  [:in :query_hash (map first %)]})
        (partition-all mdb/update-partition-size hash+coefficients)))

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
  (mdb/select-batched-reducible #(t2/reducible-query {:select [:query_hash [[:= :query nil] :missing_query]]
                                                      :from   [(t2/table-name :model/Query)]
                                                      :where  [:in :query_hash %]}) query-hashes))

;;; ---------------------------------------------- StoredResult ----------------------------------------------

(mu/defn stored-result-ids-used-by-cards
  "The subset of `stored-result-ids` used by one of the Cards with `card-ids`."
  [card-ids          :- [:set ::lib.schema.id/card]
   stored-result-ids :- [:set ms/PositiveInt]]
  (mdb/select-batched-set (fn [card-ids]
                            (mdb/select-batched #(t2/select-fn-set :stored_result_id :model/StoredResultUse
                                                                   :card_id [:in card-ids]
                                                                   :stored_result_id [:in %])
                                                stored-result-ids)) card-ids))

(mu/defn insert-stored-result-uses!
  "Insert the StoredResultUse `rows` and return their ids, in the order of `rows`."
  [rows :- [:sequential ::queries.schema/stored-result-use.create]]
  (u/map-by-key-set #(t2/insert-returning-pks! :model/StoredResultUse %) rows))

(mu/defn insert-stored-results!
  "Insert the StoredResult `rows` and return their ids, in the order of `rows`."
  [rows :- [:sequential ::queries.schema/stored-result.create]]
  (u/map-by-key-set #(t2/insert-returning-pks! :model/StoredResult %) rows))

(mu/defn delete-stored-results!
  "Delete the StoredResults with `stored-result-ids`, returning the number deleted."
  [stored-result-ids :- [:sequential ms/PositiveInt]]
  (mdb/sum-batched mdb/delete-partition-size #(t2/delete! :model/StoredResult :id [:in %]) stored-result-ids))

(mu/defn insert-query-executions!
  "Insert the QueryExecution `rows` with one statement for each set of columns they have, in a transaction of their own
  so that a row the app DB rejects rolls back to a savepoint, and return their ids in the order of `rows`."
  [rows :- [:sequential ::queries.schema/query-execution.create]]
  (t2/with-transaction [_conn]
    (u/map-by-key-set #(t2/insert-returning-pks! :model/QueryExecution %) rows)))

(mu/defn stored-result-gate-inputs-for-card
  "The StoredResults used by the Card with `card-id`, narrowed to the columns the cached-result gate reads."
  [card-id :- ::lib.schema.id/card]
  (t2/select [:model/StoredResult
              :id
              :database_id
              :dataset_query
              :data_access_token
              :resolved_source_ids]
             :id [:in ^:allow-subquery {:select [:stored_result_id]
                                        :from   [:stored_result_use]
                                        :where  [:= :card_id card-id]}]))

(mu/defn stored-result-gate-inputs-for-cards :- [:map-of ::lib.schema.id/card [:sequential :map]]
  "The StoredResults used by each of the Cards with `card-ids`, narrowed to the columns the cached-result gate reads,
  by Card id."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (into {}
        (map (fn [[card-id rows]] [card-id (mapv #(dissoc % :card_id) rows)]))
        (group-by :card_id
                  (mdb/select-batched #(t2/select [:model/StoredResult
                                                   :stored_result.id
                                                   :stored_result.database_id
                                                   :stored_result.dataset_query
                                                   :stored_result.data_access_token
                                                   :stored_result.resolved_source_ids
                                                   [:stored_result_use.card_id :card_id]]
                                                  {:join  [:stored_result_use [:= :stored_result_use.stored_result_id :stored_result.id]]
                                                   :where [:in :stored_result_use.card_id [:auto/param %]]})
                                      card-ids))))

(mu/defn synced-card-items :- [:sequential ::queries.schema/card]
  "The Cards with `ids`, with their Collection and its ancestors, as remote sync lists them."
  [ids :- [:sequential pos-int?]]
  (let [root (collection.root/hydrated-root-collection)]
    (-> (mdb/select-batched #(t2/select [:model/Card :id :name :collection_id] :id [:in %]) ids)
        (t2/hydrate [:collection :effective_ancestors])
        (->> (mapv #(collection.root/hydrate-root-collection % root))))))

(mu/defn stale-card-candidates :- ::staleness/query
  "The query of the Cards that are stale for `opts`, `{:collection-ids (:all | #{int|nil}), :cutoff-date local-date}`."
  [opts :- ::staleness/candidates-options]
  ^:allow-subquery {:select [:report_card.id
                             [(h2x/literal "Card") :model]
                             [:report_card.name :name]
                             :last_used_at
                             :report_card.collection_id]
                    :from :report_card
                    :left-join [:moderation_review [:and
                                                    [:= :moderation_review.moderated_item_id :report_card.id]
                                                    [:= :moderation_review.moderated_item_type (h2x/literal "card")]
                                                    [:= :moderation_review.most_recent true]
                                                    [:= :moderation_review.status (h2x/literal "verified")]]
                                :pulse_card [:= :pulse_card.card_id :report_card.id]
                                :pulse [:and
                                        [:= :pulse_card.pulse_id :pulse.id]
                                        [:= :pulse.archived false]]
                                :sandboxes [:= :sandboxes.card_id :report_card.id]
                                :collection [:= :collection.id :report_card.collection_id]]
                    :where [:and
                            [:= :sandboxes.id nil]
                            [:= :pulse.id nil]
                            [:= :moderation_review.id nil]
                            [:= :report_card.archived false]
                            [:<= :report_card.last_used_at (:cutoff-date opts)]
                            [:= :collection.type nil]
                            (when (embed.settings/some-embedding-enabled?)
                              [:= :report_card.enable_embedding false])
                            (when (setting/get :enable-public-sharing)
                              [:= :report_card.public_uuid nil])
                            (staleness/collection-filter :report_card.collection_id opts)]})

(mu/defn stale-card-items
  "The listing columns of the Cards with `card-ids`, with the hydrations the stale content page shows. `:type` is read
  to label each Card, and the columns after it are there for the Card schema upgrade, not for the listing."
  [card-ids :- [:set ::lib.schema.id/card]]
  (-> (mdb/select-batched
       (fn [card-ids]
         (t2/select [:model/Card
                     :id
                     :dashboard_id
                     :description
                     :collection_id
                     :name
                     :entity_id
                     :archived
                     :collection_position
                     :display
                     :database_id
                     [nil :location]
                     :dataset_query
                     :card_schema
                     :type
                     :entity_id
                     :result_metadata
                     :dimensions
                     :dimension_mappings
                     :last_used_at
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
       card-ids)
      (t2/hydrate :can_write :can_delete :can_restore [:collection :effective_location] :dashboard_count
                  [:dashboard :moderation_status])))

(mu/defn dependency-card-items :- [:maybe :map]
  "The query of the Cards the dependencies lists hold for `opts`, as `entity_id`, `name` and `location`: in the
  collections the user reads, of the `:card-types`, without the internal ones unless `:include-internal?` and those in
  personal collections unless `:include-personal-collections?`, located by their dashboard, document or collection."
  [{:keys [include-archived include-personal-collections? include-internal? card-types] :as opts}
   :- :metabase.dependencies.items/items-opts]
  (let [location [:case
                  [:not= :card.dashboard_id nil] :dashboard.name
                  [:not= :card.document_id nil]  :document.name
                  :else                          (collections.listing/collection-location :collection nil)]]
    {:select    [[:card.id :entity_id] [:card.name :name] [location :location]]
     :from      [[:report_card :card]]
     :left-join [:collection                  [:= :card.collection_id :collection.id]
                 [:report_dashboard :dashboard] [:= :card.dashboard_id :dashboard.id]
                 :document                    [:= :card.document_id :document.id]]
     :where     (into [:and]
                      (remove nil?)
                      [(collections.listing/visible-in-collections-clause :card opts include-archived nil)
                       (collections.listing/archived-clause :card include-archived)
                       (when (seq card-types)
                         [:in :card.type (mapv name card-types)])
                       (when-not include-internal?
                         (mi/non-internal-filter-clause :model/Card :card))
                       (when-not include-personal-collections?
                         (collections.listing/outside-personal-collections-clause :card :collection))])}))

(defn- collection-card-items
  "The query of the Cards of `card-type`, `:question`, `:model` or `:metric`, in `collection` that the collection items
  listing of `opts` holds."
  [card-type collection {:keys [archived? pinned-state show-dashboard-questions? created-by-id]}]
  {:select    (cond-> [:c.id :c.name :c.description :c.entity_id :c.collection_position :c.display
                       :dashboard_id
                       :last_used_at
                       :c.collection_id
                       :c.archived_directly
                       :c.archived
                       :c.dataset_query
                       [(h2x/literal (case card-type
                                       :model "dataset"
                                       :metric  "metric"
                                       "card"))
                        :model]
                       [:u.id :last_edit_user]
                       [:u.email :last_edit_email]
                       [:u.first_name :last_edit_first_name]
                       [:u.last_name :last_edit_last_name]
                       [:r.timestamp :last_edit_timestamp]
                       [:mr.status :moderated_status]]
                (#{:question :model} card-type) (conj :c.database_id)
                (= :model card-type)            (conj :c.table_id :t.is_upload :c.query_type))
   :from      [[:report_card :c]]
   :left-join (cond-> [[:revision :r] [:and
                                       [:= :r.model_id :c.id]
                                       [:= :r.model (h2x/literal "Card")]
                                       (revisions.sql/newest-revision-clause :r "Card" :c.id)]
                       [:moderation_review :mr] [:and
                                                 [:= :mr.moderated_item_id :c.id]
                                                 [:= :mr.most_recent true]
                                                 [:= :mr.moderated_item_type (h2x/literal "card")]]
                       [:core_user :u] [:= :u.id :r.user_id]]
                (= :model card-type) (conj [:metabase_table :t] [:= :t.id :c.table_id]))
   :where     [:and
               (collections.listing/visible-items-clause :c.collection_id archived? {:root-namespace nil})
               (if (collection/is-trash? collection)
                 [:= :c.archived_directly true]
                 [:and
                  [:= :c.collection_id (:id collection)]
                  [:= :c.archived_directly false]])
               (when-not show-dashboard-questions?
                 [:= :c.dashboard_id nil])
               [:= :c.document_id nil]
               (when created-by-id
                 [:= :c.creator_id created-by-id])
               [:= :c.archived (boolean archived?)]
               (case card-type
                 :model
                 [:= :c.type (h2x/literal "model")]

                 :metric
                 [:= :c.type (h2x/literal "metric")]

                 [:= :c.type (h2x/literal "question")])
               (collections.listing/pinned-state->clause pinned-state)]})

(mu/defn collection-question-items :- :map
  "The query of the saved questions in `collection` that the collection items listing of `opts` holds."
  [collection :- :map
   opts       :- :map]
  (collection-card-items :question collection opts))

(mu/defn collection-model-items :- :map
  "The query of the models in `collection` that the collection items listing of `opts` holds."
  [collection :- :map
   opts       :- :map]
  (collection-card-items :model collection opts))

(mu/defn collection-metric-items :- :map
  "The query of the metrics in `collection` that the collection items listing of `opts` holds."
  [collection :- :map
   opts       :- :map]
  (collection-card-items :metric collection opts))

(mu/defn recent-view-cards
  "The Cards with `card-ids` with their Dashboard, Collection, and moderation status."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/hydrate
   (mdb/select-batched
    (fn [card-ids]
      (t2/select :model/Card
                 {:select [:card.name
                           :card.description
                           :card.archived
                           :card.id
                           :card.database_id
                           :card.display
                           :card.card_schema
                           ;; required alongside :card_schema for the Card schema upgrade
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
                  :from [[:report_card :card]]
                  :where [:in :card.id card-ids]
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
    card-ids)
   :can_read :can_write))

(mu/defn card-ids-for-databases-reducible
  "A reducible of the `:id`s of the Cards of the Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (mdb/select-batched-reducible #(t2/reducible-query {:from   [(t2/table-name :model/Card)]
                                                      :select [:id]
                                                      :where  [:in :database_id %]}) database-ids))

;; The ids come from an earlier, unlocked scan, so keeping `database_id` in the predicate spares a card that moved to
;; another database in between.
(mu/defn delete-cards-for-databases! :- :int
  "Delete the Cards with `card-ids` that still belong to one of the Databases with `database-ids`, returning the number
  deleted."
  [database-ids :- [:sequential ::lib.schema.id/database]
   card-ids     :- [:sequential ::lib.schema.id/card]]
  ;; Only a Database delete calls this. The change log's delete hook already logs what that delete cascades to.
  #_{:clj-kondo/ignore [:metabase/change-log-raw-write]}
  (mdb/sum-batched mdb/delete-partition-size #(first (t2/query {:delete-from (t2/table-name :model/Card)
                                                                :where       [:and
                                                                              [:in :database_id database-ids]
                                                                              [:in :id %]]})) card-ids))

(mu/defn existing-card-ids :- [:set ::lib.schema.id/card]
  "The ids among `card-ids` that still name a Card."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (into #{}
        (map :id)
        (mdb/select-batched #(t2/query {:select [:id]
                                        :from   [(t2/table-name :model/Card)]
                                        :where  [:in :id %]})
                            card-ids)))

;;; ------------------------------------------------ Card stamps ------------------------------------------------

(def ^:private Temporal
  "A `java.time` instant, date, or date-time."
  [:fn #(instance? java.time.temporal.Temporal %)])

(mu/defn update-cards-last-used-at!
  "Move `last_used_at` of each Card in `card-id->timestamp` forward to its timestamp, without touching `updated_at`."
  [card-id->timestamp :- [:map-of ::lib.schema.id/card Temporal]]
  #_{:clj-kondo/ignore [:metabase/change-log-raw-write]} ; the change log leaves out usage stats
  (run! (fn [entries]
          (t2/query {:update [(t2/table-name :model/Card)]
                     :where  [:in :id (map first entries)]
                     :set    {:last_used_at (into [:case]
                                                  (mapcat (fn [[id timestamp]]
                                                            [[:= :id id] [:greatest [:coalesce :last_used_at (t/offset-date-time 0)] timestamp]])
                                                          entries))
                              :updated_at :updated_at}}))
        (partition-all mdb/update-partition-size card-id->timestamp)))

(mu/defn set-card-last-used-at!
  "Set `last_used_at` of the Card with `card-id`, returning the number updated."
  [card-id      :- ::lib.schema.id/card
   last-used-at :- ms/TemporalInstant]
  (t2/update! :model/Card :id card-id {:last_used_at last-used-at}))

(mu/defn shift-card-positions! :- :int
  "Add or subtract one from the `collection_position` of the Cards in the Collection with `collection-id` whose position is
  in `positions`, `{:from n :to m}` with either bound left out, as `direction` says, returning the number updated."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   positions     :- ::collections.schema/positions
   direction     :- ::collections.schema/position-direction]
  (t2/update! :model/Card {:collection_id       collection-id
                           :collection_position (collection/position-clause positions)}
              {:collection_position [direction :collection_position 1]}))

(mu/defn cards-at-positions
  "The Cards in the Collection with `collection-id` whose `collection_position` is in `positions`, `{:from n :to m}` with
  either bound left out."
  [collection-id :- [:maybe ::lib.schema.id/collection]
   positions     :- ::collections.schema/positions]
  (t2/select :model/Card :collection_id collection-id :collection_position (collection/position-clause positions)))

(mu/defn positioned-cards-in-collections :- [:sequential [:map {:closed true}
                                                          [:id                  ms/PositiveInt]
                                                          [:collection_id       [:maybe ms/PositiveInt]]
                                                          [:collection_position ms/PositiveInt]]]
  "The `:id`, `:collection_id` and `:collection_position` of the Cards that have a position in the Collections with
  `collection-ids`, nil for the root."
  [collection-ids :- [:sequential [:maybe ::lib.schema.id/collection]]]
  (let [select-positioned #(t2/select [:model/Card :id :collection_id :collection_position]
                                      {:where [:and [:not= :collection_position nil] (collection/collection-ids-clause %)]})]
    (if (seq collection-ids)
      (mdb/select-batched select-positioned collection-ids)
      (select-positioned []))))

(mu/defn set-cards-cache-invalidated-at!
  "Set `cache_invalidated_at` of the Cards with `card-ids` to `invalidated-at`, returning the number updated."
  [card-ids       :- [:sequential ::lib.schema.id/card]
   invalidated-at :- ms/TemporalInstant]
  (mdb/sum-batched mdb/update-partition-size #(t2/update! :model/Card :id [:in %] {:cache_invalidated_at invalidated-at}) card-ids))

(mu/defn set-card-metabot-chart!
  "Set the MetabotConversation and chart the Card with `card-id` was saved from, with a statement against its table
  that publishes no event, returning the number updated."
  [card-id         :- ::lib.schema.id/card
   conversation-id :- :string
   chart-id        :- :string]
  #_{:clj-kondo/ignore [:metabase/change-log-raw-write]} ; the caller logs the row first
  (t2/update! (t2/table-name :model/Card) :id card-id {:metabot_conversation_id conversation-id
                                                       :metabot_chart_id        chart-id}))

(mu/defn delete-query-executions-before!
  "Delete up to `batch-size` of the QueryExecutions whose `time-column` is at or before `cutoff`, returning the number
  deleted."
  [time-column :- :keyword
   cutoff      :- ms/TemporalInstant
   batch-size  :- ms/PositiveInt]
  (mdb/delete-oldest-rows! :model/QueryExecution time-column cutoff batch-size))
