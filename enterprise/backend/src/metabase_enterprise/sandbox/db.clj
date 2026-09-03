(ns metabase-enterprise.sandbox.db
  "Application database queries for the sandbox module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Sandboxes ----------------------------------------------------

(defn sandbox
  "The Sandbox with `sandbox-id`, or nil."
  [sandbox-id]
  (t2/select-one :model/Sandbox :id sandbox-id))

(defn sandboxes
  "Every Sandbox, in ID order."
  []
  (t2/select :model/Sandbox {:order-by [[:id :asc]]}))

(defn sandbox-for-group-and-table
  "The Sandbox of the group with `group-id` on the Table with `table-id`, or nil."
  [group-id table-id]
  (t2/select-one :model/Sandbox :group_id group-id :table_id table-id))

(defn sandboxes-for-groups-and-table
  "The Sandboxes of the groups with `group-ids` on the Table with `table-id`."
  [group-ids table-id]
  (t2/select :model/Sandbox :group_id [:in group-ids] :table_id table-id))

(defn sandboxes-using-card
  "The `:id` and `:table_id` of the Sandboxes built on the Card with `card-id`."
  [card-id]
  (t2/select [:model/Sandbox :id :table_id] :card_id card-id))

(defn user-sandboxes-with-group-ids
  "The Sandboxes of the groups of the User with `user-id`, each with the `:group_id` of the membership."
  [user-id]
  (t2/select :model/Sandbox
             {:select    [[:pgm.group_id :group_id]
                          [:s.*]]
              :from      [[:permissions_group_membership :pgm]]
              :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
              :where     [:and
                          [:= :pgm.user_id user-id]]}))

(defn sandboxes-with-table-info
  "The group, Table, Database, and schema of the Sandboxes of the optional `group-id` or `group-ids` in the optional
  Database `db-id`, excluding the Database `excluded-db-id` when given."
  [group-id group-ids db-id excluded-db-id]
  (t2/select :model/Sandbox
             {:select [:s.group_id :s.table_id :t.db_id :t.schema]
              :from   [[:sandboxes :s]]
              :join   [[:metabase_table :t] [:= :s.table_id :t.id]]
              :where  [:and
                       (when group-id [:= :s.group_id group-id])
                       (when group-ids [:in :s.group_id group-ids])
                       (when db-id [:= :t.db_id db-id])
                       (when excluded-db-id [:not [:= :t.db_id excluded-db-id]])]}))

(defn insert-sandbox!
  "Insert `sandbox` and return the new instance."
  [sandbox]
  (first (t2/insert-returning-instances! :model/Sandbox sandbox)))

(defn update-sandbox!
  "Apply `changes` to the Sandbox with `sandbox-id`."
  [sandbox-id changes]
  (t2/update! :model/Sandbox sandbox-id changes))

(defn delete-sandbox!
  "Delete the Sandbox with `sandbox-id`."
  [sandbox-id]
  (t2/delete! :model/Sandbox :id sandbox-id))

(defn delete-sandboxes!
  "Delete the Sandboxes with `sandbox-ids`."
  [sandbox-ids]
  (t2/delete! :model/Sandbox :id [:in sandbox-ids]))

;;; --------------------------------------------------- Other models ---------------------------------------------------

(defn impersonations-for-groups
  "The ConnectionImpersonations of the groups with `group-ids`."
  [group-ids]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))

(defn user-group-ids
  "The IDs of the groups of the User with `user-id`."
  [user-id]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(defn personal-user
  "The personal User with `user-id`, or nil."
  [user-id]
  (t2/select-one :model/User :id user-id :type :personal))

(defn set-user-login-attributes!
  "Set the login attributes of the User with `user-id`, returning the number of rows updated."
  [user-id login-attributes]
  (t2/update! :model/User user-id {:login_attributes login-attributes}))

(defn user-attributes-reducible
  "Reducible merged JWT and login attribute maps of the Users that have any."
  []
  (t2/select-fn-reducible (comp (partial apply merge)
                                (juxt :jwt_attributes :login_attributes))
                          [:model/User :login_attributes :jwt_attributes]
                          {:where [:or
                                   [:and
                                    [:not= :jwt_attributes nil]
                                    [:not= :jwt_attributes "{}"]]
                                   [:and
                                    [:not= :login_attributes nil]
                                    [:not= :login_attributes "{}"]]]}))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn tables-of-database
  "The `:id`, `:db_id`, and `:schema` of the Tables of the Database with `db-id`, restricted to `schema` when
  `schema-only?`."
  [db-id schema-only? schema]
  (t2/select [:model/Table :id :db_id :schema]
             {:where [:and
                      [:= :db_id db-id]
                      (when schema-only?
                        [:= :schema schema])]}))

(defn database-of-table
  "The Database of the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Database
                 :id ^:allow-subquery {:select [:t.db_id]
                                       :from   [[(t2/table-name :model/Table) :t]]
                                       :where  [:= :t.id table-id]}))

(defn fields-of-table-named
  "The `:id` and `:name` of the Fields of the Table with `table-id` named one of `field-names`."
  [table-id field-names]
  (t2/select [:model/Field :id :name] :table_id table-id :name [:in field-names]))

(defn cards-by-id
  "A map of Card ID to the query, result metadata, and schema of the Cards with `card-ids`."
  [card-ids]
  (t2/select-pk->fn identity [:model/Card :id :dataset_query :result_metadata :card_schema] :id [:in card-ids]))

(defn cards-result-metadata
  "The `:id`, `:result_metadata`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :result_metadata :card_schema] :id [:in card-ids]))

(defn card-result-metadata
  "The result metadata of the Card with `card-id`."
  [card-id]
  (t2/select-one-fn :result_metadata :model/Card :id card-id))

(defn sandboxing-cards
  "The `:id`, `:dataset_query`, `:database_id`, and `:card_schema` of the Cards Sandboxes are built on."
  []
  (t2/select :model/Card
             {:select [:c.id :c.dataset_query :c.database_id :c.card_schema]
              :from   [[(t2/table-name :model/Card) :c]]
              :where  [:exists ^:allow-subquery {:select [[[:inline 1]]]
                                                 :from   [[(t2/table-name :model/Sandbox) :s]]
                                                 :where  [:= :s.card_id :c.id]}]}))

(defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id`."
  [card-id result-metadata]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))
