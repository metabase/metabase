(ns metabase-enterprise.data-studio.db
  "Application database queries for the data-studio module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [malli.util :as mut]
   [metabase.audit-app.schema :as audit-app.schema]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema :as warehouse-schema.schema]
   [toucan2.core :as t2]))

(def ^:private TableSelectors
  [:map {:closed true}
   [:database-ids {:optional true} [:maybe [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]]
   [:table-ids    {:optional true} [:maybe [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]]
   [:schema-ids   {:optional true} [:maybe [:or [:set :string] [:sequential :string]]]]])

(defn- table-selectors-expr
  "Matches the Tables selected by `database-ids`, `table-ids`, and `schema-ids` (each `\"<db-id>:<schema>\"`)."
  [{:keys [database-ids table-ids schema-ids]}]
  (let [schema-expr (fn [s]
                      (let [[schema-db-id schema-name] (str/split s #"\:")]
                        [:and [:= :db_id (parse-long schema-db-id)] [:= :schema schema-name]]))]
    (cond-> [:or false]
      (seq database-ids) (conj [:in :db_id (sort database-ids)])
      (seq table-ids)    (conj [:in :id    (sort table-ids)])
      (seq schema-ids)   (conj (into [:or] (map schema-expr) (sort schema-ids))))))

(defn- table-selectors-subquery
  [selectors]
  ^:allow-subquery {:select [:id] :from [(t2/table-name :model/Table)] :where (table-selectors-expr selectors)})

(mu/defn remapped-table-ids-reducible
  "Reducible `:table_id` rows of the Tables reachable from `tables` through FK remapping Dimensions, from the
  `input-field` side to the `output-field` side (`:source_field` or `:target_field`), excluding `tables` themselves.
  `tables` is a set of Table IDs or a selectors map (see [[table-ids-matching-selectors]])."
  [input-field  :- :keyword
   output-field :- :keyword
   tables       :- [:or [:set ms/PositiveInt] TableSelectors]]
  (let [input-table-id  (keyword (name input-field) "table_id")
        output-table-id (keyword (name output-field) "table_id")
        table-ids       (if (map? tables)
                          (table-selectors-subquery tables)
                          tables)
        not-in-tables   (if (map? tables)
                          [:not [:exists (-> table-ids
                                             (assoc :select [1])
                                             (update :where (fn [where]
                                                              [:and where [:= :id output-table-id]])))]]
                          [:not [:in output-table-id tables]])]
    (t2/reducible-query {:select [[output-table-id :table_id]]
                         :from   [[(t2/table-name :model/Dimension) :dim]]
                         :join   [[(t2/table-name :model/Field) :source_field]
                                  [:= :dim.field_id :source_field.id]
                                  [(t2/table-name :model/Field) :target_field]
                                  [:= :dim.human_readable_field_id :target_field.id]]
                         :where  [:and
                                  [:= :dim.type "external"]
                                  [:in input-table-id table-ids]
                                  not-in-tables]})))

(mu/defn table-ids-matching-selectors :- [:maybe [:set ::lib.schema.id/table]]
  "The IDs of the Tables selected by `selectors` (`{:database-ids :table-ids :schema-ids}`) plus, when given, the
  `extra-table-ids` that are unpublished (`:unpublished` mode) or any of them (`:any` mode)."
  [selectors        :- TableSelectors
   extra-table-ids  :- [:maybe [:set ::lib.schema.id/table]]
   extra-mode       :- [:enum :unpublished :any]]
  (t2/select-pks-set :model/Table
                     {:where (let [selector-expr (table-selectors-expr selectors)]
                               (if (seq extra-table-ids)
                                 [:or selector-expr (case extra-mode
                                                      :unpublished [:and [:in :id extra-table-ids] [:= :is_published false]]
                                                      :any         [:in :id extra-table-ids])]
                                 selector-expr))}))

(mu/defn published-table-ids :- [:maybe [:set ::lib.schema.id/table]]
  "The IDs of the published Tables among `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select-pks-set :model/Table :id [:in table-ids] :is_published true))

(mu/defn tables :- [:sequential ::warehouse-schema.schema/table.row]
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/select :model/Table :id [:in table-ids]))

(mu/defn collection :- [:maybe ::collections.schema/collection]
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection collection-id))

(def ^:private LatestTablePublishingEvent
  "Rows returned by [[latest-table-publishing-event]]."
  (mut/select-keys ::audit-app.schema/audit-log [:timestamp :topic :user_id]))

(mu/defn latest-table-publishing-event :- [:maybe LatestTablePublishingEvent]
  "The most recent publish or unpublish AuditLog event for `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/AuditLog :timestamp :topic :user_id]
                 :topic [:in [:table-publish :table-unpublish]]
                 :model "Table"
                 :model_id table-id
                 {:order-by [[:timestamp :desc] [:id :desc]]}))

(def ^:private UserNameAndEmail
  "Rows returned by [[user-name-and-email]]."
  (mut/select-keys ::users.schema/user [:id :first_name :last_name :email :common_name]))

(mu/defn user-name-and-email :- [:maybe UserNameAndEmail]
  "The id, first name, last name, and email of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :first_name :last_name :email] user-id))

(mu/defn publish-tables! :- :int
  "Publish the Tables with `table-ids` into the Collection with `collection-id`, returning the number updated."
  [table-ids     :- [:set ::lib.schema.id/table]
   collection-id :- ::lib.schema.id/collection]
  (t2/update! :model/Table :id [:in table-ids] {:collection_id collection-id, :is_published true}))

(mu/defn unpublish-tables! :- :int
  "Unpublish the Tables with `table-ids` and detach them from their Collection, returning the number updated."
  [table-ids :- [:set ::lib.schema.id/table]]
  (t2/update! :model/Table :id [:in table-ids] {:collection_id nil, :is_published false}))

(mu/defn published-table-visible-to-user? :- :boolean
  "Whether the Table with `table-id` is published in a Collection the User with `user-id` can read."
  [table-id   :- ::lib.schema.id/table
   user-id    :- ::lib.schema.id/user
   superuser? :- :boolean]
  (t2/exists? :model/Table
              {:where [:and
                       [:= :id table-id]
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause
                        :collection_id {} {:current-user-id user-id
                                           :is-superuser?   superuser?})]}))

(mu/defn any-published-table-visible? :- :boolean
  "Whether the current user can read the Collection of any published Table."
  []
  (t2/exists? :model/Table
              {:where [:and
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))

(mu/defn published-table-visible-in-database? :- :boolean
  "Whether the current user can read the Collection of any published Table in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/Table
              {:where [:and
                       [:= :db_id database-id]
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))
