(ns metabase.permissions.data-permissions.sql
  "Data permissions as SQL: where-clauses selecting, inside one query, the Tables or Databases a user may use. They
  follow the rules of the getters in [[metabase.permissions.data-permissions]]:

  - a group's Database-level row counts for every Table of the Database, and its Table-level rows count for active
    Tables only;
  - across rows and groups the most permissive value wins, except that `:blocked` view-data beats every value but
    `:unrestricted`;
  - on EE, a Table published into a Collection the user can read grants `:perms/create-queries :query-builder`;
  - a superuser sees everything, and so does a data analyst asking for `:perms/manage-table-metadata`."
  (:require
   [metabase.permissions.published-tables :as published-tables]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

(def UserInfo
  "The user-id to use in the visibility query and their superuser status."
  [:map {:closed true}
   [:user-id          pos-int?]
   [:is-superuser?    :boolean]
   [:is-data-analyst? {:optional true} :boolean]])

(def PermissionMapping
  "Map of permission type to the permission value the user needs, or a more permissive one."
  [:map-of ::permissions.schema/data-permission-type ::permissions.schema/data-permission-value])

(def ^:private ColumnOrExp
  "A HoneySQL column reference, or an expression over one, to filter on."
  [:or :keyword vector?])

(def ^:private every-row-clause
  "The filter for a user who sees every row."
  [:= [:inline 1] [:inline 1]])

(mu/defn- value-rank
  "The index of `value` among the values of `perm-type`, 0 being the most permissive."
  [perm-type :- ::permissions.schema/data-permission-type
   value     :- ::permissions.schema/data-permission-value]
  (.indexOf ^PersistentVector (-> permissions.schema/data-permissions perm-type :values) value))

(mu/defn- rank-case
  "A CASE giving the rank (see [[value-rank]]) of the `perm-type` value in `column`."
  [perm-type :- ::permissions.schema/data-permission-type
   column    :- :keyword]
  (into [:case]
        cat
        (for [value (-> permissions.schema/data-permissions perm-type :values)]
          [[:= column (h2x/literal value)] [:inline (value-rank perm-type value)]])))

(defn- sees-every-row?
  "Whether the user of `user-info` sees every Table and Database for `permission-mapping` without asking."
  [{:keys [is-superuser? is-data-analyst?]} permission-mapping]
  (or is-superuser?
      (and is-data-analyst?
           (contains? permission-mapping :perms/manage-table-metadata))))

(def ^:private view-data-priority
  "The view-data values in the order the best of several rows is picked: `:blocked` beats `:legacy-no-self-service`."
  [:unrestricted :blocked :legacy-no-self-service])

(mu/defn- grant-clause
  "A clause holding when the best `perm-type` value of the user's rows is `level` or more permissive, given `holds`, a
  function of a sequence of values returning a clause holding when the user has a row with one of them."
  [perm-type :- ::permissions.schema/data-permission-type
   level     :- ::permissions.schema/data-permission-value
   holds     :- fn?]
  (let [enough? #(<= (value-rank perm-type %) (value-rank perm-type level))]
    (if (= perm-type :perms/view-data)
      ;; the best value is the first one held in priority order, so `v` wins when held and no earlier one is
      (into [:or]
            (keep-indexed (fn [i v]
                            (when (enough? v)
                              (into [:and (holds [v])]
                                    (for [earlier (take i view-data-priority)
                                          :when   (not (enough? earlier))]
                                      [:not (holds [earlier])])))))
            view-data-priority)
      (holds (filter enough? (-> permissions.schema/data-permissions perm-type :values))))))

(defn- rows-exist-clause
  "A clause holding when the user with `user-id` has a `perm-type` row with one of `values` matching `scope-where`."
  [user-id perm-type values scope-where]
  [:exists ^:allow-subquery
   {:select [[[:inline 1] :one]]
    :from   [[:data_permissions :dp]]
    :where  [:and
             [:= :dp.perm_type (h2x/literal perm-type)]
             [:in :dp.perm_value (mapv h2x/literal values)]
             [:in :dp.group_id ^:allow-subquery {:select [:group_id]
                                                 :from   [:permissions_group_membership]
                                                 :where  [:= :user_id [:inline user-id]]}]
             scope-where]}])

(mu/defn visible-tables-filter-clause :- [:fn vector?]
  "A HoneySQL where-clause holding when `column-or-exp` is a Table on which the user of `user-info` has, for each type
  of `permission-mapping`, the required value or a more permissive one. Each Table is probed on its own, through the
  `data_permissions (table_id, ...)` index for its own rows and through its Database's rows, so a query that filters
  a few Tables doesn't work out the permissions of every Table."
  [column-or-exp      :- ColumnOrExp
   user-info          :- UserInfo
   permission-mapping :- PermissionMapping]
  (if (sees-every-row? user-info permission-mapping)
    every-row-clause
    (let [user-id   (:user-id user-info)
          published (when (contains? permission-mapping :perms/create-queries)
                      (published-tables/published-table-perm-grant-rows user-info [:perms/create-queries] false))
          holds     (fn [perm-type]
                      (fn [values]
                        [:or
                         [:and
                          [:= :mt.active true]
                          (rows-exist-clause user-id perm-type values [:= :dp.table_id :mt.id])]
                         (rows-exist-clause user-id perm-type values [:and
                                                                      [:= :dp.db_id :mt.db_id]
                                                                      [:= :dp.table_id nil]])
                         (when (and published
                                    (= perm-type :perms/create-queries)
                                    (some #{:query-builder} values))
                           [:in :mt.id ^:allow-subquery {:select [:id] :from [[published :published]]}])]))]
      [:in column-or-exp
       ^:allow-subquery
       {:select [:mt.id]
        :from   [[(t2/table-name :model/Table) :mt]]
        :where  (into [:and]
                      (map (fn [[perm-type level]] (grant-clause perm-type level (holds perm-type))))
                      permission-mapping)}])))

(mu/defn visible-databases-filter-clause :- [:fn vector?]
  "A HoneySQL where-clause holding when `column-or-exp` is a Database on which the user of `user-info` has, for each
  type of `permission-mapping`, the required value or a more permissive one on some row: the Database's own, or one of
  an active Table of it. Each Database is probed on its own."
  [column-or-exp      :- ColumnOrExp
   user-info          :- UserInfo
   permission-mapping :- PermissionMapping]
  (if (sees-every-row? user-info permission-mapping)
    every-row-clause
    (let [user-id (:user-id user-info)
          holds   (fn [perm-type]
                    (fn [values]
                      [:or
                       (rows-exist-clause user-id perm-type values [:and
                                                                    [:= :dp.db_id :md.id]
                                                                    [:= :dp.table_id nil]])
                       (rows-exist-clause user-id perm-type values
                                          [:and
                                           [:= :dp.db_id :md.id]
                                           [:exists ^:allow-subquery
                                            {:select [[[:inline 1] :one]]
                                             :from   [[(t2/table-name :model/Table) :mt]]
                                             :where  [:and [:= :mt.id :dp.table_id] [:= :mt.active true]]}]])]))]
      [:in column-or-exp
       ^:allow-subquery
       {:select [:md.id]
        :from   [[(t2/table-name :model/Database) :md]]
        :where  (into [:and]
                      (map (fn [[perm-type level]] (grant-clause perm-type level (holds perm-type))))
                      permission-mapping)}])))

(mu/defn select-tables-and-groups-granting-perm
  "Selects the id of each Table, and the group, type and value of each `data_permissions` row of the user of
  `user-info` that applies to it with the required value of its type in `permission-mapping` or a more permissive one,
  for telling which group grants a Table."
  [{:keys [user-id is-superuser?]} :- UserInfo
   permission-mapping              :- PermissionMapping]
  ^:allow-subquery
  {:select [:mt.id :dp.group_id :dp.perm_type :dp.perm_value]
   :from   [[(t2/table-name :model/Table) :mt]]
   :join   [[:data_permissions :dp] [:or
                                     [:and
                                      [:= :mt.db_id :dp.db_id]
                                      [:= :dp.table_id nil]]
                                     [:= :mt.id :dp.table_id]]
            [:permissions_group :pg] [:= :pg.id :dp.group_id]
            [:permissions_group_membership :pgm] [:and
                                                  [:= :pgm.group_id :pg.id]
                                                  [:= :pgm.user_id [:inline user-id]]]]
   :where  (if is-superuser?
             every-row-clause
             (into [:or]
                   (map (fn [[perm-type level]]
                          [:and
                           [:= :dp.perm_type (h2x/literal perm-type)]
                           [:>= [:inline (value-rank perm-type level)] (rank-case perm-type :dp.perm_value)]]))
                   permission-mapping))})
