(ns metabase-enterprise.sandbox.db
  "Application database queries for the sandbox module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn sandbox :- [:maybe (ms/InstanceOf :model/Sandbox)]
  "The Sandbox with `sandbox-id`, or nil."
  [sandbox-id :- ms/PositiveInt]
  (t2/select-one :model/Sandbox :id sandbox-id))

(mu/defn sandboxes :- [:sequential (ms/InstanceOf :model/Sandbox)]
  "Every Sandbox, in ID order."
  []
  (t2/select :model/Sandbox {:order-by [[:id :asc]]}))

(mu/defn sandbox-for-group-and-table :- [:maybe (ms/InstanceOf :model/Sandbox)]
  "The Sandbox of the group with `group-id` on the Table with `table-id`, or nil."
  [group-id :- ms/PositiveInt
   table-id :- ms/PositiveInt]
  (t2/select-one :model/Sandbox :group_id group-id :table_id table-id))

(mu/defn sandboxes-for-groups-and-table :- [:sequential (ms/InstanceOf :model/Sandbox)]
  "The Sandboxes of the groups with `group-ids` on the Table with `table-id`."
  [group-ids :- [:seqable ms/PositiveInt]
   table-id  :- ms/PositiveInt]
  (t2/select :model/Sandbox :group_id [:in group-ids] :table_id table-id))

(mu/defn sandboxes-using-card :- [:sequential (ms/InstanceOf :model/Sandbox)]
  "The `:id` and `:table_id` of the Sandboxes built on the Card with `card-id`."
  [card-id :- ms/PositiveInt]
  (t2/select [:model/Sandbox :id :table_id] :card_id card-id))

(mu/defn user-sandboxes-with-group-ids :- [:sequential (ms/InstanceOf :model/Sandbox)]
  "The Sandboxes of the groups of the User with `user-id`, each with the `:group_id` of the membership."
  [user-id :- ms/PositiveInt]
  (t2/select :model/Sandbox
             {:select    [[:pgm.group_id :group_id]
                          [:s.*]]
              :from      [[:permissions_group_membership :pgm]]
              :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
              :where     [:and
                          [:= :pgm.user_id user-id]]}))

(mu/defn sandboxes-with-table-info :- [:sequential (ms/InstanceOf :model/Sandbox)]
  "The group, Table, Database, and schema of the Sandboxes of the optional `group-id` or `group-ids` in the optional
  Database `db-id`, excluding the Database `excluded-db-id` when given."
  [group-id       :- [:maybe ms/PositiveInt]
   group-ids      :- [:maybe [:seqable ms/PositiveInt]]
   db-id          :- [:maybe ms/PositiveInt]
   excluded-db-id :- [:maybe ms/PositiveInt]]
  (t2/select :model/Sandbox
             {:select [:s.group_id :s.table_id :t.db_id :t.schema]
              :from   [[:sandboxes :s]]
              :join   [[:metabase_table :t] [:= :s.table_id :t.id]]
              :where  [:and
                       (when group-id [:= :s.group_id group-id])
                       (when group-ids [:in :s.group_id group-ids])
                       (when db-id [:= :t.db_id db-id])
                       (when excluded-db-id [:not [:= :t.db_id excluded-db-id]])]}))

(mu/defn candidate-sandboxes-for-groups-and-databases :- [:sequential
                                                          [:map {:closed true}
                                                           [:id ms/PositiveInt]
                                                           [:group_id ms/PositiveInt]
                                                           [:table_id ms/PositiveInt]
                                                           [:db_id [:maybe ms/PositiveInt]]
                                                           [:schema [:maybe :string]]]]
  "The `:id`, `:group_id`, `:table_id`, `:db_id`, and `:schema` of the Sandboxes of the groups with `group-ids` on
  Tables of the Databases with `db-ids`."
  [group-ids :- [:seqable ms/PositiveInt]
   db-ids    :- [:seqable ms/PositiveInt]]
  (mdb/query
   {:select    [[:sandboxes.id :id]
                [:sandboxes.group_id :group_id]
                [:sandboxes.table_id :table_id]
                [:table.db_id :db_id]
                [:table.schema :schema]]
    :from      [[:sandboxes]]
    :left-join [[:metabase_table :table]
                [:= :sandboxes.table_id :table.id]]
    :where     [:and
                [:in :sandboxes.group_id group-ids]
                [:in :table.db_id db-ids]]}))

(mu/defn insert-sandbox! :- (ms/InstanceOf :model/Sandbox)
  "Insert `sandbox` and return the new instance."
  [sandbox :- [:map {:closed true}
               [:id                   {:optional true} [:maybe ms/PositiveInt]]
               [:table_id             ms/PositiveInt]
               [:card_id              {:optional true} [:maybe ms/PositiveInt]]
               [:group_id             ms/PositiveInt]
               [:attribute_remappings {:optional true} :any]]]
  (first (t2/insert-returning-instances! :model/Sandbox sandbox)))

(mu/defn update-sandbox! :- :int
  "Apply `changes` to the Sandbox with `sandbox-id`, returning the number updated."
  [sandbox-id :- ms/PositiveInt
   changes    :- [:map {:closed true}
                  [:card_id              {:optional true} [:maybe ms/PositiveInt]]
                  [:attribute_remappings {:optional true} :any]]]
  (t2/update! :model/Sandbox sandbox-id changes))

(mu/defn delete-sandbox! :- :int
  "Delete the Sandbox with `sandbox-id`, returning the number deleted."
  [sandbox-id :- ms/PositiveInt]
  (t2/delete! :model/Sandbox :id sandbox-id))

(mu/defn delete-sandboxes! :- :int
  "Delete the Sandboxes with `sandbox-ids`, returning the number deleted."
  [sandbox-ids :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/Sandbox :id [:in sandbox-ids]))

(mu/defn impersonations-for-groups :- [:sequential (ms/InstanceOf :model/ConnectionImpersonation)]
  "The ConnectionImpersonations of the groups with `group-ids`."
  [group-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))

(mu/defn user-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the groups of the User with `user-id`."
  [user-id :- ms/PositiveInt]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn personal-user :- [:maybe (ms/InstanceOf :model/User)]
  "The personal User with `user-id`, or nil."
  [user-id :- ms/PositiveInt]
  (t2/select-one :model/User :id user-id :type :personal))

(mu/defn set-user-login-attributes! :- :int
  "Set the login attributes of the User with `user-id`, returning the number of rows updated."
  [user-id          :- ms/PositiveInt
   login-attributes :- :any]
  (t2/update! :model/User user-id {:login_attributes login-attributes}))

(mu/defn user-attributes-reducible
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

(mu/defn table :- [:maybe (ms/InstanceOf :model/Table)]
  "The Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Table :id table-id))

(mu/defn tables-of-database :- [:sequential (ms/InstanceOf :model/Table)]
  "The `:id`, `:db_id`, and `:schema` of the Tables of the Database with `db-id`, restricted to `schema` when
  `schema-only?`."
  [db-id        :- ms/PositiveInt
   schema-only? :- :boolean
   schema       :- [:maybe :string]]
  (t2/select [:model/Table :id :db_id :schema]
             {:where [:and
                      [:= :db_id db-id]
                      (when schema-only?
                        [:= :schema schema])]}))

(mu/defn database-of-table :- [:maybe (ms/InstanceOf :model/Database)]
  "The Database of the Table with `table-id`, or nil."
  [table-id :- ms/PositiveInt]
  (t2/select-one :model/Database
                 :id ^:allow-subquery {:select [:t.db_id]
                                       :from   [[(t2/table-name :model/Table) :t]]
                                       :where  [:= :t.id table-id]}))

(mu/defn fields-of-table-named :- [:sequential (ms/InstanceOf :model/Field)]
  "The `:id` and `:name` of the Fields of the Table with `table-id` named one of `field-names`."
  [table-id    :- ms/PositiveInt
   field-names :- [:seqable :string]]
  (t2/select [:model/Field :id :name] :table_id table-id :name [:in field-names]))

(mu/defn cards-by-id :- [:map-of ms/PositiveInt (ms/InstanceOf :model/Card)]
  "A map of Card ID to the query, result metadata, and schema of the Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select-pk->fn identity [:model/Card :id :dataset_query :result_metadata :card_schema] :id [:in card-ids]))

(mu/defn cards-result-metadata :- [:sequential (ms/InstanceOf :model/Card)]
  "The `:id`, `:result_metadata`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids :- [:seqable ms/PositiveInt]]
  (t2/select [:model/Card :id :result_metadata :card_schema] :id [:in card-ids]))

(mu/defn card-result-metadata :- :any
  "The result metadata of the Card with `card-id`."
  [card-id :- ms/PositiveInt]
  (t2/select-one-fn :result_metadata :model/Card :id card-id))

(mu/defn sandboxing-cards :- [:sequential (ms/InstanceOf :model/Card)]
  "The `:id`, `:dataset_query`, `:database_id`, and `:card_schema` of the Cards Sandboxes are built on."
  []
  (t2/select :model/Card
             {:select [:c.id :c.dataset_query :c.database_id :c.card_schema]
              :from   [[(t2/table-name :model/Card) :c]]
              :where  [:exists ^:allow-subquery {:select [[[:inline 1]]]
                                                 :from   [[(t2/table-name :model/Sandbox) :s]]
                                                 :where  [:= :s.card_id :c.id]}]}))

(mu/defn set-card-result-metadata! :- :int
  "Set the result metadata of the Card with `card-id`, returning the number updated."
  [card-id         :- ms/PositiveInt
   result-metadata :- :any]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))
