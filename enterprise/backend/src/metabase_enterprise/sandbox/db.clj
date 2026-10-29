(ns metabase-enterprise.sandbox.db
  "Application database queries for the sandbox module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.sandbox.schema :as sandbox.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.core :as queries]
   [metabase.queries.schema :as queries.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mu/defn sandbox :- [:maybe ::sandbox.schema/sandbox]
  "The ::sandbox.schema/sandbox with `sandbox-id`, or nil."
  [sandbox-id :- ::lib.schema.id/sandbox]
  (t2/select-one :model/Sandbox :id [:auto/param sandbox-id]))

(mu/defn sandboxes
  "Every Sandbox, in ID order."
  []
  (t2/select :model/Sandbox {:order-by [[:id :asc]]}))

(mu/defn sandbox-for-group-and-table
  "The Sandbox of the group with `group-id` on the Table with `table-id`, or nil."
  [group-id :- ms/PositiveInt
   table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Sandbox :group_id group-id :table_id table-id))

(mu/defn sandboxes-for-groups-and-table
  "The Sandboxes of the groups with `group-ids` on the Table with `table-id`."
  [group-ids :- [:set ms/PositiveInt]
   table-id  :- ::lib.schema.id/table]
  (t2/select :model/Sandbox :group_id [:in group-ids] :table_id table-id))

(mu/defn sandboxes-using-card
  "The `:id` and `:table_id` of the Sandboxes built on the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select [:model/Sandbox :id :table_id] :card_id card-id))

(mu/defn user-sandboxes-with-group-ids
  "The Sandboxes of the groups of the User with `user-id`, each with the `:group_id` of the membership."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/Sandbox
             {:select    [[:pgm.group_id :group_id]
                          [:s.*]]
              :from      [[:permissions_group_membership :pgm]]
              :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
              :where     [:and
                          [:= :pgm.user_id user-id]]}))

(mu/defn sandboxes-with-table-info
  "The group, Table, Database, and schema of the Sandboxes of the optional `group-id` or `group-ids` in the optional
  Database `db-id`, excluding the Database `excluded-db-id` when given."
  [group-id       :- [:maybe ms/PositiveInt]
   group-ids      :- [:maybe [:sequential ms/PositiveInt]]
   db-id          :- [:maybe ::lib.schema.id/database]
   excluded-db-id :- [:maybe ::lib.schema.id/database]]
  (t2/select :model/Sandbox
             {:select [:s.group_id :s.table_id :t.db_id :t.schema]
              :from   [[:sandboxes :s]]
              :join   [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})
                       [:= :s.table_id :t.id]]
              :where  [:and
                       (when group-id [:= :s.group_id group-id])
                       (when group-ids [:in :s.group_id group-ids])
                       (when db-id [:= :t.db_id db-id])
                       (when excluded-db-id [:not [:= :t.db_id excluded-db-id]])]}))

(mu/defn candidate-sandboxes-for-groups-and-databases
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
    :left-join [(warehouse-schema-overlay/table-query {:alias :table, :user-settings? false})
                [:= :sandboxes.table_id :table.id]]
    :where     [:and
                [:in :sandboxes.group_id group-ids]
                [:in :table.db_id db-ids]]}))

(mu/defn insert-sandbox!
  "Insert `sandbox` and return the new instance."
  [sandbox :- [:map {:closed true}
               [:id                   {:optional true} ms/PositiveInt]
               [:table_id             ::lib.schema.id/table]
               [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
               [:group_id             ms/PositiveInt]
               [:attribute_remappings {:optional true} [:maybe ::sandbox.schema/attribute-remappings]]]]
  (first (t2/insert-returning-instances! :model/Sandbox sandbox)))

(mu/defn update-sandbox!
  "Apply `changes` to the Sandbox with `sandbox-id`, returning the number updated."
  [sandbox-id :- ::lib.schema.id/sandbox
   changes    :- (mut/select-keys ::sandbox.schema/sandbox.update [:card_id :attribute_remappings])]
  (t2/update! :model/Sandbox sandbox-id changes))

(mu/defn delete-sandbox!
  "Delete the Sandbox with `sandbox-id`, returning the number deleted."
  [sandbox-id :- ::lib.schema.id/sandbox]
  (t2/delete! :model/Sandbox :id sandbox-id))

(mu/defn delete-sandboxes!
  "Delete the Sandboxes with `sandbox-ids`, returning the number deleted."
  [sandbox-ids :- [:set ::lib.schema.id/sandbox]]
  (t2/delete! :model/Sandbox :id [:in sandbox-ids]))

(mu/defn set-user-login-attributes!
  "Set the login attributes of the User with `user-id`, returning the number of rows updated."
  [user-id          :- ::lib.schema.id/user
   login-attributes :- [:maybe users.schema/LoginAttributes]]
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

(mu/defn cards-by-id
  "A map of Card ID to the query-related columns of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (u/index-by :id (queries/cards-queries-info card-ids)))

(mu/defn cards-result-metadata
  "The query-related columns of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (queries/cards-queries-info card-ids))

(mu/defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id`, returning the number updated."
  [card-id         :- ::lib.schema.id/card
   result-metadata :- [:maybe ::queries.schema/card.result-metadata]]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))

(mu/defn sandbox-exists?
  "Whether any Sandbox exists."
  []
  (t2/exists? :model/Sandbox))

(mu/defn sandbox-exists-for-table?
  "Whether a Sandbox exists on the Table with `table-id`."
  [{:keys [table-id]} :- [:map {:closed true}
                          [:table-id ::lib.schema.id/table]]]
  (t2/exists? :model/Sandbox :table_id [:auto/param table-id]))

(mu/defn sandbox-card-ids
  "The set of ids of the Cards Sandboxes are built on."
  []
  (t2/select-fn-set :card_id :model/Sandbox :card_id [:not= nil]))

(mu/defn sandboxed-group-ids
  "The subset of `group-ids` with a Sandbox."
  [{:keys [group-ids]} :- [:map {:closed true}
                           [:group-ids [:sequential ms/PositiveInt]]]]
  (t2/select-fn-set :group_id :model/Sandbox :group_id [:in group-ids]))
