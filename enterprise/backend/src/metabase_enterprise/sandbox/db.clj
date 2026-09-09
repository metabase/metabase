(ns metabase-enterprise.sandbox.db
  "Application database queries for the sandbox module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.impersonation.schema :as impersonation.schema]
   [metabase-enterprise.sandbox.schema :as sandbox.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [metabase.warehouses.schema :as warehouses.schema]
   [toucan2.core :as t2]))

(mu/defn sandbox :- [:maybe ::sandbox.schema/sandbox]
  "The Sandbox with `sandbox-id`, or nil."
  [sandbox-id :- ::lib.schema.id/sandbox]
  (t2/select-one :model/Sandbox :id sandbox-id))

(mu/defn sandboxes :- [:sequential ::sandbox.schema/sandbox]
  "Every Sandbox, in ID order."
  []
  (t2/select :model/Sandbox {:order-by [[:id :asc]]}))

(mu/defn sandbox-for-group-and-table :- [:maybe ::sandbox.schema/sandbox]
  "The Sandbox of the group with `group-id` on the Table with `table-id`, or nil."
  [group-id :- ms/PositiveInt
   table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Sandbox :group_id group-id :table_id table-id))

(mu/defn sandboxes-for-groups-and-table :- [:sequential ::sandbox.schema/sandbox]
  "The Sandboxes of the groups with `group-ids` on the Table with `table-id`."
  [group-ids :- [:set ms/PositiveInt]
   table-id  :- ::lib.schema.id/table]
  (t2/select :model/Sandbox :group_id [:in group-ids] :table_id table-id))

(def ^:private SandboxesUsingCard
  "Rows returned by [[sandboxes-using-card]]."
  (mut/select-keys ::sandbox.schema/sandbox [:id :table_id]))

(mu/defn sandboxes-using-card :- [:sequential SandboxesUsingCard]
  "The `:id` and `:table_id` of the Sandboxes built on the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select [:model/Sandbox :id :table_id] :card_id card-id))

(def ^:private UserSandboxWithGroupId
  "Rows returned by [[user-sandboxes-with-group-ids]]."
  [:map {:closed true}
   [:group_id             ms/PositiveInt]
   [:id                   [:maybe ms/PositiveInt]]
   [:table_id             [:maybe ::lib.schema.id/table]]
   [:card_id              [:maybe ::lib.schema.id/card]]
   [:attribute_remappings [:maybe :map]]])

(mu/defn user-sandboxes-with-group-ids :- [:sequential UserSandboxWithGroupId]
  "The Sandboxes of the groups of the User with `user-id`, each with the `:group_id` of the membership."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/Sandbox
             {:select    [[:pgm.group_id :group_id]
                          [:s.*]]
              :from      [[:permissions_group_membership :pgm]]
              :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
              :where     [:and
                          [:= :pgm.user_id user-id]]}))

(def ^:private SandboxesWithTableInfo
  "Rows returned by [[sandboxes-with-table-info]]."
  (mut/merge (mut/select-keys ::sandbox.schema/sandbox [:group_id :table_id])
             [:map [:db_id [:maybe ::lib.schema.id/database]] [:schema [:maybe :string]]]))

(mu/defn sandboxes-with-table-info :- [:sequential SandboxesWithTableInfo]
  "The group, Table, Database, and schema of the Sandboxes of the optional `group-id` or `group-ids` in the optional
  Database `db-id`, excluding the Database `excluded-db-id` when given."
  [group-id       :- [:maybe ms/PositiveInt]
   group-ids      :- [:maybe [:sequential ms/PositiveInt]]
   db-id          :- [:maybe ::lib.schema.id/database]
   excluded-db-id :- [:maybe ::lib.schema.id/database]]
  (t2/select :model/Sandbox
             {:select [:s.group_id :s.table_id :t.db_id :t.schema]
              :from   [[:sandboxes :s]]
              :join   [[:metabase_table :t] [:= :s.table_id :t.id]]
              :where  [:and
                       (when group-id [:= :s.group_id group-id])
                       (when group-ids [:in :s.group_id group-ids])
                       (when db-id [:= :t.db_id db-id])
                       (when excluded-db-id [:not [:= :t.db_id excluded-db-id]])]}))

(def ^:private CandidateSandboxesForGroupsAndDatabase
  "Rows returned by [[candidate-sandboxes-for-groups-and-databases]]."
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:group_id ms/PositiveInt]
   [:table_id ::lib.schema.id/table]
   [:db_id [:maybe ::lib.schema.id/database]]
   [:schema [:maybe :string]]])

(mu/defn candidate-sandboxes-for-groups-and-databases :- [:sequential
                                                          CandidateSandboxesForGroupsAndDatabase]
  "The `:id`, `:group_id`, `:table_id`, `:db_id`, and `:schema` of the Sandboxes of the groups with `group-ids` on
  Tables of the Databases with `db-ids`."
  [group-ids :- [:set ms/PositiveInt]
   db-ids    :- [:set ::lib.schema.id/database]]
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

(mu/defn insert-sandbox! :- ::sandbox.schema/sandbox
  "Insert `sandbox` and return the new instance."
  [sandbox :- [:map {:closed true}
               [:id                   {:optional true} ms/PositiveInt]
               [:table_id             ::lib.schema.id/table]
               [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
               [:group_id             ms/PositiveInt]
               [:attribute_remappings {:optional true} [:maybe :map]]]]
  (first (t2/insert-returning-instances! :model/Sandbox sandbox)))

(mu/defn update-sandbox! :- :int
  "Apply `changes` to the Sandbox with `sandbox-id`, returning the number updated."
  [sandbox-id :- ::lib.schema.id/sandbox
   changes    :- (mut/select-keys ::sandbox.schema/sandbox.update [:card_id :attribute_remappings])]
  (t2/update! :model/Sandbox sandbox-id changes))

(mu/defn delete-sandbox! :- :int
  "Delete the Sandbox with `sandbox-id`, returning the number deleted."
  [sandbox-id :- ::lib.schema.id/sandbox]
  (t2/delete! :model/Sandbox :id sandbox-id))

(mu/defn delete-sandboxes! :- :int
  "Delete the Sandboxes with `sandbox-ids`, returning the number deleted."
  [sandbox-ids :- [:set ::lib.schema.id/sandbox]]
  (t2/delete! :model/Sandbox :id [:in sandbox-ids]))

(mu/defn impersonations-for-groups :- [:sequential ::impersonation.schema/connection-impersonation]
  "The ConnectionImpersonations of the groups with `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))

(mu/defn user-group-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the groups of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn personal-user :- [:maybe ::users.schema/user]
  "The personal User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one :model/User :id user-id :type :personal))

(mu/defn set-user-login-attributes! :- :int
  "Set the login attributes of the User with `user-id`, returning the number of rows updated."
  [user-id          :- ::lib.schema.id/user
   login-attributes :- [:maybe :map]]
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

(mu/defn table :- [:maybe ::warehouse-schema.schema/table]
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id))

(def ^:private TablesOfDatabase
  "Rows returned by [[tables-of-database]]."
  (mut/select-keys ::warehouse-schema.schema/table [:id :db_id :schema]))

(mu/defn tables-of-database :- [:sequential TablesOfDatabase]
  "The `:id`, `:db_id`, and `:schema` of the Tables of the Database with `db-id`, restricted to `schema` when
  `schema-only?`."
  [db-id        :- ::lib.schema.id/database
   schema-only? :- :boolean
   schema       :- [:maybe :string]]
  (t2/select [:model/Table :id :db_id :schema]
             {:where [:and
                      [:= :db_id db-id]
                      (when schema-only?
                        [:= :schema schema])]}))

(mu/defn database-of-table :- [:maybe ::warehouses.schema/database]
  "The Database of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Database
                 :id ^:allow-subquery {:select [:t.db_id]
                                       :from   [[(t2/table-name :model/Table) :t]]
                                       :where  [:= :t.id table-id]}))

(def ^:private FieldsOfTableNamed
  "Rows returned by [[fields-of-table-named]]."
  (mut/select-keys ::warehouse-schema.schema/field [:id :name]))

(mu/defn fields-of-table-named :- [:sequential FieldsOfTableNamed]
  "The `:id` and `:name` of the Fields of the Table with `table-id` named one of `field-names`."
  [table-id    :- ::lib.schema.id/table
   field-names :- [:set :string]]
  (t2/select [:model/Field :id :name] :table_id table-id :name [:in field-names]))

(def ^:private CardsById
  "Rows returned by [[cards-by-id]]."
  (mut/optional-keys (mut/select-keys ::queries.schema/card [:id :dataset_query :result_metadata :card_schema :query_description :source_card_id]) [:source_card_id]))

(mu/defn cards-by-id :- [:map-of ::lib.schema.id/card CardsById]
  "A map of Card ID to the query, result metadata, and schema of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pk->fn identity [:model/Card :id :dataset_query :result_metadata :card_schema] :id [:in card-ids]))

(def ^:private CardsResultMetadata
  "Rows returned by [[cards-result-metadata]]."
  (mut/optional-keys (mut/select-keys ::queries.schema/card [:id :result_metadata :card_schema :query_description :source_card_id]) [:source_card_id]))

(mu/defn cards-result-metadata :- [:sequential CardsResultMetadata]
  "The `:id`, `:result_metadata`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select [:model/Card :id :result_metadata :card_schema] :id [:in card-ids]))

(mu/defn card-result-metadata :- [:maybe ::queries.schema/card.result-metadata]
  "The result metadata of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :result_metadata :model/Card :id card-id))

(def ^:private SandboxingCard
  "Rows returned by [[sandboxing-cards]]."
  (mut/optional-keys (mut/select-keys ::queries.schema/card [:id :dataset_query :database_id :card_schema :query_description :source_card_id]) [:source_card_id]))

(mu/defn sandboxing-cards :- [:sequential SandboxingCard]
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
  [card-id         :- ::lib.schema.id/card
   result-metadata :- [:maybe ::queries.schema/card.result-metadata]]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))
