(ns metabase.warehouses-rest.db
  "Application database queries for the warehouses REST module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for hydration."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn database-engines
  "The id and engine of every Database."
  []
  (t2/select [:model/Database :id :engine]))

(mu/defn source-query-cards-reducible
  "A reducible of the Cards of `card-type` (also including \"metric\" Cards) in the Databases with `database-ids`
  visible to the current user that can be used as source queries, with their moderation status, in case-insensitive
  name order. `collection-scope` further restricts by collection: `nil` applies no collection restriction, `:root`
  restricts to Cards with no collection, and a collection of ids restricts to Cards in those collections."
  [card-type        :- [:or :keyword :string]
   database-ids     :- [:set ::lib.schema.id/database]
   collection-scope :- [:maybe [:or [:= :root] [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]]
  ;; Rows are pushed through `mi/do-after-select :model/Card` by the caller, so `:dataset_query` and
  ;; `:result_metadata` drag in the rest of [[metabase.queries.card-schema/schema-upgrade-triggers]].
  (t2/reducible-query {:select   [:name :description :database_id :dataset_query :id :collection_id
                                  :result_metadata :type :source_card_id :card_schema :entity_id
                                  :dimensions :dimension_mappings
                                  [^:allow-subquery {:select   [:status]
                                                     :from     [:moderation_review]
                                                     :where    [:and
                                                                [:= :moderated_item_type "card"]
                                                                [:= :moderated_item_id :report_card.id]
                                                                [:= :most_recent true]]
                                                     :order-by [[:id :desc]]
                                                     :limit    1}
                                   :moderated_status]]
                       :from     [:report_card]
                       :where    [:and
                                  [:not= :result_metadata nil]
                                  [:= :archived false]
                                  [:in :type [(u/qualified-name card-type) "metric"]]
                                  [:in :database_id database-ids]
                                  (cond
                                    (nil? collection-scope)          nil
                                    (= collection-scope :root)       [:= :collection_id nil]
                                    :else                            [:in :collection_id collection-scope])
                                  (collection/visible-collection-filter-clause)]
                       :order-by [[:%lower.name :asc]]}))

(mu/defn databases-where
  "The Databases visible to the user with `user-id` (`is-superuser?`/`is-data-analyst?` further widen visibility), in
  name then engine order. Excludes stub Databases unless `include-stubs?` and the audit Database unless
  `include-analytics?`. Restricted to Databases routed from `router-database-id` when given, otherwise to non-routed
  Databases. When `filter-by-data-access?` is true, further restricted to Databases the user can query, manage, or edit
  the metadata of."
  [user-id                :- ::lib.schema.id/user
   is-superuser?          :- :boolean
   is-data-analyst?       :- :boolean
   filter-by-data-access? :- :boolean
   router-database-id     :- [:maybe ::lib.schema.id/database]
   include-analytics?     :- :boolean
   include-stubs?         :- :boolean]
  (let [user-info  {:user-id user-id :is-superuser? is-superuser? :is-data-analyst? is-data-analyst?}
        base-where [:and
                    (when-not include-stubs?
                      [:= :is_stub false])
                    (when-not include-analytics?
                      [:= :is_audit false])
                    (if router-database-id
                      [:= :router_database_id router-database-id]
                      [:= :router_database_id nil])]
        where      (if filter-by-data-access?
                     [:and base-where
                      [:or
                       (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/create-queries :query-builder}))
                       (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-database :yes}))
                       (:clause (mi/visible-filter-clause :model/Database :id user-info {:perms/manage-table-metadata :yes}))]]
                     base-where)]
    (t2/select :model/Database {:order-by [:%lower.name :%lower.engine]
                                :where where})))

(mu/defn database-exists?
  "Whether a Database with `database-id` exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id))

(mu/defn non-destination-database-exists?
  "Whether a Database with `database-id` that is not a routing destination exists."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :id database-id :router_database_id nil))

(mu/defn destination-database-exists-for-router?
  "Whether the Database with `database-id` has routing destinations."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Database :router_database_id database-id))

(mu/defn insert-database!
  "Insert the Database `row` and return the inserted instance."
  [row :- ::warehouses.schema/database.update]
  (t2/insert-returning-instance! :model/Database row))

(mu/defn sample-database
  "The sample Database, or nil."
  []
  (t2/select-one :model/Database :is_sample true))

(mu/defn update-database!
  "Apply `changes` to the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   changes     :- ::warehouses.schema/database.update]
  (t2/update! :model/Database database-id changes))

(mu/defn delete-destination-databases!
  "Delete the routing destination Databases of the Database with `router-database-id`, returning the number deleted."
  [router-database-id :- ::lib.schema.id/database]
  (t2/delete! :model/Database :router_database_id router-database-id))

(mu/defn delete-database!
  "Delete the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (t2/delete! :model/Database :id database-id))

(mu/defn mark-tables-sync-complete!
  "Mark the initial sync of the Tables with `table-ids` complete, returning the number updated."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (t2/update! :model/Table {:id [:in table-ids]} {:initial_sync_status "complete"}))

(mu/defn delete-field-values-for-database!
  "Delete the FieldValues of every Field of the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (t2/query-one {:delete-from :metabase_fieldvalues
                 :where      [:in :field_id
                              ^:allow-subquery {:select     [:f.id]
                                                :from       [[:metabase_field :f]]
                                                :right-join [[:metabase_table :t] [:= :f.table_id :t.id]]
                                                :where      [:= :t.db_id database-id]}]}))

(defn- card-usage-count-subquery
  [database-id model type-str]
  ^:allow-subquery {:select [[:%count.* model]]
                    :from   [:report_card]
                    :where  [:and
                             [:= :database_id database-id]
                             [:= :type type-str]]})

(mu/defn database-usage-counts
  "A single row with the count of Questions (`:question`), Models (`:dataset`), Metrics (`:metric`), Segments
  (`:segment`), and Transforms (`:transform`) that use the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (mdb/query
   {:select [:*]
    :from   [[(card-usage-count-subquery database-id :question "question") :question]
             [(card-usage-count-subquery database-id :dataset "model") :dataset]
             [(card-usage-count-subquery database-id :metric "metric") :metric]
             [^:allow-subquery {:select [[:%count.* :segment]]
                                :from   [:segment]
                                :where  [:in :table_id ^:allow-subquery {:select [:id]
                                                                         :from   [:metabase_table]
                                                                         :where  [:= :db_id database-id]}]}
              :segment]
             [^:allow-subquery {:select [[:%count.* :transform]]
                                :from   [:transform]
                                :where  [:or
                                         [:= :source_database_id database-id]
                                         [:= :target_db_id database-id]]}
              :transform]]}))
