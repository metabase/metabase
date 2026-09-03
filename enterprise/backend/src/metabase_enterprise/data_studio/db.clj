(ns metabase-enterprise.data-studio.db
  "Application database queries for the data-studio module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [clojure.string :as str]
   [metabase.collections.models.collection :as collection]
   [toucan2.core :as t2]))

(defn- table-selectors-where
  "Honey SQL clause matching the Tables selected by `database-ids`, `table-ids`, and `schema-ids` (each
  `\"<db-id>:<schema>\"`)."
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
  ^:allow-subquery {:select [:id] :from [(t2/table-name :model/Table)] :where (table-selectors-where selectors)})

(defn remapped-table-ids-reducible
  "Reducible `:table_id` rows of the Tables reachable from `tables` through FK remapping Dimensions, from the
  `input-field` side to the `output-field` side (`:source_field` or `:target_field`), excluding `tables` themselves.
  `tables` is a set of Table IDs or a selectors map (see [[table-ids-matching-selectors]])."
  [input-field output-field tables]
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

(defn table-ids-matching-selectors
  "The IDs of the Tables selected by `selectors` (`{:database-ids :table-ids :schema-ids}`) plus, when given, the
  `extra-table-ids` that are unpublished (`:unpublished` mode) or any of them (`:any` mode)."
  [selectors extra-table-ids extra-mode]
  (t2/select-pks-set :model/Table
                     {:where (let [where (table-selectors-where selectors)]
                               (if (seq extra-table-ids)
                                 [:or where (case extra-mode
                                              :unpublished [:and [:in :id extra-table-ids] [:= :is_published false]]
                                              :any         [:in :id extra-table-ids])]
                                 where))}))

(defn published-table-ids
  "The IDs of the published Tables among `table-ids`."
  [table-ids]
  (t2/select-pks-set :model/Table :id [:in table-ids] :is_published true))

(defn tables
  "The Tables with `table-ids`."
  [table-ids]
  (t2/select :model/Table :id [:in table-ids]))

(defn collection
  "The Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection collection-id))

(defn publish-tables!
  "Publish the Tables with `table-ids` into the Collection with `collection-id`."
  [table-ids collection-id]
  (t2/update! :model/Table :id [:in table-ids] {:collection_id collection-id, :is_published true}))

(defn unpublish-tables!
  "Unpublish the Tables with `table-ids` and detach them from their Collection."
  [table-ids]
  (t2/update! :model/Table :id [:in table-ids] {:collection_id nil, :is_published false}))

(defn published-table-visible-to-user?
  "Whether the Table with `table-id` is published in a Collection the User with `user-id` can read."
  [table-id user-id superuser?]
  (t2/exists? :model/Table
              {:where [:and
                       [:= :id table-id]
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause
                        :collection_id {} {:current-user-id user-id
                                           :is-superuser?   superuser?})]}))

(defn any-published-table-visible?
  "Whether the current user can read the Collection of any published Table."
  []
  (t2/exists? :model/Table
              {:where [:and
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))

(defn published-table-visible-in-database?
  "Whether the current user can read the Collection of any published Table in the Database with `database-id`."
  [database-id]
  (t2/exists? :model/Table
              {:where [:and
                       [:= :db_id database-id]
                       [:= :is_published true]
                       (collection/visible-collection-filter-clause :collection_id)]}))
