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

(def ^:dynamic ^:private *skip-cluster-locks*
  "When true, skip per-(db-id, perm-type) cluster locks. Should only be bound to true
   when a coarser lock is already held by the calling code."
  false)

;; Permission mutation locks form a two-level intent-lock hierarchy over the
;; `metabase_cluster_lock` table:
;;
;;   root = ::batch-permissions-update
;;   leaf = ::batch-permissions-update-db-<db-id>  (one per DB)
;;
;; - `with-global-permissions-lock`   takes the root in :exclusive mode.
;; - `with-db-scoped-permissions-lock` takes the root in :share mode + the leaf
;;   for its db-id in :exclusive mode.
;;
;; That gives us:
;; - parallel DB-scoped writers for different DBs    → no contention
;; - DB-scoped writers for the same DB               → serialize on the leaf
;; - global writer vs any DB-scoped writer           → mutually exclusive
;; - two global writers                              → serialize on the root

(defn db-scoped-leaf-lock-name
  "Returns the cluster-lock keyword for the per-db leaf used by
  [[with-db-scoped-permissions-lock]]. Exposed so that macro expansions in
  other namespaces can reference it."
  [db-id]
  (keyword "metabase.permissions.models.data-permissions"
           (str "batch-permissions-update-db-" db-id)))

(defmacro with-global-permissions-lock
  "Acquires an exclusive cluster-wide lock over all permission mutations. Use for
  operations that touch multiple DBs' permission rows (graph update, new group
  creation). Blocks and is blocked by every `with-db-scoped-permissions-lock`."
  [& body]
  `(cluster-lock/with-cluster-lock ::batch-permissions-update
     (binding [*skip-cluster-locks* true]
       ~@body)))

(defmacro with-db-scoped-permissions-lock
  "Acquires a shared lock on the permissions root + an exclusive lock on the
  per-db leaf for `db-id`. Use for operations that only touch one DB's
  permission rows (new table, new DB). Parallel calls for different DBs run
  concurrently; parallel calls for the same DB serialize on the leaf row."
  [db-id & body]
  `(let [db-id# ~db-id]
     (cluster-lock/with-cluster-lock
       {:locks [{:lock ::batch-permissions-update :mode :share}
                {:lock (db-scoped-leaf-lock-name db-id#) :mode :exclusive}]}
       (binding [*skip-cluster-locks* true]
         ~@body))))

(mu/defn- with-cluster-lock-fn
  [m :- [:map
         [:db-id ms/PositiveInt]
         [:perm-type :string]]
   f :- fn?]
  (if *skip-cluster-locks*
    (f)
    (cluster-lock/with-cluster-lock (keyword "data-permissions-" (str/join "-"
                                                                           [(:db-id m)
                                                                            (:perm-type m)]))
      (f))))

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

(defn- validate-perm-value!
  [perm-type perm-value]
  (let [values (-> permissions.schema/data-permissions perm-type :values)]
    (when-not (contains? (set values) perm-value)
      (throw (ex-info (tru "Invalid permission value {0} for permission type {1}" (pr-str perm-value) perm-type)
                      {:value perm-value :perm-type perm-type :valid-values values})))))

(mu/defn at-least-as-permissive?
  "Returns true if value1 is at least as permissive as value2 for the given permission type."
  [perm-type :- ::permissions.schema/data-permission-type
   value1    :- ::permissions.schema/data-permission-value
   value2    :- ::permissions.schema/data-permission-value]
  (validate-perm-value! perm-type value1)
  (validate-perm-value! perm-type value2)
  (let [^PersistentVector values (-> permissions.schema/data-permissions perm-type :values)]
    (<= (.indexOf values value1) (.indexOf values value2))))

(def ^:private model-by-perm-type
  "A map from permission types directly to model identifiers (or `nil`)."
  (update-vals permissions.schema/data-permissions :model))

(defn- assert-value-matches-perm-type
  [perm-type perm-value]
  (validate-perm-value! perm-type perm-value))

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

(defenterprise new-group-view-data-permission-levels
  "Returns a map of {db-id → permission-level} for multiple databases. On OSS, all are `:unrestricted`."
  metabase-enterprise.advanced-permissions.common
  [db-ids]
  (zipmap db-ids (repeat :unrestricted)))

(defenterprise new-database-view-data-permission-levels
  "Returns a map of {group-id → permission-level} for multiple groups. On OSS, all are `:unrestricted`."
  metabase-enterprise.advanced-permissions.common
  [group-ids]
  (zipmap group-ids (repeat :unrestricted)))

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

(defenterprise new-table-view-data-permission-levels
  "Returns a map of {group-id → permission-level} for multiple groups and a single DB.
   On OSS, all are `:unrestricted`."
  metabase-enterprise.advanced-permissions.common
  [_db-id group-ids]
  (zipmap group-ids (repeat :unrestricted)))

;;; ---------------------------------------- Bulk permission functions ------------------------------------------------
;; These functions set permissions for newly-created entities (groups, databases, tables) using batch SQL operations
;; instead of per-row mutations. They are intended to be called from within a coarse cluster lock.

(defn- least-permissive-defaults
  "Returns a map of {perm-type → least-permissive-value} from the schema definition."
  []
  (m/map-vals (fn [{:keys [values]}] (last values)) permissions.schema/data-permissions))

(defn set-default-group-permissions!
  "Bulk-sets default permissions for a newly-created group across all databases.
   When `use-all-users-perms?` is true (regular groups), values are based on the All Users group's
   current permissions. When false (tenant/external groups), uses the most restrictive values.
   Uses batch SQL operations instead of per-row mutations."
  [group-or-id db-ids use-all-users-perms?]
  (when (seq db-ids)
    (let [group-id (u/the-id group-or-id)]
      (if-not use-all-users-perms?
        ;; External/tenant groups: all least-permissive values (static, no queries needed)
        (batch-insert-permissions!
         (for [db-id db-ids
               [perm-type perm-value] (least-permissive-defaults)]
           {:perm_type  perm-type
            :group_id   group-id
            :perm_value perm-value
            :db_id      db-id}))
        ;; Regular groups: compute based on All Users group
        (let [au-id    (t2/select-one-pk :model/PermissionsGroup
                                         :magic_group_type "all-internal-users")
              au-perms (t2/select :model/DataPermissions :group_id au-id)
              au-by-db (reduce (fn [acc {:keys [db_id perm_type perm_value]}]
                                 (update-in acc [db_id perm_type] (fnil conj #{}) perm_value))
                               {}
                               au-perms)
              view-data-levels (new-group-view-data-permission-levels db-ids)]
          (batch-insert-permissions!
           (for [db-id db-ids
                 :let [view-data-level (get view-data-levels db-id :unrestricted)
                       cq-values (get-in au-by-db [db-id :perms/create-queries])
                       cq-level  (or (when (seq cq-values) (coalesce-most-restrictive :perms/create-queries cq-values))
                                     :query-builder-and-native)
                       dl-values (get-in au-by-db [db-id :perms/download-results])
                       dl-level  (or (when (seq dl-values) (coalesce-most-restrictive :perms/download-results dl-values))
                                     :one-million-rows)
                       perm-map  (cond-> {:perms/view-data             view-data-level
                                          :perms/create-queries        cq-level
                                          :perms/download-results      dl-level
                                          :perms/manage-table-metadata :no
                                          :perms/manage-database       :no}
                                   (or (not= view-data-level :unrestricted)
                                       (not= cq-level :query-builder-and-native))
                                   (assoc :perms/transforms :no))]
                 [perm-type perm-value] perm-map]
             {:perm_type  perm-type
              :group_id   group-id
              :perm_value perm-value
              :db_id      db-id})))))))

(defn set-default-database-permissions!
  "Bulk-sets default permissions for a newly-created database across all groups.
   For tenant groups, uses least-permissive values. For audit DBs, uses hardcoded values.
   For other groups, values are based on the group's lowest existing permission level.
   Uses batch SQL operations instead of per-row mutations."
  [database groups]
  (when (seq groups)
    (let [db-id        (u/the-id database)
          is-audit     (:is_audit database)
          group-ids    (map u/the-id groups)
          defaults     (least-permissive-defaults)
          ;; Batch-fetch distinct (group, perm-type, value) triples — we only need the set of unique values per
          ;; group to find the most restrictive level;
          all-perms    (when-not is-audit
                         (t2/query {:select-distinct [:group_id :perm_type :perm_value]
                                    :from   [[(t2/table-name :model/DataPermissions)]]
                                    :where  [:and
                                             [:in :group_id group-ids]
                                             [:in :perm_type ["perms/create-queries" "perms/download-results"]]]}))
          ;; Group by (group_id, perm_type) → set of values
          perms-by-grp (when all-perms
                         (reduce (fn [acc {:keys [group_id perm_type perm_value]}]
                                   (update-in acc [group_id (keyword perm_type)] (fnil conj #{}) (keyword perm_value)))
                                 {}
                                 all-perms))
          ;; Batch-fetch view-data levels for all groups at once
          view-data-levels (when-not is-audit
                             (new-database-view-data-permission-levels group-ids))
          perm-rows    (mapcat
                        (fn [group]
                          (let [group-id (u/the-id group)
                                perm-map
                                (cond
                                  ;; Tenant groups always get least-permissive
                                  (:is_tenant_group group)
                                  defaults

                                  ;; Audit DB gets hardcoded restrictive values
                                  is-audit
                                  {:perms/view-data             :unrestricted
                                   :perms/create-queries        :no
                                   :perms/download-results      :one-million-rows
                                   :perms/manage-table-metadata :no
                                   :perms/manage-database       :no
                                   :perms/transforms            :no}

                                  ;; Normal: compute based on group's lowest existing perm level
                                  :else
                                  (let [view-data-level      (get view-data-levels group-id :unrestricted)
                                        grp-vals             (get perms-by-grp group-id)
                                        cq-values            (get grp-vals :perms/create-queries)
                                        cq-level             (or (when (seq cq-values)
                                                                   (coalesce-most-restrictive :perms/create-queries cq-values))
                                                                 :query-builder-and-native)
                                        download-level       (if (= view-data-level :blocked)
                                                               :no
                                                               (let [dl-values (get grp-vals :perms/download-results)]
                                                                 (or (when (seq dl-values)
                                                                       (coalesce-most-restrictive :perms/download-results dl-values))
                                                                     :one-million-rows)))]
                                    (cond-> {:perms/view-data             view-data-level
                                             :perms/create-queries        cq-level
                                             :perms/download-results      download-level
                                             :perms/manage-table-metadata :no
                                             :perms/manage-database       :no}
                                      (or (not= view-data-level :unrestricted)
                                          (not= cq-level :query-builder-and-native))
                                      (assoc :perms/transforms :no))))]
                            (for [[perm-type perm-value] perm-map]
                              {:perm_type  perm-type
                               :group_id   group-id
                               :perm_value perm-value
                               :db_id      db-id})))
                        groups)]
      (batch-insert-permissions! perm-rows))))

(defn set-default-table-permissions!
  "Bulk-sets default permissions for a newly-created table across all relevant groups.
   Handles three cases per (group, perm-type):
   - Group has DB-level perm matching default → no-op (DB-level covers it)
   - Group has DB-level perm but new table needs :blocked → going-granular (expand to per-table rows)
   - Group has no DB-level perm (already table-granular) → simple insert for the new table

   `group-perm-defaults` is a seq of {:group-id G :perm-type PT :default-value V} triples."
  [table group-perm-defaults]
  (when (seq group-perm-defaults)
    (let [table     (if (map? table)
                      table
                      (t2/select-one [:model/Table :id :db_id :schema] :id table))
          db-id     (:db_id table)
          table-id  (u/the-id table)
          schema    (:schema table)
          group-ids (distinct (map :group-id group-perm-defaults))
          perm-types (distinct (map :perm-type group-perm-defaults))
          ;; Batch SELECT #1: all DB-level permissions for this DB across all relevant groups + perm-types
          db-level-perms (t2/select :model/DataPermissions
                                    {:where [:and
                                             [:= :db_id db-id]
                                             [:= :table_id nil]
                                             [:in :group_id group-ids]
                                             [:in :perm_type (mapv u/qualified-name perm-types)]]})
          ;; Index: {[group_id perm_type] → db-level-perm-row}
          db-level-idx   (into {} (map (fn [p] [[(:group_id p) (:perm_type p)] p]) db-level-perms))
          ;; Batch SELECT #2: all existing table-level permissions for this DB
          ;; (needed for schema-permission-value logic and going-granular expansion)
          table-perms    (t2/select :model/DataPermissions
                                    {:where [:and
                                             [:= :db_id db-id]
                                             [:not= :table_id nil]
                                             [:in :group_id group-ids]
                                             [:in :perm_type (mapv u/qualified-name perm-types)]]})
          ;; Index: {[group_id perm_type schema_name] → set of values}
          schema-vals-idx (reduce (fn [acc {:keys [group_id perm_type schema_name perm_value]}]
                                    (update-in acc [group_id perm_type schema_name] (fnil conj #{}) perm_value))
                                  {}
                                  table-perms)
          ;; Batch SELECT #3: all tables in this DB (for going-granular expansion)
          all-db-tables  (t2/select [:model/Table :id :db_id :schema] :db_id db-id :active true)
          ;; Batch-fetch view-data levels for all groups at once
          view-data-levels (new-table-view-data-permission-levels db-id group-ids)
          ;; Classify each (group, perm-type) triple
          {:keys [simple-perms going-granular db-rows-to-delete]}
          (reduce
           (fn [acc {:keys [group-id perm-type default-value]}]
             (let [;; Enterprise hook override for view-data
                   actual-value  (or (when (= perm-type :perms/view-data)
                                       (get view-data-levels group-id))
                                     ;; Schema-level consistency: if all tables in schema have same value, use it
                                     (let [sv (get-in schema-vals-idx [group-id perm-type schema])]
                                       (when (and (seq sv) (= (count sv) 1))
                                         (first sv)))
                                     default-value)
                   db-level-perm (get db-level-idx [group-id perm-type])
                   new-perm      {:perm_type   perm-type
                                  :group_id    group-id
                                  :perm_value  actual-value
                                  :db_id       db-id
                                  :table_id    table-id
                                  :schema_name schema}]
               (cond
                 ;; Group has DB-level perm and new table needs :blocked → going-granular
                 (and db-level-perm (= actual-value :blocked))
                 (-> acc
                     (update :going-granular conj {:group-id group-id :perm-type perm-type
                                                   :new-perm new-perm :db-perm db-level-perm})
                     (update :db-rows-to-delete conj (:id db-level-perm)))

                 ;; Group has no DB-level perm (already table-granular) → simple insert
                 (not db-level-perm)
                 (update acc :simple-perms conj new-perm)

                 ;; Group has DB-level perm matching or compatible → no-op
                 :else
                 acc)))
           {:simple-perms [] :going-granular [] :db-rows-to-delete []}
           group-perm-defaults)]
      ;; Bulk DELETE: DB-level rows that need going-granular expansion
      (when (seq db-rows-to-delete)
        (batch-delete-permissions! db-rows-to-delete))
      ;; Bulk INSERT: expansion rows for going-granular groups + simple insert rows
      (let [expansion-rows (mapcat
                            (fn [{:keys [group-id perm-type new-perm db-perm]}]
                              (let [db-perm-value (:perm_value db-perm)
                                    ;; Build per-table rows for all existing tables (with the old DB-level value)
                                    existing-table-rows
                                    (keep (fn [t]
                                            (when (not= (:id t) table-id)
                                              {:perm_type   perm-type
                                               :group_id    group-id
                                               :perm_value  (case db-perm-value
                                                              :query-builder-and-native :query-builder
                                                              db-perm-value)
                                               :db_id       db-id
                                               :table_id    (:id t)
                                               :schema_name (:schema t)}))
                                          all-db-tables)]
                                (cons new-perm existing-table-rows)))
                            going-granular)]
        (batch-insert-permissions! (concat expansion-rows simple-perms))))))

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
