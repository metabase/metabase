(ns metabase-enterprise.sandbox.db
  "Application database queries for the sandbox module. Every function that returns `:model/Sandbox` is a direct
  Toucan 2 call with no additional logic; the other queries below return other modules' models and are left as they
  are.

  The Sandbox queries below follow [[::opts]]; queries that do not fit it live in the sandbox-only section at the
  bottom of this namespace."
  (:require
   [metabase-enterprise.sandbox.schema :as sandbox.schema]
   [metabase.app-db.core :as mdb]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.queries.schema :as queries.schema]
   [metabase.users.db :as users.db]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Sandboxes a query applies to. Keys mirror the columns of `:sandboxes`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id       {:optional true} [:or ::lib.schema.id/sandbox [:set ::lib.schema.id/sandbox]]]
   [:group_id {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:table_id {:optional true} [:or ::lib.schema.id/table [:set ::lib.schema.id/table]]]
   [:card_id  {:optional true} [:or ::lib.schema.id/card [:set ::lib.schema.id/card]]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::sandbox.schema/sandbox.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::sandbox.schema/sandbox.column
                                              [:tuple ::sandbox.schema/sandbox.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Sandbox columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-sandboxes :- [:sequential ::sandbox.schema/sandbox.partial]
  "The Sandboxes matching `opts`."
  ([]
   (select-sandboxes nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-sandbox :- [:maybe ::sandbox.schema/sandbox.partial]
  "The first Sandbox matching `opts`, or nil."
  ([]
   (select-one-sandbox nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-sandbox! :- ::sandbox.schema/sandbox
  "Insert `sandbox` and return the new instance."
  [sandbox :- ::sandbox.schema/sandbox.create]
  (t2/insert-returning-instance! :model/Sandbox sandbox))

(mu/defn update-sandboxes! :- :int
  "Apply `changes` to every Sandbox matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::sandbox.schema/sandbox.update]
  (apply t2/update! :model/Sandbox (conj (->kv-args opts) changes)))

(mu/defn delete-sandboxes! :- :int
  "Delete every Sandbox matching `opts`, returning the number deleted."
  [opts :- [:maybe ::opts]]
  (apply t2/delete! :model/Sandbox (->args opts)))

;;; -------------------------------- Queries used only by the sandbox module --------------------------------

(mu/defn select-sandboxes-with-group-ids-for-user
  "The Sandboxes of the groups of the User with `user-id`, each with the `:group_id` of the membership."
  [user-id :- ::lib.schema.id/user]
  (t2/select :model/Sandbox
             {:select    [[:pgm.group_id :group_id]
                          [:s.*]]
              :from      [[:permissions_group_membership :pgm]]
              :left-join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]]
              :where     [:and
                          [:= :pgm.user_id user-id]]}))

(mu/defn select-sandboxes-with-table-info
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

(mu/defn select-candidate-sandboxes-for-groups-and-databases
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

(mu/defn impersonations-for-groups
  "The ConnectionImpersonations of the groups with `group-ids`."
  [group-ids :- [:set ms/PositiveInt]]
  (t2/select :model/ConnectionImpersonation :group_id [:in group-ids]))

(mu/defn user-group-ids
  "The IDs of the groups of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (t2/select-fn-set :group_id :model/PermissionsGroupMembership :user_id user-id))

(mu/defn personal-user
  "The personal User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (users.db/select-one-user {:id user-id :type :personal}))

(mu/defn set-user-login-attributes!
  "Set the login attributes of the User with `user-id`, returning the number of rows updated."
  [user-id          :- ::lib.schema.id/user
   login-attributes :- [:maybe users.schema/LoginAttributes]]
  (users.db/update-users! {:id user-id} {:login_attributes login-attributes}))

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

(mu/defn table
  "The Table with `table-id`, or nil."
  [table-id :- [:maybe ::lib.schema.id/table]]
  (t2/select-one :model/Table :id table-id {:from [(warehouse-schema-overlay/table-query)]}))

(mu/defn tables-of-database
  "The `:id`, `:db_id`, and `:schema` of the Tables of the Database with `db-id`, restricted to `schema` when
  `schema-only?`."
  [db-id        :- ::lib.schema.id/database
   schema-only? :- :boolean
   schema       :- [:maybe :string]]
  (t2/select [:model/Table :id :db_id :schema]
             {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]
              :where [:and
                      [:= :db_id db-id]
                      (when schema-only?
                        [:= :schema schema])]}))

(mu/defn database-of-table
  "The Database of the Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Database
                 :id ^:allow-subquery {:select [:t.db_id]
                                       :from      [(warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})]
                                       :where  [:= :t.id table-id]}))

(mu/defn fields-of-table-named
  "The `:id` and `:name` of the Fields of the Table with `table-id` named one of `field-names`."
  [table-id    :- ::lib.schema.id/table
   field-names :- [:set :string]]
  (t2/select [:model/Field :id :name] :table_id table-id :name [:in field-names] {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]}))

(mu/defn cards-by-id
  "A map of Card ID to the query, result metadata, and schema of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select-pk->fn identity [:model/Card :id :dataset_query :result_metadata :card_schema] :id [:in card-ids]))

(mu/defn cards-result-metadata
  "The `:id`, `:result_metadata`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids :- [:set ::lib.schema.id/card]]
  (t2/select [:model/Card :id :result_metadata :card_schema] :id [:in card-ids]))

(mu/defn card-result-metadata
  "The result metadata of the Card with `card-id`."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one-fn :result_metadata :model/Card :id card-id))

(mu/defn sandboxing-cards
  "The `:id`, `:dataset_query`, `:database_id`, and `:card_schema` of the Cards Sandboxes are built on."
  []
  (t2/select :model/Card
             {:select [:c.id :c.dataset_query :c.database_id :c.card_schema]
              :from   [[(t2/table-name :model/Card) :c]]
              :where  [:exists ^:allow-subquery {:select [[[:inline 1]]]
                                                 :from   [[(t2/table-name :model/Sandbox) :s]]
                                                 :where  [:= :s.card_id :c.id]}]}))

(mu/defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id`, returning the number updated."
  [card-id         :- ::lib.schema.id/card
   result-metadata :- [:maybe ::queries.schema/card.result-metadata]]
  (t2/update! :model/Card card-id {:result_metadata result-metadata}))
