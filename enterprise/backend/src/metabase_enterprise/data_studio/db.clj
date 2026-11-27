(ns metabase-enterprise.data-studio.db
  "Application database queries for the data-studio module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.core :as perms]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.models.table-user-settings :as schema.table-user-settings]
   [toucan2.core :as t2]))

(def ^:private TableSelectors
  [:map {:closed true}
   [:database-ids {:optional true} [:maybe [:or [:set ::lib.schema.id/database] [:sequential ::lib.schema.id/database]]]]
   [:table-ids    {:optional true} [:maybe [:or [:set ::lib.schema.id/table] [:sequential ::lib.schema.id/table]]]]
   [:schema-ids   {:optional true} [:maybe [:or [:set :string] [:sequential :string]]]]])

(defn- table-column
  "The key of `column` qualified with the app-DB table name of `:model/Table`, such as `:metabase_table.id`."
  [column]
  (u/qualified-key (t2/table-name :model/Table) column))

(defn- table-selectors-expr
  "Matches the Tables selected by `database-ids`, `table-ids`, and `schema-ids` (each `\"<db-id>:<schema>\"`)."
  [{:keys [database-ids table-ids schema-ids]}]
  (let [schema-expr (fn [s]
                      (let [[schema-db-id schema-name] (str/split s #"\:")]
                        [:and
                         [:= (table-column :db_id) (parse-long schema-db-id)]
                         [:= (table-column :schema) schema-name]]))]
    (cond-> [:or false]
      (seq database-ids) (conj [:in (table-column :db_id) (sort database-ids)])
      (seq table-ids)    (conj [:in (table-column :id)    (sort table-ids)])
      (seq schema-ids)   (conj (into [:or] (map schema-expr) (sort schema-ids))))))

(defn- table-selectors-subquery
  [selectors]
  ^:allow-subquery {:select [:id] :from [(t2/table-name :model/Table)] :where (table-selectors-expr selectors)})

(defn- remapped-table-ids-query
  "The query of the `:table_id` of the `output-table-id` column of the external Dimensions whose `input-table-id` column
  is in `table-ids`, a list or a subquery, and that match `extra-clause`."
  [input-table-id output-table-id table-ids extra-clause]
  {:select [[output-table-id :table_id]]
   :from   [[(t2/table-name :model/Dimension) :dim]]
   :join   [[(t2/table-name :model/Field) :source_field]
            [:= :dim.field_id :source_field.id]
            [(t2/table-name :model/Field) :target_field]
            [:= :dim.human_readable_field_id :target_field.id]]
   :where  [:and
            [:= :dim.type "external"]
            [:in input-table-id table-ids]
            extra-clause]})

(mu/defn remapped-table-ids-reducible
  "Reducible `:table_id` rows of the Tables reachable from `tables` through FK remapping Dimensions, from the
  `input-field` side to the `output-field` side (`:source_field` or `:target_field`), excluding `tables` themselves.
  `tables` is a set of Table IDs or a selectors map (see [[table-ids-matching-selectors]])."
  [input-field  :- :keyword
   output-field :- :keyword
   tables       :- [:or [:set ms/PositiveInt] TableSelectors]]
  (let [input-table-id  (keyword (name input-field) "table_id")
        output-table-id (keyword (name output-field) "table_id")]
    (if (map? tables)
      (let [subquery (table-selectors-subquery tables)]
        (t2/reducible-query (remapped-table-ids-query input-table-id output-table-id subquery
                                                      [:not [:exists (-> subquery
                                                                         (assoc :select [1])
                                                                         (update :where (fn [where]
                                                                                          [:and where [:= (table-column :id) output-table-id]])))]])))
      (eduction (comp (mapcat #(t2/reducible-query (remapped-table-ids-query input-table-id output-table-id % nil)))
                      (remove (comp tables :table_id)))
                (app-db/select-partitions tables)))))

(mu/defn table-ids-matching-selectors
  "The IDs of the Tables selected by `selectors` (`{:database-ids :table-ids :schema-ids}`) plus, when given, the
  `extra-table-ids` that are unpublished (`:unpublished` mode) or any of them (`:any` mode)."
  [selectors        :- TableSelectors
   extra-table-ids  :- [:maybe [:set ::lib.schema.id/table]]
   extra-mode       :- [:enum :unpublished :any]]
  (let [select-ids  #(t2/select-fn-set :id [:model/Table :id]
                                       {:left-join [[(t2/table-name :model/TableUserSettings) :s] [:= :s.table_id (table-column :id)]]
                                        :where     %})
        extra-expr  (fn [ids]
                      (case extra-mode
                        :unpublished [:and
                                      [:in (table-column :id) ids]
                                      [:or
                                       [:= :s.is_published nil]
                                       [:= :s.is_published false]]]
                        :any         [:in (table-column :id) ids]))]
    (not-empty
     (into #{}
           cat
           [(mapcat (fn [[k values]]
                      (app-db/select-batched #(select-ids (table-selectors-expr {k %})) values))
                    selectors)
            (app-db/select-batched #(select-ids (extra-expr %)) extra-table-ids)]))))

(mu/defn published-table-ids
  "The IDs of the published Tables among `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched-set #(t2/select-fn-set :table_id [:model/TableUserSettings :table_id] :table_id [:in %] :is_published true) table-ids))

(mu/defn tables
  "The Tables with `table-ids`."
  [table-ids :- [:set ::lib.schema.id/table]]
  (app-db/select-batched #(t2/select :model/Table :id [:in %]) table-ids))

(mu/defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one :model/Collection :id collection-id))

(mu/defn collections
  "The Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (app-db/select-batched #(t2/select :model/Collection :id [:in %]) collection-ids))

(mu/defn latest-table-publishing-event
  "The most recent publish or unpublish AuditLog event for `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one [:model/AuditLog :timestamp :topic :user_id]
                 :topic [:in [:table-publish :table-unpublish]]
                 :model "Table"
                 :model_id table-id
                 {:order-by [[:timestamp :desc] [:id :desc]]}))

(mu/defn user-name-and-email
  "The id, first name, last name, and email of the User with `user-id`, or nil."
  [user-id :- ::lib.schema.id/user]
  (t2/select-one [:model/User :id :first_name :last_name :email] :id user-id))

(mu/defn publish-tables!
  "Publish the Tables with `table-ids` into the Collection with `collection-id`, returning the number updated."
  [table-ids     :- [:set ::lib.schema.id/table]
   collection-id :- ::lib.schema.id/collection]
  (schema.table-user-settings/upsert-table-user-settings-for-tables!
   table-ids {:collection_id collection-id, :is_published true}))

(mu/defn unpublish-tables!
  "Unpublish the Tables with `table-ids` and detach them from their Collection, returning the number updated."
  [table-ids :- [:set ::lib.schema.id/table]]
  (schema.table-user-settings/upsert-table-user-settings-for-tables!
   table-ids {:collection_id nil, :is_published false}))

(mu/defn published-table-collection-ids :- [:map-of ::lib.schema.id/table [:maybe ::lib.schema.id/collection]]
  "The Collection id of each published Table among `table-ids`, as `{table-id collection-id}`."
  [table-ids :- [:sequential ::lib.schema.id/table]]
  (app-db/select-batched-map #(t2/select-fn->fn :table_id :collection_id [:model/TableUserSettings :table_id :collection_id]
                                                :table_id [:in %]
                                                :is_published true)
                             table-ids))

(mu/defn published-table-clause :- [:fn vector?]
  "A clause holding when the Table aliased `table-alias` has published settings, aliased `published_settings`, that
  match `settings-clause`."
  [table-alias     :- :keyword
   settings-clause :- [:fn vector?]]
  [:exists ^:allow-subquery {:select [1]
                             :from   [[(t2/table-name :model/TableUserSettings) :published_settings]]
                             :where  [:and
                                      [:= :published_settings.table_id (u/qualified-key table-alias :id)]
                                      [:= :published_settings.is_published true]
                                      settings-clause]}])

(mu/defn published-table-visible-to-user?
  "Whether the Table with `table-id` is published in a Collection the User with `user-id` can read."
  [table-id   :- ::lib.schema.id/table
   user-id    :- ::lib.schema.id/user
   superuser? :- :boolean]
  (t2/exists? :model/TableUserSettings
              {:where [:and
                       [:= :table_id table-id]
                       [:= :is_published true]
                       (perms/visible-collections-filter-clause (u/qualified-key (t2/table-name :model/TableUserSettings) :collection_id)
                                                                {:user-id          user-id
                                                                 :is-superuser?    superuser?
                                                                 :is-data-analyst? false}
                                                                {:root-namespace nil})]}))

(mu/defn any-published-table-visible?
  "Whether the current user can read the Collection of any published Table."
  []
  (t2/exists? :model/TableUserSettings
              {:where [:and
                       [:= :is_published true]
                       (perms/visible-collections-filter-clause (u/qualified-key (t2/table-name :model/TableUserSettings) :collection_id)
                                                                (api/current-user-info)
                                                                {:root-namespace nil})]}))

(mu/defn published-table-visible-in-database?
  "Whether the current user can read the Collection of any published Table in the Database with `database-id`."
  [database-id :- ::lib.schema.id/database]
  (t2/exists? :model/TableUserSettings
              {:join  [[(t2/table-name :model/Table) :t] [:= :t.id (u/qualified-key (t2/table-name :model/TableUserSettings) :table_id)]]
               :where [:and
                       [:= :t.db_id database-id]
                       [:= (u/qualified-key (t2/table-name :model/TableUserSettings) :is_published) true]
                       (perms/visible-collections-filter-clause (u/qualified-key (t2/table-name :model/TableUserSettings) :collection_id)
                                                                (api/current-user-info)
                                                                {:root-namespace nil})]}))
