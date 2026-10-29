(ns metabase.warehouses.db
  "Application database queries for the warehouses module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn database :- [:maybe ::warehouses.schema/database]
  "The ::warehouses.schema/database with `database-id`, or nil."
  [database-id :- [:maybe ::lib.schema.id/database]]
  (t2/select-one :model/Database :id [:auto/param database-id]))

(mu/defn databases
  "The Databases with `database-ids`."
  [database-ids :- [:sequential ::lib.schema.id/database]]
  (t2/select :model/Database :id [:in database-ids]))

(mu/defn database-by-name
  "The Database named `database-name`, or nil."
  [database-name :- :string]
  (t2/select-one :model/Database :name database-name))

(mu/defn set-database-details!
  "Set the connection details of the Database with `database-id`, returning the number updated."
  [database-id :- ::lib.schema.id/database
   details     :- ::warehouses.schema/database.details]
  (t2/update! :model/Database database-id {:details details}))

(mu/defn set-database-provider-name!
  "Set the provider name of the Database with `database-id`, returning the number updated."
  [database-id    :- ::lib.schema.id/database
   provider-name  :- :string]
  (t2/update! :model/Database database-id {:provider_name provider-name}))

(mu/defn health-check-candidate-ids
  "The `:id` of the lowest-id non-audit, non-sample, non-stub, non-destination Database of each engine."
  []
  (t2/query {:select   [[:%min.id :id]]
             :from     [(t2/table-name :model/Database)]
             :where    [:and
                        [:= :is_audit false]
                        [:= :is_sample false]
                        [:= :is_stub false]
                        [:= :router_database_id nil]]
             :group-by [:engine]}))

(defn- table-ids-of-database-query
  [database-id]
  ^:allow-subquery {:from [(t2/table-name :model/Table)], :select [:id], :where [:= :db_id database-id]})

(mu/defn delete-childless-fields-for-database!
  "Delete the childless Fields of the Tables of the Database with `database-id`, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (let [table-ids-query (table-ids-of-database-query database-id)
        extra-clause    (if (= (mdb/db-type) :mysql)
                          ;; double-wrapped subquery to work around the MySQL restriction on selecting from the
                          ;; DELETE target
                          [:not-in :id ^:allow-subquery {:select [:parent_id]
                                                         :from   [[^:allow-subquery {:select [:parent_id]
                                                                                     :from   [(t2/table-name :model/Field)]
                                                                                     :where  [:and
                                                                                              [:not= :parent_id nil]
                                                                                              [:in :table_id table-ids-query]]}
                                                                   :parent_fields]]}]
                          [:not [:exists ^:allow-subquery {:select [1]
                                                           :from   [[(t2/table-name :model/Field) :child_field]]
                                                           :where  [:= :child_field.parent_id :metabase_field.id]}]])]
    (t2/query-one {:delete-from (t2/table-name :model/Field)
                   :where       [:and
                                 [:in :table_id table-ids-query]
                                 extra-clause]})))

(mu/defn delete-cards-for-database-returning-ids-reducible
  "A reducible that deletes the Cards of the Database with `database-id` and yields their `:id`s (Postgres only)."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-query {:delete-from (t2/table-name :model/Card)
                       :where       [:= :database_id database-id]
                       :returning   [:id]}))

(mu/defn card-ids-for-database-reducible
  "A reducible of the `:id`s of the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/reducible-query {:from   [(t2/table-name :model/Card)]
                       :select [:id]
                       :where  [:= :database_id database-id]}))

(mu/defn delete-cards-for-database!
  "Delete the Cards of the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/query {:delete-from (t2/table-name :model/Card)
             :where       [:= :database_id database-id]}))

(mu/defn disable-uploads-for-all-databases!
  "Disable uploads on every Database that has them enabled, returning the number updated."
  []
  (t2/update! :model/Database :uploads_enabled true {:uploads_enabled false :uploads_table_prefix nil :uploads_schema_name nil}))

(mu/defn databases-for-serdes-reducible
  "A reducible of the Databases to export via serdes: routing destinations, stubs and the sample database are always
  excluded, H2 databases unless `include-h2?`, and the export is restricted to the rows whose `filter-column` is one
  of `filter-ids` when `filter-column` is given."
  [filter-column :- [:maybe :keyword]
   filter-ids    :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   include-h2?   :- :boolean]
  (t2/reducible-select :model/Database
                       {:where [:and
                                (when filter-column
                                  [:in filter-column filter-ids])
                                [:= :router_database_id nil]
                                ;; never export the sample database, regardless of its driver
                                [:not= :is_sample true]
                                [:not= :is_stub true]
                                (when-not include-h2?
                                  [:not= :engine "h2"])]}))

(mu/defn database-exists?
  "Whether the Database with `database-id` exists."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (t2/exists? :model/Database :id [:auto/param database-id]))

(mu/defn database-engines
  "The set of engines of all Databases."
  []
  (t2/select-fn-set :engine :model/Database))

(mu/defn all-databases
  "Every Database."
  []
  (t2/select :model/Database))

(mu/defn non-destination-database-ids
  "The ids of the Databases that are not routing destinations, excluding `excluded-database-id` when given."
  [{:keys [excluded-database-id]} :- [:map {:closed true}
                                      [:excluded-database-id {:optional true} [:maybe ::lib.schema.id/database]]]]
  (t2/select-pks-vec :model/Database {:where [:and
                                              (when excluded-database-id [:not= :id [:auto/param excluded-database-id]])
                                              [:= :router_database_id nil]]}))

(mu/defn routing-destination-database-ids
  "The set of ids of the Databases that are routing destinations."
  []
  (t2/select-fn-set :id :model/Database :router_database_id [:not= nil]))

(mu/defn destination-database-ids
  "The ids of the routing destination Databases among `database-ids`."
  [{:keys [database-ids]} :- [:map {:closed true}
                              [:database-ids [:set ::lib.schema.id/database]]]]
  (t2/select-fn-set :id :model/Database :id [:in database-ids] :router_database_id [:not= nil]))

(mu/defn destination-database-exists?
  "Whether the Database with `database-id` is a routing destination."
  [{:keys [database-id]} :- [:map {:closed true}
                             [:database-id ::lib.schema.id/database]]]
  (t2/exists? :model/Database :id [:auto/param database-id] :router_database_id [:not= nil]))

(mu/defn destination-database-exists-for-router?
  "Whether the Database with `router-database-id` has routing destinations."
  [{:keys [router-database-id]} :- [:map {:closed true}
                                    [:router-database-id ::lib.schema.id/database]]]
  (t2/exists? :model/Database :router_database_id [:auto/param router-database-id]))

(mu/defn destination-database-id
  "The id of the destination Database of the router with `router-database-id` named `database-name`, or nil."
  [{:keys [router-database-id database-name]} :- [:map {:closed true}
                                                  [:router-database-id ::lib.schema.id/database]
                                                  [:database-name :string]]]
  (t2/select-one-pk :model/Database :router_database_id [:auto/param router-database-id] :name [:auto/param database-name]))

(mu/defn destination-name-exists?
  "Whether a destination Database of the router with `router-database-id` is named one of `names`."
  [{:keys [router-database-id names]} :- [:map {:closed true}
                                          [:router-database-id ::lib.schema.id/database]
                                          [:names [:sequential :string]]]]
  (t2/exists? :model/Database :router_database_id [:auto/param router-database-id] :name [:in names]))

(mu/defn database-ids-by-name
  "The ids of the Databases named `database-name`."
  [{:keys [database-name]} :- [:map {:closed true}
                               [:database-name :string]]]
  (t2/select-pks-vec :model/Database :name [:auto/param database-name]))

(mu/defn non-audit-database-by-name
  "The non-audit Database named `database-name`, or nil."
  [{:keys [database-name]} :- [:map {:closed true}
                               [:database-name :string]]]
  (t2/select-one :model/Database :name [:auto/param database-name] :is_audit false))

(mu/defn database-engines-and-names
  "A map of id to the id, engine, and name of the Databases with `database-ids`."
  [{:keys [database-ids]} :- [:map {:closed true}
                              [:database-ids [:sequential ::lib.schema.id/database]]]]
  (t2/select-pk->fn identity [:model/Database :id :engine :name] :id [:in database-ids]))

(mu/defn database-names-by-id
  "A map of id to name for the Databases with `database-ids`."
  [{:keys [database-ids]} :- [:map {:closed true}
                              [:database-ids [:sequential ::lib.schema.id/database]]]]
  (t2/select-pk->fn :name :model/Database :id [:in database-ids]))

(mu/defn database-on-demand-flags
  "A map of Database id to its `:is_on_demand` flag for `database-ids`."
  [{:keys [database-ids]} :- [:map {:closed true}
                              [:database-ids [:set ::lib.schema.id/database]]]]
  (t2/select-pk->fn :is_on_demand :model/Database :id [:in database-ids]))

(mu/defn database-among
  "A Database whose id is in `database-ids`, or nil."
  [{:keys [database-ids]} :- [:map {:closed true}
                              [:database-ids [:sequential ::lib.schema.id/database]]]]
  (t2/select-one :model/Database :id [:in database-ids]))

(mu/defn non-audit-database-summaries
  "The id, name, engine, description, and audit flag of every non-audit, non-stub, non-destination Database, ordered by
  name."
  []
  (t2/select [:model/Database :id :name :engine :description :is_audit]
             :is_audit false
             :is_stub false
             :router_database_id nil
             {:order-by [[:%lower.name :asc]]}))

(mu/defn non-audit-database-count
  "The number of Databases other than the audit Database."
  []
  (t2/count :model/Database :is_audit false))

(mu/defn audit-database
  "The audit Database, or nil."
  []
  (t2/select-one :model/Database :is_audit true))

(mu/defn sample-database
  "The sample Database, or nil."
  []
  (t2/select-one :model/Database :is_sample true))

(mu/defn sample-database-id
  "The id of the sample Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_sample true))

(mu/defn sample-database-exists?
  "Whether a sample Database exists."
  []
  (t2/exists? :model/Database :is_sample true))

(mu/defn synced-user-database-exists?
  "Whether a non-sample, non-audit Database exists whose initial sync is complete."
  []
  (t2/exists? :model/Database :is_sample false :is_audit false :initial_sync_status "complete"))

(mu/defn attached-dwh-database
  "The attached data warehouse Database, or nil."
  []
  (t2/select-one :model/Database :is_attached_dwh true))

(mu/defn attached-dwh-database-id
  "The id of the attached data warehouse Database, or nil."
  []
  (t2/select-one-pk :model/Database :is_attached_dwh true))

(mu/defn uploads-database
  "The Database being used for uploads, or nil."
  []
  (t2/select-one :model/Database :uploads_enabled true))

(mu/defn uploads-database-exists?
  "Whether a Database with uploads enabled exists."
  []
  (t2/exists? :model/Database :uploads_enabled true))

(mu/defn non-internal-database-stats
  "The sync flag, engine, and DBMS version of the non-internal Databases."
  []
  (t2/select [:model/Database :is_full_sync :engine :dbms_version]
             {:where [:not [:or :is_sample :is_audit]]}))

(mu/defn database-engines-among
  "The set of engines of the Databases whose engine is one of `engine-names`."
  [{:keys [engine-names]} :- [:map {:closed true}
                              [:engine-names [:sequential :string]]]]
  (t2/select-fn-set :engine :model/Database {:where [:in :engine engine-names]}))

(mu/defn database-with-engine-exists?
  "Whether a Database exists whose engine is one of `engines`."
  [{:keys [engines]} :- [:map {:closed true}
                         [:engines [:sequential :string]]]]
  (t2/exists? :model/Database :engine [:in engines]))

(mu/defn starburst-database-details
  "The set of connection details of the Starburst Databases."
  []
  (t2/select-fn-set :details :model/Database :engine "starburst"))

(mu/defn database-of-table
  "The Database of the Table with `table-id`, or nil."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ::lib.schema.id/table]]]
  (t2/select-one :model/Database
                 :id ^:allow-subquery {:select [:t.db_id]
                                       :from   [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
                                       :where  [:= :t.id [:auto/param table-id]]}))

(mu/defn delete-actions-for-database!
  "Delete the query Actions whose query runs against the Database with `database-id` and the implicit Actions that write
  to one of its Tables, returning the number deleted."
  [database-id :- ::lib.schema.id/database]
  (let [[table-subquery _] (warehouse-schema-overlay/table-query)]
    (if-let [action-ids (not-empty (into (t2/select-fn-set :action_id :model/QueryAction :database_id database-id)
                                         (t2/select-fn-set :action_id :model/ImplicitAction
                                                           {:join  [[table-subquery :table]
                                                                    [:= :table.id :implicit_action.table_id]]
                                                            :where [:= :table.db_id database-id]})))]
      (t2/delete! :model/Action :id [:in action-ids])
      0)))
