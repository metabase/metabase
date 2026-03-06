(ns metabase.permissions.models.data-permissions
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.audit-app.core :as audit]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.published-tables :as published-tables]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

(doto :model/DataPermissions
  (derive :metabase/model))

(methodical/defmethod t2/table-name :model/DataPermissions [_model] :data_permissions)

(mu/defn- with-cluster-lock-fn
  [m :- [:map
         [:db-id ms/PositiveInt]
         [:perm-type :string]]
   f :- fn?]
  (cluster-lock/with-cluster-lock (keyword "data-permissions-" (str/join "-"
                                                                         [(:db-id m)
                                                                          (:perm-type m)]))
    (f)))

(defmacro with-cluster-lock
  "Takes a map with `db-id` and `perm-type`, obtains a cluster lock for that combo, and executes the body"
  [m & body]
  `(with-cluster-lock-fn ~m (fn [] ~@body)))

(t2/deftransforms :model/DataPermissions
  {:perm_type  mi/transform-keyword
   :perm-type  mi/transform-keyword
   :perm_value mi/transform-keyword
   ;; define keyword transformation for :type and :value as well so that we can use them as aliases
   :type       mi/transform-keyword
   :value      mi/transform-keyword})

;;; ------------------------------------------- Misc Utils ------------------------------------------------------------

(defn least-permissive-value
  "The *least* permissive value for a given perm type. This value is used as a fallback when a user does not have a
  value for the permission in the database."
  [perm-type]
  (-> permissions.schema/data-permissions perm-type :values last))

(defn most-permissive-value
  "The *most* permissive value for a given perm type. This is the default value for superusers."
  [perm-type]
  (-> permissions.schema/data-permissions perm-type :values first))

(mu/defn at-least-as-permissive?
  "Returns true if value1 is at least as permissive as value2 for the given permission type."
  [perm-type :- ::permissions.schema/data-permission-type
   value1    :- ::permissions.schema/data-permission-value
   value2    :- ::permissions.schema/data-permission-value]
  (let [^PersistentVector values (-> permissions.schema/data-permissions perm-type :values)]
    (<= (.indexOf values value1)
        (.indexOf values value2))))

(def ^:private model-by-perm-type
  "A map from permission types directly to model identifiers (or `nil`)."
  (update-vals permissions.schema/data-permissions :model))

(defn- assert-value-matches-perm-type
  [perm-type perm-value]
  (when-not (contains? (set (get-in permissions.schema/data-permissions [perm-type :values])) perm-value)
    (throw (ex-info (tru "Permission type {0} cannot be set to {1}" perm-type perm-value)
                    {perm-type (permissions.schema/data-permissions perm-type)}))))

;;; ---------------------------------------- Caching ------------------------------------------------------------------

(defn- relevant-permissions-for-user-and-dbs
  "Returns all relevant rows for permissions for the user, excluding permissions for deactivated tables for the given sequence of database ids."
  [user-id db-ids]
  (t2/select :model/DataPermissions
             {:select [:p.* [:pgm.user_id :user_id]]
              :from [[:permissions_group_membership :pgm]]
              :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                     [:data_permissions :p] [:= :p.group_id :pg.id]]
              :left-join [[:metabase_table :mt] [:= :mt.id :p.table_id]]
              :where [:and
                      [:= :pgm.user_id user-id]
                      [:in :p.db_id db-ids]
                      [:or
                       [:= :p.table_id nil]
                       [:= :mt.active true]]]}))

(defn- relevant-permissions-for-user-perm-and-db
  "Returns all relevant rows for a given user, permission type, and db_id, excluding permissions for deactivated
  tables."
  [user-id perm-type db-id]
  (t2/select :model/DataPermissions
             {:select [:p.* [:pgm.user_id :user_id]]
              :from [[:permissions_group_membership :pgm]]
              :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                     [:data_permissions :p] [:= :p.group_id :pg.id]]
              :left-join [[:metabase_table :mt] [:= :mt.id :p.table_id]]
              :where [:and
                      [:= :pgm.user_id user-id]
                      [:= :p.perm_type (u/qualified-name perm-type)]
                      [:= :p.db_id db-id]
                      [:or
                       [:= :p.table_id nil]
                       [:= :mt.active true]]]}))

(def ^:dynamic *permissions-for-user*
  "A dynamically-bound atom containing a cache of data permissions that have been fetched so far for the current user.
   Keys are:
    - :db-ids -> A set of the IDs of databases which have already been fetched.
    - :perms  -> A map of permissions, with the structure `{user-id {perm-type {db-id perms }` so that we NEVER
                 accidentally use the cache of the wrong user, and `perms` are vectors of data_permissions entries.

  When checking permissions, if a DB has not been fetched, it will be added to the cache before the check returns."
  (atom {:db-ids #{} :perms {}}))

(defn prime-db-cache
  "Prime the permissions cache for a given user and database IDs.
  This can be called directly prior to checking the permissions for a large number of databases to improve performance"
  [db-ids]
  (let [{cached-db-ids :db-ids perms :perms} @*permissions-for-user*
        filtered-ids (filter #(not (some #{%} cached-db-ids)) db-ids)]
    (when (seq filtered-ids)
      (let [fetched-perm-rows (relevant-permissions-for-user-and-dbs api/*current-user-id* filtered-ids)
            new-cache (reduce (fn [m {:keys [user_id perm_type db_id] :as row}]
                                (update-in m [user_id perm_type db_id] u/conjv row))
                              perms
                              fetched-perm-rows)]
        (reset! *permissions-for-user*
                {:db-ids (into (or cached-db-ids #{}) db-ids)
                 :perms  new-cache})))))

(defenterprise enforced-sandboxes-for-user
  "Given a user-id, returns the set of sandboxes that should be enforced for the provided user ID. This result is
  cached for the duration of a request. Empty on OSS instances."
  metabase-enterprise.sandbox.api.util
  [_user-id]
  #{})

(def ^:dynamic *sandboxes-for-user*
  "Filled by `enforced-sandboxes-for-user`. Empty on OSS instances, or EE instances without the `sandboxes` feature."
  (delay nil))

(defn sandboxes-for-user
  "Derefs the *sandboxes-for-user* dynamic variable so it can be contained to this namespace"
  []
  @*sandboxes-for-user*)

(defmacro with-relevant-permissions-for-user
  "Populates the `*permissions-for-user*` and `*sandboxes-for-user*` dynamic vars for use by the cache-aware functions
  in this namespace."
  [user-id & body]
  `(binding [*permissions-for-user* (atom {:db-ids #{} :perms {}})
             *sandboxes-for-user*   (delay (enforced-sandboxes-for-user ~user-id))]
     ~@body))

(def ^:dynamic *use-perms-cache?*
  "Bind to `false` to intentionally bypass the permissions cache and fetch data straight from the DB."
  true)

(defmacro disable-perms-cache
  "Intentionally bypass the permissions cache and fetch data straight from the DB."
  {:style/indent 0}
  [& body]
  `(binding [*use-perms-cache?* false]
     ~@body))

(defn- use-cache?
  [user-id]
  (and *use-perms-cache?*
       (= user-id api/*current-user-id*)))

(defn- get-permissions [user-id perm-type db-id]
  (if (use-cache? user-id)
    (do ; Use the cache if we can
      (prime-db-cache [db-id])
      (get-in (:perms @*permissions-for-user*) [user-id perm-type db-id]))
    ;; If we're checking permissions for a *different* user than ourselves, fetch it straight from the DB
    (relevant-permissions-for-user-perm-and-db user-id perm-type db-id)))

;;; ---------------------------------------- Fetching a user's permissions --------------------------------------------

(defmulti coalesce
  "Coalesce a set of permission values into a single value. This is used to determine the permission to enforce for a
  user in multiple groups with conflicting permissions. By default, this returns the *most* permissive value that the
  user has in any group.

  For instance,
  - Given an empty set, we return the most permissive.
    (coalesce :settings-access #{}) => :yes
  - Given a set with values, we select the most permissive option in the set.
    (coalesce :settings-access #{:view :no-access}) => :view"
  {:arglists '([perm-type perm-values])}
  (fn [perm-type _perm-values] perm-type))

(defmethod coalesce :default
  [perm-type perm-values]
  (let [ordered-values (-> permissions.schema/data-permissions perm-type :values)]
    (first (filter (set perm-values) ordered-values))))

(defmethod coalesce :perms/view-data
  [perm-type perm-values]
  (let [perm-values (set perm-values)
        ordered-values (-> permissions.schema/data-permissions perm-type :values)]
    (if (and (perm-values :blocked)
             (not (perm-values :unrestricted)))
      ;; Block in one group overrides `legacy-no-self-service` in another, but not unrestricted
      :blocked
      (first (filter perm-values ordered-values)))))

(defn coalesce-most-restrictive
  "In some cases (fetching schema permissions) we need to coalesce permissions using the most restrictive option."
  [perm-type perm-values]
  (let [ordered-values (-> permissions.schema/data-permissions perm-type :values reverse)]
    (first (filter (set perm-values) ordered-values))))

(defn is-superuser?
  "Returns true if the given user ID is a superuser. Avoids a DB query when checking the current user."
  [user-id]
  (if (= user-id api/*current-user-id*)
    api/*is-superuser?*
    (t2/select-one-fn :is_superuser :model/User :id user-id)))

(defn is-data-analyst?
  "Returns true if the given user ID is a data analyst. Avoids a DB query when checking the current user."
  [user-id]
  (if (= user-id api/*current-user-id*)
    api/*is-data-analyst?*
    (t2/select-one-fn :is_data_analyst :model/User :id user-id)))

(mu/defn database-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective permission value for a given user, permission type, and database ID. If the user has
  multiple permissions for the given type in different groups, they are coalesced into a single value."
  [user-id perm-type database-id]
  (when (not= :model/Database (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (if (is-superuser? user-id)
    (most-permissive-value perm-type)
    (let [perm-values (->> (get-permissions user-id perm-type database-id)
                           (map :perm_value)
                           (into #{}))]
      (or (coalesce perm-type perm-values)
          (least-permissive-value perm-type)))))

(mu/defn user-has-permission-for-database? :- :boolean
  "Returns a Boolean indicating whether the user has the specified permission value for the given database ID and table ID,
   or a more permissive value."
  [user-id perm-type perm-value database-id]
  (at-least-as-permissive? perm-type
                           (database-permission-for-user user-id perm-type database-id)
                           perm-value))

(def ^:dynamic *additional-table-permissions*
  "See the `with-additional-table-permission` macro below."
  {})

(defmacro with-additional-table-permission
  "Sometimes, for sandboxing, we need to run something in a context with additional permissions - for example, so that a
  user can read a table to which they have only sandboxed access.

  I intentionally did *not* build this as a general-purpose 'add an additional context' macro, because supporting it
  for every function in the DataPermission API will be challenging, and the API is still in flux. Instead, for now,
  this is a very tightly constrained macro that only adds an additional *table* level permission, and only affects the
  output of `table-permission-for-user`."
  [perm-type database-id table-id perm-value & form]
  `(binding [*additional-table-permissions* (assoc-in *additional-table-permissions*
                                                      [~database-id ~table-id ~perm-type]
                                                      ~perm-value)]
     ~@form))

(defn- get-additional-table-permission! [{:keys [db-id table-id]} perm-type]
  (get-in *additional-table-permissions* [db-id table-id perm-type]))

(mu/defn table-permission-for-groups :- ::permissions.schema/data-permission-value
  "Returns the effective permission value provided by a set of *group-ids*, for a provided permission type, database
  ID, and table ID."
  [group-ids perm-type database-id table-id]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is not a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (let [perm-values (t2/select-fn-set :value
                                      :model/DataPermissions
                                      {:select [[:p.perm_value :value]]
                                       :from [[:data_permissions :p]]
                                       :where [:and
                                               [:in :p.group_id group-ids]
                                               [:= :p.perm_type (u/qualified-name perm-type)]
                                               [:= :p.db_id database-id]
                                               [:or
                                                [:= :table_id table-id]
                                                [:= :table_id nil]]]})]
    (or (coalesce perm-type (conj perm-values (get-additional-table-permission! {:db-id database-id :table-id table-id}
                                                                                perm-type)))
        (least-permissive-value perm-type))))

(mu/defn groups-have-permission-for-table? :- :boolean
  "Returns a Boolean indicating whether the provided groups grant the specified permission level or higher for the given
  table ID, or a more permissive value. (i.e. if a user is in all of these groups, would they have this permission?)"
  [group-ids perm-type perm-value database-id table-id]
  (at-least-as-permissive? perm-type
                           (table-permission-for-groups group-ids perm-type database-id table-id)
                           perm-value))

(mu/defn table-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective permission value for a given user, permission type, and database ID, and table ID. If the user
  has multiple permissions for the given type in different groups, they are coalesced into a single value."
  [user-id perm-type database-id table-id]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is a database-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (cond
    (is-superuser? user-id)
    (most-permissive-value perm-type)

    (and (= perm-type :perms/manage-table-metadata)
         (is-data-analyst? user-id))
    (most-permissive-value perm-type)

    :else
    (let [perm-values (into #{}
                            (comp (filter #(or (= (:table_id %) table-id)
                                               (nil? (:table_id %))))
                                  (map :perm_value))
                            (get-permissions user-id perm-type database-id))
          table-perm (coalesce perm-type (conj perm-values (get-additional-table-permission! {:db-id database-id :table-id table-id}
                                                                                             perm-type)))]
      (or (when-not (= table-perm (least-permissive-value perm-type))
            table-perm)
          (when (pos-int? table-id)
            (published-tables/user-published-table-permission perm-type table-id))
          (least-permissive-value perm-type)))))

(mu/defn user-has-permission-for-table? :- :boolean
  "Returns a Boolean indicating whether the user has the specified permission value for the given database ID and table ID,
   or a more permissive value."
  [user-id perm-type perm-value database-id table-id]
  (at-least-as-permissive? perm-type
                           (table-permission-for-user user-id perm-type database-id table-id)
                           perm-value))

(defn- most-restrictive-per-group
  "Given a perm-type and a collection of maps that look like `{:group-id 1 :value :permission-value}`, returns a set
  containing the most restrictive permission value in each group."
  [perm-type perms]
  (->> perms
       (group-by :group-id)
       (m/map-vals (fn [ps]
                     (->> ps (map :value) set (coalesce-most-restrictive perm-type))))
       vals
       set))

(mu/defn full-schema-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective *schema-level* permission value for a given user, permission type, and database ID, and
  schema name. If the user has multiple permissions for the given type in different groups, they are coalesced into a
  single value. The schema-level permission is the *most* restrictive table-level permission within that schema."
  [user-id perm-type database-id schema-name]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is not a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (cond
    (is-superuser? user-id)
    (most-permissive-value perm-type)

    (and (= perm-type :perms/manage-table-metadata)
         (is-data-analyst? user-id))
    (most-permissive-value perm-type)

    :else
    ;; The schema-level permission is the most-restrictive table-level permission within a schema. So for each group,
    ;; select the most-restrictive table-level permission. Then use normal coalesce logic to select the *least*
    ;; restrictive group permission.
    (let [perm-values (most-restrictive-per-group
                       perm-type
                       (->> (get-permissions user-id perm-type database-id)
                            (filter #(or (= (:schema_name %) schema-name)
                                         (nil? (:table_id %))))
                            (map #(set/rename-keys % {:group_id :group-id
                                                      :perm_value :value}))
                            (map #(select-keys % [:group-id :value]))))]
      (or (coalesce perm-type perm-values)
          (least-permissive-value perm-type)))))

(mu/defn full-db-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective *db-level* permission value for a given user, permission type, and database ID. If the user
  has multiple permissions for the given type in different groups, they are coalesced into a single value. The
  db-level permission is the *most* restrictive table-level permission within that database."
  [user-id perm-type database-id]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is not a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (cond
    (is-superuser? user-id)
    (most-permissive-value perm-type)

    (and (= perm-type :perms/manage-table-metadata)
         (is-data-analyst? user-id))
    (most-permissive-value perm-type)

    :else
    ;; The DB-level permission is the most-restrictive table-level permission within a DB. So for each group, select the
    ;; most-restrictive table-level permission. Then use normal coalesce logic to select the *least* restrictive group
    ;; permission.
    (let [perm-values (most-restrictive-per-group
                       perm-type
                       (->> (get-permissions user-id perm-type database-id)
                            (map #(set/rename-keys % {:group_id :group-id
                                                      :perm_value :value}))
                            (map #(select-keys % [:group-id :value]))))]
      (or (coalesce perm-type perm-values)
          (least-permissive-value perm-type)))))

(mu/defn schema-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective *schema-level* permission value for a given user, permission type, and database ID, and
  schema name. If the user has multiple permissions for the given type in different groups, they are coalesced into a
  single value. The schema-level permission is the *least* restrictive table-level permission within that schema.

  For databases without a schema, the schema name will be nil, but we want to compare that against the empty string instead."
  [user-id perm-type database-id schema-name :- [:maybe :string]]
  (let [schema-name (or schema-name "")]
    (when (not= :model/Table (model-by-perm-type perm-type))
      (throw (ex-info (tru "Permission type {0} is not a table-level permission." perm-type)
                      {perm-type (permissions.schema/data-permissions perm-type)})))
    (cond
      (is-superuser? user-id)
      (most-permissive-value perm-type)

      (and (= perm-type :perms/manage-table-metadata)
           (is-data-analyst? user-id))
      (most-permissive-value perm-type)

      :else
      ;; The schema-level permission is the most-restrictive table-level permission within a schema. So for each group,
      ;; select the most-restrictive table-level permission. Then use normal coalesce logic to select the *least*
      ;; restrictive group permission.
      (let [perm-values (->> (get-permissions user-id perm-type database-id)
                             (filter #(or (= (:schema_name %) schema-name)
                                          (nil? (:table_id %))))
                             (map :perm_value)
                             (into #{}))]
        (or (coalesce perm-type perm-values)
            (least-permissive-value perm-type))))))

(mu/defn user-has-permission-for-schema? :- :boolean
  "Returns a Boolean indicating whether the user has the specified permission value for the given database ID and schema,
   or a more permissive value."
  [user-id perm-type perm-value database-id schema]
  (at-least-as-permissive? perm-type
                           (schema-permission-for-user user-id perm-type database-id schema)
                           perm-value))

(mu/defn most-permissive-database-permission-for-user :- ::permissions.schema/data-permission-value
  "Similar to checking _partial_ permissions with permissions paths - what is the *most permissive* permission the
  user has on any of the tables within this database?"
  [user-id perm-type database-id]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is not a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (cond
    (is-superuser? user-id)
    (most-permissive-value perm-type)

    (and (= perm-type :perms/manage-table-metadata)
         (is-data-analyst? user-id))
    (most-permissive-value perm-type)

    :else
    (let [perm-values (->> (get-permissions user-id perm-type database-id)
                           (map :perm_value)
                           (into #{}))]
      (or (coalesce perm-type perm-values)
          (least-permissive-value perm-type)))))

(mu/defn native-download-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective download permission value for a given user and database ID, for native queries on the database.
  For each group, the native download permission for a database is equal to the lowest permission level of any table in
  the database."
  [user-id     :- ::lib.schema.id/user
   database-id :- ::lib.schema.id/database]
  (if (is-superuser? user-id)
    (most-permissive-value :perms/download-results)
    (let [perm-values
          (->> (get-permissions user-id :perms/download-results database-id)
               (map (fn [{:keys [perm_value group_id]}]
                      {:group_id group_id :value perm_value})))

          value-by-group
          (-> (group-by :group_id perm-values)
              (update-vals (fn [perms]
                             (let [values (set (map :value perms))]
                               (coalesce-most-restrictive :perms/download-results values)))))]
      (or (coalesce :perms/download-results (vals value-by-group))
          (least-permissive-value :perms/download-results)))))

(mu/defn user-has-any-perms-of-type? :- :boolean
  "Returns a Boolean indicating whether the user has the highest level of access for the given permission type in any
  group, for at least one database or table. Optionally takes `:exclude-db-ids` to exclude specific databases from the check."
  [user-id perm-type & {:keys [exclude-db-ids]}]
  (or (is-superuser? user-id)
      (and (= perm-type :perms/manage-table-metadata)
           (is-data-analyst? user-id))
      (let [value (most-permissive-value perm-type)]
        (t2/exists? :model/DataPermissions
                    {:select [[:p.perm_value :value]]
                     :from [[:permissions_group_membership :pgm]]
                     :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                            [:data_permissions :p]   [:= :p.group_id :pg.id]]
                     :where (into [:and
                                   [:= :pgm.user_id user-id]
                                   [:= :p.perm_type (u/qualified-name perm-type)]
                                   [:= :p.perm_value (u/qualified-name value)]]
                                  (when (seq exclude-db-ids)
                                    [[:not-in :p.db_id exclude-db-ids]]))}))))

(defn- admin-permission-graph
  "Returns the graph representing admin permissions for all groups"
  [& {:keys [db-id perm-type]}]
  (let [db-ids     (if db-id [db-id] (t2/select-pks-vec :model/Database))
        perm-types (if perm-type [perm-type] (keys permissions.schema/data-permissions))]
    (into {} (map (fn [db-id]
                    [db-id (into {} (map (fn [perm] [perm (most-permissive-value perm)])
                                         perm-types))])
                  db-ids))))

(mu/defn permissions-for-user
  "Returns a graph representing the permissions for a single user. Can be optionally filtered by database ID and/or permission type.
  Combines permissions from multiple groups into a single value for each DB/table and permission type.

  This is intended to be used for logging and debugging purposes, to see what a user's real permissions are at a glance. Enforcement
  should happen via `database-permission-for-user` and `table-permission-for-user`."
  [user-id & {:keys [db-id perm-type]}]
  (if (is-superuser? user-id)
    (admin-permission-graph :db-id db-id :perm-type perm-type)
    (let [data-perms    (t2/select :model/DataPermissions
                                   {:select [[:p.perm_type :perm-type]
                                             [:p.group_id :group-id]
                                             [:p.perm_value :value]
                                             [:p.db_id :db-id]
                                             [:p.table_id :table-id]]
                                    :from [[:permissions_group_membership :pgm]]
                                    :join [[:permissions_group :pg] [:= :pg.id :pgm.group_id]
                                           [:data_permissions :p]   [:= :p.group_id :pg.id]]
                                    :where [:and
                                            [:= :pgm.user_id user-id]
                                            (when db-id [:= :db_id db-id])
                                            (when perm-type [:= :perm_type (u/qualified-name perm-type)])]})
          path->perms     (group-by (fn [{:keys [db-id perm-type table-id]}]
                                      (if table-id
                                        [db-id perm-type table-id]
                                        [db-id perm-type]))
                                    data-perms)
          coalesced-perms (reduce-kv
                           (fn [result path perms]
                             ;; Combine permissions from multiple groups into a single value
                             (let [[db-id perm-type] path
                                   coalesced-perms (coalesce perm-type
                                                             (concat
                                                              (map :value perms)
                                                              (map :value (get path->perms [db-id perm-type]))))]
                               (assoc result path coalesced-perms)))
                           {}
                           path->perms)
          granular-graph  (reduce
                           (fn [graph [[db-id perm-type table-id] value]]
                             (let [current-perms (get-in graph [db-id perm-type])
                                   updated-perms (if table-id
                                                   (if (keyword? current-perms)
                                                     {table-id value}
                                                     (assoc current-perms table-id value))
                                                   (if (map? current-perms)
                                                     current-perms
                                                     value))]
                               (assoc-in graph [db-id perm-type] updated-perms)))
                           {}
                           coalesced-perms)]
      (reduce (fn [new-graph [db-id perms]]
                (assoc new-graph db-id
                       (reduce (fn [new-perms [perm-type value]]
                                 (if (and (map? value)
                                          (apply = (vals value)))
                                   (assoc new-perms perm-type (first (vals value)))
                                   (assoc new-perms perm-type value)))
                               {}
                               perms)))
              {}
              granular-graph))))

;;; --------------------------------------------- Updating permissions ------------------------------------------------

(defn- assert-valid-permission
  [{:keys [perm_type perm_value] :as permission}]
  (when-not (mr/validate ::permissions.schema/data-permission-type perm_type)
    (throw (ex-info (str/join (mu/explain ::permissions.schema/data-permission-type perm_type)) permission)))
  (assert-value-matches-perm-type perm_type perm_value))

(t2/define-before-insert :model/DataPermissions
  [permission]
  (assert-valid-permission permission)
  permission)

(t2/define-before-update :model/DataPermissions
  [_permission]
  (throw (Exception. (tru "You cannot update a permissions entry! Delete it and create a new one."))))

(def ^:private TheIdable
  "An ID, or something with an ID."
  [:or pos-int? [:map [:id pos-int?]]])

(mu/defn- build-database-permission
  "Builds a sequence of DataPermissions models to delete and insert for setting a single permission to a specified
  value for a given group and database. If a permission value already exists for the specified group and object,
  it will be updated to the new value.

  Block permissions (i.e. :perms/view-data :blocked) can be set at the table or database-level.

  Returns a map with keys:
  - :to-delete - sequence of DataPermissions models to delete
  - :to-insert - sequence of DataPermissions models to insert "
  [group-or-id :- TheIdable
   db-or-id    :- TheIdable
   perm-type   :- ::permissions.schema/data-permission-type
   value       :- :keyword]
  (let [group-id (u/the-id group-or-id)
        db-id    (u/the-id db-or-id)
        existing-perms (t2/select :model/DataPermissions
                                  :perm_type perm-type
                                  :group_id group-id
                                  :db_id db-id)
        new-perm {:perm_type  perm-type
                  :group_id   group-id
                  :perm_value value
                  :db_id      db-id}
        recursive-calls (cond-> []
                          (and (= perm-type :perms/create-queries) (not= value :no))
                          (conj (build-database-permission group-or-id db-or-id :perms/view-data :unrestricted))

                          (= [:perms/view-data :blocked] [perm-type value])
                          (into [(build-database-permission group-or-id db-or-id :perms/create-queries :no)
                                 (build-database-permission group-or-id db-or-id :perms/download-results :no)])

                          (and (= perm-type :perms/view-data) (not= value :unrestricted))
                          (conj (build-database-permission group-or-id db-or-id :perms/transforms :no))

                          (and (= perm-type :perms/create-queries) (not= value :query-builder-and-native))
                          (conj (build-database-permission group-or-id db-or-id :perms/transforms :no)))]
    (apply merge-with concat
           {:to-delete existing-perms
            :to-insert [new-perm]}
           recursive-calls)))

(def ^:private permission-batch-size 1000)

(defn- batch-insert-permissions!
  "In certain cases, when updating the permissions for many tables at once, we need to batch the insertions to avoid
  hitting database limits for the number of parameters in a prepared statement. This is only really applicable when a DB
  has more than ~10k tables and we're transitioning from database-level permissions to table-level permissions."
  [new-perms]
  (doseq [batched-new-perms (partition-all permission-batch-size new-perms)]
    (t2/insert! :model/DataPermissions batched-new-perms)))

(defn- batch-delete-permissions!
  "Much like on insert, sometimes we have to delete more permission models than the psql limit of MAX 16-bit parameters.
  This batches our deletes into groups of `permission-batch-size`."
  [to-delete-ids]
  (doseq [batched-to-delete-ids (partition-all permission-batch-size to-delete-ids)]
    (t2/delete! :model/DataPermissions :id [:in batched-to-delete-ids])))

(mu/defn set-database-permission!
  "Set a single permission to a specified
  value for a given group and database. If a permission value already exists for the specified group and object,
  it will be updated to the new value.

  Block permissions (i.e. :perms/view-data :blocked) can be set at the table or database-level."
  [group-or-id :- TheIdable
   db-or-id    :- TheIdable
   perm-type   :- ::permissions.schema/data-permission-type
   value       :- :keyword]
  (with-cluster-lock {:db-id     (u/the-id db-or-id)
                      :perm-type (u/qualified-name perm-type)}
    (let [{:keys [to-insert to-delete]} (build-database-permission group-or-id db-or-id perm-type value)]
      (when (seq to-delete)
        (batch-delete-permissions! (map :id to-delete)))
      (when (seq to-insert)
        (batch-insert-permissions! to-insert)))))

(defn- lowest-permission-level-in-any-database
  "Given a group and a permission type, returns the lowest permission level for that group in any database, at the DB or table-level.
  This is used to determine the default permission level for the group when a new database is added."
  [group-id perm-type]
  (let [lowest-to-highest-values (-> permissions.schema/data-permissions perm-type :values reverse)]
    (first (filter
            (fn [value]
              (t2/exists? :model/DataPermissions
                          :perm_type perm-type
                          :perm_value value
                          :group_id group-id))
            lowest-to-highest-values))))

(defenterprise new-group-view-data-permission-level
  "Returns the default view-data permission level for a new group for a given database. On OSS, this is always `unrestricted`."
  metabase-enterprise.advanced-permissions.common
  [_group-id]
  :unrestricted)

(defn- new-group-permissions
  "Returns a map of {perm-type value} to be set for a new group, for the provided database."
  [db-or-id all-users-group-id]
  (let [db-id                (u/the-id db-or-id)
        view-data-level      (new-group-view-data-permission-level db-id)
        create-queries-level (or (->> (t2/select-fn-set :value
                                                        [:model/DataPermissions [:perm_value :value]]
                                                        :perm_type :perms/create-queries
                                                        :db_id db-id
                                                        :group_id all-users-group-id)
                                      (coalesce-most-restrictive :perms/create-queries))
                                 :query-builder-and-native)
        download-level      (or (->> (t2/select-fn-set :value
                                                       [:model/DataPermissions [:perm_value :value]]
                                                       :perm_type :perms/download-results
                                                       :db_id db-id
                                                       :group_id all-users-group-id)
                                     (coalesce-most-restrictive :perms/download-results))
                                :one-million-rows)]
    {:perms/view-data view-data-level
     :perms/create-queries create-queries-level
     :perms/download-results download-level
     :perms/manage-table-metadata :no
     :perms/manage-database :no}))

(defn set-external-group-permissions!
  "Sets the appropriate data permissions for a new external group or database - always the minimum possible data permissions."
  [group-or-id db-id]
  (doseq [[perm-type perm-value] (m/map-vals (fn [{:keys [values]}] (last values)) permissions.schema/data-permissions)]
    (set-database-permission! group-or-id db-id perm-type perm-value)))

(defn set-new-group-permissions!
  "Sets permissions for a newly-added group to their appropriate values for a single database. This is generally based
  on the permissions of the All Users group."
  [group-or-id db-or-id all-users-group-id]
  (doseq [[perm-type perm-value] (new-group-permissions db-or-id all-users-group-id)]
    (set-database-permission! group-or-id db-or-id perm-type perm-value)))

(defenterprise new-database-view-data-permission-level
  "Returns the default view-data permission level for a new database for a given group. On OSS, this is always `unrestricted`."
  metabase-enterprise.advanced-permissions.common
  [_group-id]
  :unrestricted)

(defn- new-database-permissions
  "Returns a map of {perm-type value} to be set for a new database, for the provided group."
  [group-or-id]
  (let [group-id             (u/the-id group-or-id)
        view-data-level      (new-database-view-data-permission-level group-id)
        create-queries-level (or (lowest-permission-level-in-any-database group-id :perms/create-queries)
                                 :query-builder-and-native)
        download-level       (if (= view-data-level :blocked)
                               :no
                               (or (lowest-permission-level-in-any-database group-id :perms/download-results)
                                   :one-million-rows))]
    {:perms/view-data view-data-level
     :perms/create-queries create-queries-level
     :perms/download-results download-level
     :perms/manage-table-metadata :no
     :perms/manage-database :no}))

(defn set-new-database-permissions!
  "Sets permissions for a newly-added database to their appropriate values for a single group. For certain permission
  types, the value computed based on the existing permissions the group has for other databases."
  [group-or-id db-or-id]
  (doseq [[perm-type perm-value] (new-database-permissions group-or-id)]
    (set-database-permission! group-or-id db-or-id perm-type perm-value)))

(defn- build-new-table-perms
  "Builds new permission entries for the given table permissions."
  [group-id perm-type table-perms]
  (map (fn [[table value]]
         (let [{:keys [id db_id schema]}
               (if (map? table)
                 table
                 (t2/select-one [:model/Table :id :db_id :schema] :id table))]
           {:perm_type   perm-type
            :group_id    group-id
            :perm_value  value
            :db_id       db_id
            :table_id    id
            :schema_name schema}))
       table-perms))

(declare build-table-permissions)

(defn- build-recursive-table-calls
  "Builds recursive calls for related permissions based on permission type and table permissions."
  [group-or-id perm-type table-perms]
  (cond-> []
    (= perm-type :perms/create-queries)
    (conj (build-table-permissions group-or-id :perms/view-data
                                   (-> (filter (fn [[_ value]] (not= value :no)) table-perms)
                                       keys
                                       (zipmap (repeat :unrestricted)))))

    (= :perms/view-data perm-type)
    (into [(build-table-permissions group-or-id :perms/create-queries
                                    (-> (filter (fn [[_ value]] (= value :blocked)) table-perms)
                                        keys
                                        (zipmap (repeat :no))))
           (build-table-permissions group-or-id :perms/download-results
                                    (-> (filter (fn [[_ value]] (= value :blocked)) table-perms)
                                        keys
                                        (zipmap (repeat :no))))])))

(defn- handle-existing-db-permission
  "Handles the case where there's an existing database-level permission."
  [existing-db-perm values group-id perm-type db-id table-ids new-perms]
  (let [existing-db-perm-value (:perm_value existing-db-perm)]
    (if (= values #{existing-db-perm-value})
      {:to-delete [] :to-insert []}
      ;; If we're setting any table permissions to a value that is different from the database-level permission,
      ;; we need to replace it with individual permission rows for every table in the database instead.
      (let [other-new-perms (->> (t2/select :model/Table {:where
                                                          [:and
                                                           [:= :db_id db-id]
                                                           ;; We can't filter out *everything* here because
                                                           ;; max number of parameters is capped. But we might
                                                           ;; as well filter out what we can (conservatively).
                                                           [:not [:in :id (take 10000 table-ids)]]]})
                                 (keep (fn [table]
                                         ;; See above: we filtered out what we could in the database, but if
                                         ;; the number of tables is large we need to filter them out in
                                         ;; Clojure.
                                         (when-not (contains? table-ids (:id table))
                                           {:perm_type   perm-type
                                            :group_id    group-id
                                            :perm_value  (case existing-db-perm-value
                                                           ;; If the previous database-level permission can't be set at
                                                           ;; the table-level, we need to provide a new default
                                                           :query-builder-and-native :query-builder
                                                           existing-db-perm-value)
                                            :db_id       db-id
                                            :table_id    (:id table)
                                            :schema_name (:schema table)}))))]
        {:to-delete [existing-db-perm]
         :to-insert (concat other-new-perms new-perms)}))))

(defn- handle-no-db-permission
  "Handles the case where there's no existing database-level permission."
  [group-id db-id perm-type table-ids values new-perms]
  (let [existing-table-perms (t2/select :model/DataPermissions
                                        {:where [:and
                                                 [:= :group_id group-id]
                                                 [:= :db_id db-id]
                                                 [:= :perm_type (u/qualified-name perm-type)]
                                                 [:not= :table_id nil]
                                                 [:not [:in :table_id table-ids]]]})
        existing-table-values (set (map :perm_value existing-table-perms))]
    (if (and (= (count existing-table-values) 1)
             (= values existing-table-values))
      ;; If all tables would have the same permissions after we update these ones, we can replace all of the table
      ;; perms with a DB-level perm instead.
      (build-database-permission group-id db-id perm-type (first values))
      ;; Otherwise, just replace the rows for the individual table perm
      (let [table-perms-to-delete (t2/select :model/DataPermissions
                                             {:where [:and
                                                      [:= :perm_type (u/qualified-name perm-type)]
                                                      [:= :group_id group-id]
                                                      [:in :table_id table-ids]]})]
        {:to-delete table-perms-to-delete
         :to-insert new-perms}))))

(mu/defn- build-table-permissions
  "Builds a sequence of DataPermissions models to delete and insert for setting

  Returns a map with keys:
  - :to-delete - sequence of DataPermissions models to delete
  - :to-insert - sequence of DataPermissions models to insert "
  [group-or-id :- TheIdable
   perm-type   :- ::permissions.schema/data-permission-type
   table-perms :- [:map-of TheIdable :keyword]]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} cannot be set on tables." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (if (empty? table-perms)
    ;; if `table-perms` is empty, there's nothing to do
    {:to-delete [] :to-insert []}
    (let [values           (set (vals table-perms))
          group-id         (u/the-id group-or-id)
          new-perms        (build-new-table-perms group-id perm-type table-perms)
          table-ids        (set (map :table_id new-perms))
          db-id            (:db_id (first new-perms))]
      (when (not= (count (set (map :db_id new-perms))) 1)
        (throw (ex-info (tru "All tables must belong to the same database.")
                        {:new-perms new-perms})))
      (apply merge-with concat
             (if-let [existing-db-perm (t2/select-one :model/DataPermissions
                                                      {:where
                                                       [:and
                                                        [:= :perm_type (u/qualified-name perm-type)]
                                                        [:= :group_id  group-id]
                                                        [:= :db_id     db-id]
                                                        [:= :table_id  nil]]})]
               (handle-existing-db-permission existing-db-perm
                                              values
                                              group-id
                                              perm-type
                                              db-id
                                              table-ids
                                              new-perms)
               (handle-no-db-permission group-id
                                        db-id
                                        perm-type
                                        table-ids
                                        values
                                        new-perms))
             (build-recursive-table-calls group-or-id perm-type table-perms)))))

(mu/defn- set-table-permissions-internal!
  "For internal use only - assumes that the cluster lock has already been obtained and sets table permissions."
  [group-or-id :- TheIdable
   perm-type   :- ::permissions.schema/data-permission-type
   table-perms :- [:map-of TheIdable :keyword]]
  (let [{:keys [to-delete to-insert]} (build-table-permissions group-or-id perm-type table-perms)]
    (when (seq to-delete)
      (batch-delete-permissions! (map :id to-delete)))
    (when (seq to-insert)
      (batch-insert-permissions! to-insert))))

(mu/defn set-table-permissions!
  "Sets table permissions to specified values for a given group. If a permission value already exists for a specified group and table,
  it will be updated to the new value.

  `table-perms` is a map from tables or table ID to the permission value for each table. All tables in the list must
  belong to the same database, or this will throw.

  If this permission is currently set at the database-level, the database-level permission
  is removed and table-level rows are are added for all of its tables. Similarly, if setting a table-level permission to a value
  that results in all of the database's tables having the same permission, it is replaced with a single database-level row."
  [group-or-id :- TheIdable
   perm-type   :- ::permissions.schema/data-permission-type
   table-perms :- [:map-of TheIdable :keyword]]
  ;; you can't use `set-table-permissions!` with tables from different databases, so this is safe.
  (let [table-or-id (first (keys table-perms))
        db-id (if (map? table-or-id)
                (:db_id table-or-id)
                (t2/select-one-fn :db_id :model/Table table-or-id))]
    (with-cluster-lock {:perm-type (u/qualified-name perm-type)
                        :db-id db-id}
      (set-table-permissions-internal! group-or-id perm-type table-perms))))

(mu/defn set-table-permission!
  "Sets permissions for a single table to the specified value for a given group."
  [group-or-id :- TheIdable
   table-or-id :- TheIdable
   perm-type   :- ::permissions.schema/data-permission-type
   value       :- :keyword]
  (set-table-permissions! group-or-id perm-type {table-or-id value}))

(defn- schema-permission-value
  "Infers the permission value for a new table based on existing permissions in the schema. Returns a permission value
  if every table in the schema has the same value, otherwise returns nil."
  [db-id group-id schema-name perm-type]
  (let [possible-values    (:values (get permissions.schema/data-permissions perm-type))
        schema-perms-check (mapv (fn [value]
                                   (t2/exists? :model/DataPermissions
                                               :perm_type   (u/qualified-name perm-type)
                                               :db_id       db-id
                                               :group_id    group-id
                                               :schema_name schema-name
                                               :perm_value  value))
                                 possible-values)
        single-perm-val?   (= (count (filter true? schema-perms-check)) 1)]
    (when single-perm-val?
      (nth possible-values (.indexOf ^PersistentVector schema-perms-check true)))))

(defenterprise new-table-view-data-permission-level
  "Returns the view-data permission level to set for a new table in a given group and database. On OSS, this is always
  `unrestricted`."
  metabase-enterprise.advanced-permissions.common
  [_db-id _group-id]
  :unrestricted)

(mu/defn set-new-table-permissions!
  "Sets permissions for a single table all the provided groups, based on the following rules:
    - :view-data is set to :blocked if any other tables in the DB are :blocked or sandboxed
    - If all existing tables in the schema have the same permission value, the new table is set to match them.
    - If permissions are set at the DB-level, no table permission is inserted.
    - Otherwise we use the provided `default-value`."
  [groups-or-ids :- [:sequential TheIdable]
   table-or-id   :- TheIdable
   perm-type     :- ::permissions.schema/data-permission-type
   default-value :- :keyword]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} cannot be set on tables." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (when (seq groups-or-ids)
    (let [table (if (map? table-or-id)
                  table-or-id
                  (t2/select-one [:model/Table :id :db_id :schema] :id table-or-id))
          db-id (:db_id table)
          group-ids (map u/the-id groups-or-ids)]
      (with-cluster-lock {:db-id db-id :perm-type (u/qualified-name perm-type)}
        (let [schema-name            (:schema table)
              db-level-perms         (t2/select :model/DataPermissions
                                                {:where
                                                 [:and
                                                  [:= :db_id db-id]
                                                  [:= :table_id nil]
                                                  [:= :perm_type (u/qualified-name perm-type)]
                                                  [:in :group_id group-ids]]})
              db-level-group-ids     (set (map :group_id db-level-perms))
              new-perms              (reduce
                                      (fn [new-perms group-id]
                                        (let [new-value (or
                                                         ;; Make sure we set `blocked` data access if we're on EE and *any*
                                                         ;; other table in the DB has `blocked` or `sandboxed`
                                                         (and (= perm-type :perms/view-data)
                                                              (new-table-view-data-permission-level db-id group-id))
                                                         ;; Otherwise, if all tables in the schema have the same
                                                         ;; value, use that value for the new table
                                                         (schema-permission-value db-id group-id schema-name perm-type)
                                                         ;; Otherwise, use the default value passed in
                                                         default-value)
                                              new-perm {:perm_type   perm-type
                                                        :group_id    group-id
                                                        :perm_value  new-value
                                                        :db_id       db-id
                                                        :table_id    (u/the-id table)
                                                        :schema_name schema-name}]
                                          (cond
                                            ;; Perms that are being added at the table-level for a group currently set at the DB
                                            ;; level. This should only happen when adding a table to a DB where some existing
                                            ;; tables are sandboxed, because the DB might have `:unrestricted` DB-level perms which
                                            ;; need to be split out to table-level perms.
                                            (and (db-level-group-ids group-id)
                                                 (= new-value :blocked))
                                            (update new-perms :going-granular conj new-perm)

                                            ;; Otherwise, we only add a new table-level permission row if existing perms
                                            ;; are table-level
                                            (not (db-level-group-ids group-id))
                                            (update new-perms :simple-perms conj new-perm)

                                            :else
                                            new-perms)))
                                      {:simple-perms [] :going-granular []}
                                      group-ids)
              {:keys [going-granular
                      simple-perms]} new-perms]
          ;; These perms might need existing DB-level perms to be broken out to table-level perms
          (doseq [{:keys [perm_type perm_value group_id]} going-granular]
            (set-table-permissions-internal! group_id perm_type {table perm_value}))
          ;; These perms can be inserted raw, and don't require changes to existing perms in the DB
          (t2/insert! :model/DataPermissions simple-perms))))))

(defenterprise download-perms-level
  "Return the download permission for the query that the given user has. OSS returns :full"
  metabase-enterprise.advanced-permissions.models.permissions.data-permissions
  [_query _user-id]
  :full)

(defn has-db-transforms-permission?
  "Returns true if the given user has the transforms permission for the given source db."
  [user-id database-id]
  (and (not= database-id audit/audit-db-id)
       (user-has-permission-for-database? user-id
                                          :perms/transforms
                                          :yes
                                          database-id)))

(defn has-any-transforms-permission?
  "Returns true if the current user has the transforms permission for _any_ source db."
  [user-id]
  (user-has-any-perms-of-type? user-id :perms/transforms))
