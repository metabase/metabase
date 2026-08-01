(ns metabase.permissions.models.data-permissions
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as mdb]
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

;;; -------------------------------------------- Shared caching helpers --------------------------------------------

;;; Every permission-checking function below has its own request-scoped cache — one atom, one hand-written aggregate
;;; query, one cache structure that fits exactly the question the function answers. All the atoms are bound by
;;; [[with-relevant-permissions-for-user]] and key `:perms` by user ID so we NEVER accidentally use the cache of the
;;; wrong user.
;;;
;;; All coalescing happens in SQL: each permission value is mapped to its rank (see [[value-rank-case]]) and rows
;;; are aggregated with GROUP BY, so result sets scale with tables/schemas/databases rather than with raw
;;; data_permissions row counts (dbs x groups x tables x duplicate values). A bucket's (min, max) rank pair is
;;; enough to reconstruct [[coalesce]] exactly (see [[ranks->most-permissive-value]]), and the
;;; most-restrictive-within-a-group-then-most-permissive-across-groups questions nest two levels of GROUP BY, so
;;; even group identity collapses.
;;;
;;; All caches are point-in-time snapshots for the request: nothing invalidates them when data_permissions is
;;; written, so code that mutates permissions and re-checks them within the same request scope reads pre-write
;;; answers, and the caches may observe a concurrent write at different first-load moments.

(defn- perm-rows-query-base
  "The FROM/JOIN/WHERE shared by every cache load: one user's groups' rows for every permission type, excluding rows
  for deactivated tables. All caches must select from this same row set so they can never answer the same permission
  question differently — change the row set here, not in one of the queries. `db-ids` of nil means every database."
  [user-id db-ids]
  {:from [[(t2/table-name :model/PermissionsGroupMembership) :pgm]]
   :join [[(t2/table-name :model/PermissionsGroup) :pg] [:= :pg.id :pgm.group_id]
          [(t2/table-name :model/DataPermissions) :p] [:= :p.group_id :pg.id]]
   :left-join [[(t2/table-name :model/Table) :mt] [:= :mt.id :p.table_id]]
   :where [:and
           [:= :pgm.user_id user-id]
           (when (seq db-ids)
             [:in :p.db_id db-ids])
           [:or
            [:= :p.table_id nil]
            [:= :mt.active true]]]})

(def ^:private value-rank-case
  "A HoneySQL CASE expression mapping a data_permissions row's (perm_type, perm_value) to the value's rank in its
  permission type's ordering — 0 = most permissive. MIN/MAX aggregates of this rank are what let SQL collapse
  groups, tables and duplicate values."
  (into [:case]
        cat
        (for [[perm-type {:keys [values]}] permissions.schema/data-permissions
              [i v] (map-indexed vector values)]
          [[:and
            [:= :p.perm_type (u/qualified-name perm-type)]
            [:= :p.perm_value (u/qualified-name v)]]
           [:inline i]])))

(def ^:private db-row-rank-case
  "[[value-rank-case]] but only for database-level rows — NULL for rows that name a table, so MIN/MAX ignore them."
  [:case [:= :p.table_id nil] value-rank-case :else nil])

(defn- ranks->most-permissive-value
  "Reconstructs [[coalesce]] over a bucket of values from the bucket's `[min-rank max-rank]` pair. Verified
  exhaustively against [[coalesce]] for every permission type and value subset: the most permissive value is the one
  at the minimum rank, except for :perms/view-data's special rule where a :blocked row overrides
  :legacy-no-self-service (but not :unrestricted). Returns nil for a nil pair (no rows), matching what coalescing an
  empty value set returns for callers that fall back to the least permissive value."
  [perm-type pair]
  (when-let [[mn mx] pair]
    (let [^PersistentVector values (-> permissions.schema/data-permissions perm-type :values)]
      (if (and (= perm-type :perms/view-data)
               (= (nth values mx) :blocked)
               (not= (nth values mn) :unrestricted))
        :blocked
        (nth values mn)))))

(defn- combine-rank-pairs
  "Merges `[min max]` rank pairs — equivalent to coalescing the union of the buckets they summarize."
  [& pairs]
  (when-let [pairs (seq (remove nil? pairs))]
    [(apply min (map first pairs))
     (apply max (map second pairs))]))

(def ^:dynamic *use-perms-cache?*
  "Bind to `false` to intentionally bypass the permissions caches and fetch data straight from the DB."
  true)

(defmacro disable-perms-cache
  "Intentionally bypass the permissions caches and fetch data straight from the DB."
  {:style/indent 0}
  [& body]
  `(binding [*use-perms-cache?* false]
     ~@body))

(defn- use-cache?
  [user-id]
  (and *use-perms-cache?*
       (= user-id api/*current-user-id*)))

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

;;; ---------------------------------------------- Table level cache -----------------------------------------------

(def ^:dynamic *table-permission-cache*
  "Request cache for [[table-permission-for-user]]:

    {:db-ids    #{db-id}     -- every table in these databases is loaded
     :table-ids #{table-id}  -- these tables are loaded individually
     :perms     {user-id {perm-type {db-id {table-id value}}}}}

  Only table-granular rows live here. The grant attached to the database itself is a property of the database, not of
  any table, so it comes from [[*db-permission-cache*]]'s `:database` — which means a table with no rows of its
  own, or no row in `metabase_table` at all, still resolves correctly.

  Nothing invalidates this within a request, so a permission written after a check has already loaded is not seen by
  later checks in the same request. That was always true per database; it now spans every database the user can see.

  Two completeness sets because a load comes in one of two shapes. A whole-database load answers for any table in it,
  including tables with no rows of their own. A table-scoped load answers only for the tables it asked about — an
  unrequested table is indistinguishable from one with no permissions, and answering for it would invent a
  permission. So `:table-ids` records what was *asked for*, not what came back, and a scoped load never touches
  `:db-ids`."
  (atom {:db-ids #{} :table-ids #{} :perms {}}))

(def ^:private max-ids-per-query
  "How many IDs to list in one load. Each is a bound parameter and Postgres caps a statement at 65535 of them, so a
  caller passing a very large set is split across several queries rather than failing outright."
  5000)

(defn- load-table-permission-perms
  "Table-granular permissions for one scope — either `{:table-ids …}` or `{:db-ids …}`. Database-level rows are
  excluded; see [[*table-permission-cache*]]."
  [user-id {:keys [db-ids table-ids]}]
  (reduce (fn [m {:keys [perm_type db_id table_id mn mx]}]
            (assoc-in m [(keyword perm_type) db_id table_id]
                      (ranks->most-permissive-value (keyword perm_type) [mn mx])))
          {}
          (t2/query (-> (perm-rows-query-base user-id (when-not (seq table-ids) db-ids))
                        (assoc :select [:p.perm_type :p.db_id :p.table_id
                                        [[:min value-rank-case] :mn]
                                        [[:max value-rank-case] :mx]]
                               :group-by [:p.perm_type :p.db_id :p.table_id])
                        (update :where conj [:not= :p.table_id nil])
                        (cond-> (seq table-ids) (update :where conj [:in :p.table_id table-ids]))))))

(defn- merge-table-perms
  "Merge freshly loaded table permissions into cached ones, unioning the per-database table maps rather than replacing
  them — the same database is loaded more than once, once per batch of tables."
  [cached loaded]
  (merge-with #(merge-with merge %1 %2) cached loaded))

(defn- load-table-perms!
  "Load one scope into [[*table-permission-cache*]] and return the resulting per-user perms map."
  [user-id {:keys [db-ids table-ids] :as scope}]
  (let [loaded (load-table-permission-perms user-id scope)]
    (-> (swap! *table-permission-cache*
               (fn [cache]
                 (-> cache
                     (update (if (seq table-ids) :table-ids :db-ids) into (or (not-empty table-ids) db-ids))
                     (update-in [:perms user-id] merge-table-perms loaded))))
        (get-in [:perms user-id]))))

(defn prime-table-perms-cache
  "Eagerly load table-granular permissions for the current user, so that a run of per-table checks costs one query
  instead of one per table. A no-op for superusers, whose checks never read the cache.

  Takes `{:db-ids #{…} :table-ids #{…}}`, and `:table-ids` decides the shape:

  - **given** — load exactly those tables. Right when the candidate set is already small and known: the tables a
    card's query reads, a page of recents, the tables behind a list of measures.
  - **absent** — load every table in `:db-ids`. Right when the candidate set *is* a database or a schema of one, where
    listing the IDs would just be a longhand way of naming the database.

  Supplying both loads the tables and ignores `:db-ids`, since the table list is the narrower scope. Note also that a
  table already covered by a fully-loaded database is re-requested, because mapping a table ID back to its database
  would itself take a query."
  [{:keys [db-ids table-ids]}]
  (when (and (use-cache? api/*current-user-id*)
             (not api/*is-superuser?*))
    (let [user-id api/*current-user-id*
          cache   @*table-permission-cache*]
      (if (seq table-ids)
        (doseq [batch (partition-all max-ids-per-query
                                     (into #{} (remove (:table-ids cache)) table-ids))]
          (load-table-perms! user-id {:table-ids (set batch)}))
        (when-let [missing-db-ids (not-empty (into #{} (remove (:db-ids cache)) db-ids))]
          (load-table-perms! user-id {:db-ids missing-db-ids})))
      nil)))

(defn- cached-table-perms
  "Read-through for [[*table-permission-cache*]]: the per-user `{perm-type {db-id {table-id value}}}` map, loading
  `table-id` first if it isn't covered yet. Callers checking many tables should [[prime-table-perms-cache]] first."
  [user-id db-id table-id]
  (if (use-cache? user-id)
    (if (or (contains? (:db-ids @*table-permission-cache*) db-id)
            (contains? (:table-ids @*table-permission-cache*) table-id))
      (get-in @*table-permission-cache* [:perms user-id])
      (load-table-perms! user-id {:table-ids #{table-id}}))
    (load-table-permission-perms user-id {:table-ids #{table-id}})))

;;; ---------------------------------------------- Schema level cache ----------------------------------------------

(def ^:dynamic *schema-permission-cache*
  "Request cache for [[schema-permission-for-user]]: `{:db-ids #{} :perms {user-id {perm-type {db-id entry}}}}`
  where each entry is `{:default v, :schemas {schema v}}` — per schema, the coalesced value of the schema's table
  rows combined with the db-level rows; `:default` (the db-level value alone) answers schemas with no rows of their
  own. Schema names are normalized (nil = \"\"). Loaded per database, all permission types at once."
  (atom {:db-ids #{} :perms {}}))

(defn- load-schema-permission-perms
  [user-id db-ids]
  (let [table-level-case [:case [:= :p.table_id nil] [:inline 0] :else [:inline 1]]
        folded (reduce (fn [m {:keys [perm_type db_id schema_name table_level mn mx]}]
                         (if (pos? table_level)
                           (update-in m [(keyword perm_type) db_id :schemas (or schema_name "")]
                                      combine-rank-pairs [mn mx])
                           (assoc-in m [(keyword perm_type) db_id :db-level] [mn mx])))
                       {}
                       (t2/query (assoc (perm-rows-query-base user-id db-ids)
                                        :select [:p.perm_type :p.db_id :p.schema_name
                                                 [table-level-case :table_level]
                                                 [[:min value-rank-case] :mn]
                                                 [[:max value-rank-case] :mx]]
                                        :group-by [:p.perm_type :p.db_id :p.schema_name table-level-case])))]
    (into {}
          (map (fn [[perm-type db-id->folded]]
                 [perm-type
                  (update-vals db-id->folded
                               (fn [{:keys [db-level schemas]}]
                                 {:default (ranks->most-permissive-value perm-type db-level)
                                  :schemas (update-vals schemas
                                                        #(ranks->most-permissive-value
                                                          perm-type
                                                          (combine-rank-pairs db-level %)))}))]))
          folded)))

(defn- cached-schema-perms
  "Read-through for [[*schema-permission-cache*]]: the per-user `{perm-type {db-id entry}}` map, loading whichever of
  `db-ids` isn't cached yet. Loads straight through without caching when the request cache doesn't apply."
  [user-id db-ids]
  (if (use-cache? user-id)
    (do
      (let [missing-db-ids (into [] (remove (:db-ids @*schema-permission-cache*)) db-ids)]
        (when (seq missing-db-ids)
          (let [loaded (load-schema-permission-perms user-id missing-db-ids)]
            (swap! *schema-permission-cache*
                   (fn [cache]
                     (-> cache
                         (update :db-ids into missing-db-ids)
                         (update-in [:perms user-id] #(merge-with merge % loaded))))))))
      (get-in @*schema-permission-cache* [:perms user-id]))
    (load-schema-permission-perms user-id db-ids)))

;;; --------------------------------------------- Database level cache ---------------------------------------------

(def ^:dynamic *db-permission-cache*
  "Request cache for every whole-database question:
  `{user-id {perm-type {db-id {:database v :every-table v :any-table v}}}}`.

  The three differ in *how much of the database the value has to hold for*:

  - `:database`    — the grant attached to the database itself, ignoring per-table grants. It applies to every table
                     in the database, so [[table-permission-for-user]] coalesces it with each table's own value. It
                     lives here rather than in the table cache because it is a property of the database: a check
                     against a table that doesn't exist still has to see it.
  - `:every-table` — the level the user holds over the whole database: within each group the most restrictive value
                     across its tables, then the best of those across the user's groups. Answers \"may they do this
                     to everything here?\" A database-level row counts as granting every table, which is exactly how
                     [[set-table-permissions!]] stores a permission that is uniform across a database.
  - `:any-table`   — the level the user holds on at least one table: the loosest value found anywhere in the database.
                     Answers \"may they do this to anything here?\"

  `:every-table` and `:any-table` bracket the truth: no table in the database is more restricted than the first, and
  none is more permissive than the second. Neither can be derived from the other, because values coalesce per group
  before they coalesce across groups — a user can hold `:unrestricted` on every table without any single group
  granting it on all of them.

  All three are aggregations of the same rows (see [[perm-rows-query-base]]), so one query computes all of them, for
  every database it is asked about, at once. `:db-ids` records which those were: this cache only ever answers for a
  database it actually loaded, so one created later is fetched rather than read as having no permissions.

  Checks that walk a list of databases should [[prime-db-perms-cache]] first, exactly as table checks do."
  (atom {:db-ids #{} :perms {}}))

(def ^:dynamic *all-db-permission-cache*
  "Request cache for the questions that scan *every* database rather than asking about one --
  [[user-has-any-perms-of-type?]]. Shaped like [[*db-permission-cache*]]'s `:perms`, but loaded in full, so it needs
  no record of what it covers."
  (atom {}))

(defn- load-db-perms
  "Whole-database values for `db-ids`, or for every database when nil."
  [user-id db-ids]
  (let [per-group (-> (perm-rows-query-base user-id db-ids)
                      (assoc :select   [:p.perm_type :p.db_id :p.group_id
                                        [[:min value-rank-case] :gmin]
                                        [[:max value-rank-case] :gmax]
                                        [[:min db-row-rank-case] :dbmin]
                                        [[:max db-row-rank-case] :dbmax]]
                             :group-by [:p.perm_type :p.db_id :p.group_id]))
        value     (fn [perm-type mn mx] (when mn (ranks->most-permissive-value perm-type [mn mx])))]
    (reduce (fn [m {:keys [perm_type db_id any_mn any_mx every_mn every_mx db_mn db_mx]}]
              (let [perm-type (keyword perm_type)]
                (assoc-in m [perm-type db_id]
                          {:database    (value perm-type db_mn db_mx)
                           :every-table (value perm-type every_mn every_mx)
                           :any-table   (value perm-type any_mn any_mx)})))
            {}
            (t2/query {:select   [:i.perm_type :i.db_id
                                  [[:min :i.gmin] :any_mn]   [[:max :i.gmax] :any_mx]
                                  [[:min :i.gmax] :every_mn] [[:max :i.gmax] :every_mx]
                                  [[:min :i.dbmin] :db_mn]   [[:max :i.dbmax] :db_mx]]
                       :from     [[per-group :i]]
                       :group-by [:i.perm_type :i.db_id]}))))

(defn- load-db-perms!
  "Load `db-ids` into [[*db-permission-cache*]] and return the resulting per-user map."
  [user-id db-ids]
  (let [loaded (load-db-perms user-id db-ids)]
    (-> (swap! *db-permission-cache*
               (fn [cache]
                 (-> cache
                     (update :db-ids into db-ids)
                     (update-in [:perms user-id] #(merge-with merge % loaded)))))
        (get-in [:perms user-id]))))

(defn prime-db-perms-cache
  "Eagerly load whole-database permissions for `:db-ids` for the current user, so that a run of per-database checks
  costs one query instead of one per database. A no-op for superusers, whose checks never read the cache.

  The counterpart of [[prime-table-perms-cache]], for the checks that walk a list of databases."
  [{:keys [db-ids]}]
  (when (and (use-cache? api/*current-user-id*)
             (not api/*is-superuser?*))
    (let [missing (into #{} (remove (:db-ids @*db-permission-cache*)) db-ids)]
      (doseq [batch (partition-all max-ids-per-query missing)]
        (load-db-perms! api/*current-user-id* (set batch))))
    nil))

(defn- cached-db-perms
  "The `{perm-type {db-id {:database v :every-table v :any-table v}}}` map for `user-id`, able to answer for
  `database-id`, loading it if this request hasn't yet. Loads straight through without caching when the request cache
  doesn't apply."
  [user-id database-id]
  (if (use-cache? user-id)
    (if (contains? (:db-ids @*db-permission-cache*) database-id)
      (get-in @*db-permission-cache* [:perms user-id])
      (load-db-perms! user-id #{database-id}))
    (load-db-perms user-id [database-id])))

(defn- all-db-perms
  "Like [[cached-db-perms]] but for every database at once, for the questions that scan them all."
  [user-id]
  (if (use-cache? user-id)
    (or (get @*all-db-permission-cache* user-id)
        (let [loaded (load-db-perms user-id nil)]
          (swap! *all-db-permission-cache* assoc user-id loaded)
          loaded))
    (load-db-perms user-id nil)))

;;; ---------------------------------------------- Table level checks ----------------------------------------------

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
    (let [db-perm    (get-in (cached-db-perms user-id database-id) [perm-type database-id :database])
          table-perm (if (= db-perm (most-permissive-value perm-type))
                       db-perm
                       (coalesce perm-type
                                 (into #{}
                                       (remove nil?)
                                       [db-perm
                                        (get-in (cached-table-perms user-id database-id table-id)
                                                [perm-type database-id table-id])
                                        (get-additional-table-permission! {:db-id database-id :table-id table-id}
                                                                          perm-type)])))]
      (or (when-not (= table-perm (least-permissive-value perm-type))
            table-perm)
          (when (pos-int? table-id)
            (published-tables/user-published-table-permission user-id perm-type table-id))
          (least-permissive-value perm-type)))))

(mu/defn user-has-permission-for-table? :- :boolean
  "Returns a Boolean indicating whether the user has the specified permission value for the given database ID and table ID,
   or a more permissive value."
  [user-id perm-type perm-value database-id table-id]
  (at-least-as-permissive? perm-type
                           (table-permission-for-user user-id perm-type database-id table-id)
                           perm-value))

;;; --------------------------------------------- Schema level checks ----------------------------------------------

(defn prime-schema-perms-cache
  "Eagerly load schema-level permissions for `:db-ids` for the current user, so that a run of per-schema checks across
  several databases costs one query instead of one per database. A no-op for superusers, whose checks never read the
  cache."
  [{:keys [db-ids]}]
  (when (and (use-cache? api/*current-user-id*)
             (not api/*is-superuser?*)
             (seq db-ids))
    (cached-schema-perms api/*current-user-id* db-ids)
    nil))

(mu/defn schema-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective *schema-level* permission value for a given user, permission type, and database ID, and
  schema name. If the user has multiple permissions for the given type in different groups, they are coalesced into a
  single value. The schema-level permission is the *least* restrictive table-level permission within that schema.

  Schema names are compared with nil and the empty string treated as equivalent, matching how `database-schemas`
  presents these databases to the API."
  [user-id perm-type database-id schema-name :- [:maybe :string]]
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
    (let [{:keys [default schemas]} (get-in (cached-schema-perms user-id [database-id])
                                            [perm-type database-id])]
      (or (get schemas (or schema-name ""))
          default
          (least-permissive-value perm-type)))))

(mu/defn user-has-permission-for-schema? :- :boolean
  "Returns a Boolean indicating whether the user has the specified permission value for the given database ID and schema,
   or a more permissive value."
  [user-id perm-type perm-value database-id schema]
  (at-least-as-permissive? perm-type
                           (schema-permission-for-user user-id perm-type database-id schema)
                           perm-value))

(defn- full-schema-permission-rank-pair
  "The `[min max]` rank pair summarizing one `(db-id, schema-name, perm-type)`: within each group, the most
  restrictive rank across the schema's table rows and that group's database-level rows; then min/max of those
  per-group values. Returns nil when the user has no rows at all.

  Selecting the schema's table rows and the database-level rows together is what keeps this a single flat aggregate:
  a database-level row applies to every schema, so restricting to one schema needs no expansion step."
  [user-id perm-type database-id schema-name]
  (let [per-group   (-> (perm-rows-query-base user-id [database-id])
                        (assoc :select   [:p.group_id [[:max value-rank-case] :gmax]]
                               :group-by [:p.group_id])
                        (update :where conj [:= :p.perm_type (u/qualified-name perm-type)])
                        (update :where conj [:or
                                             [:= :p.table_id nil]
                                             [:= :p.schema_name schema-name]]))
        {:keys [mn mx]} (first (t2/query {:select [[[:min :i.gmax] :mn] [[:max :i.gmax] :mx]]
                                          :from   [[per-group :i]]}))]
    (when mn [mn mx])))

(mu/defn full-schema-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective *schema-level* permission value for a given user, permission type, and database ID, and
  schema name. If the user has multiple permissions for the given type in different groups, they are coalesced into a
  single value. The schema-level permission is the *most* restrictive table-level permission within that schema.

  Deliberately uncached: the only caller is the upload path, which asks about a single schema of a single database.
  It asks twice, once per permission type, so a cache would save at most one small scoped query per uploads-enabled
  database -- not worth keeping a fifth cache alive for."
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
    (or (ranks->most-permissive-value
         perm-type
         (full-schema-permission-rank-pair user-id perm-type database-id schema-name))
        (least-permissive-value perm-type))))

;;; -------------------------------------------- Database level checks ---------------------------------------------

(mu/defn database-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective permission value for a given user, permission type, and database ID. If the user has
  multiple permissions for the given type in different groups, they are coalesced into a single value."
  [user-id perm-type database-id]
  (when (not= :model/Database (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (if (is-superuser? user-id)
    (most-permissive-value perm-type)
    (or (get-in (cached-db-perms user-id database-id) [perm-type database-id :database])
        (least-permissive-value perm-type))))

(mu/defn user-has-permission-for-database? :- :boolean
  "Returns a Boolean indicating whether the user has the specified permission value for the given database ID and table ID,
   or a more permissive value."
  [user-id perm-type perm-value database-id]
  (at-least-as-permissive? perm-type
                           (database-permission-for-user user-id perm-type database-id)
                           perm-value))

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
    (or (get-in (cached-db-perms user-id database-id) [perm-type database-id :every-table])
        (least-permissive-value perm-type))))

(mu/defn native-download-permission-for-user :- ::permissions.schema/data-permission-value
  "Returns the effective download permission value for a given user and database ID, for native queries on the database.
  For each group, the native download permission for a database is equal to the lowest permission level of any table in
  the database — exactly [[full-db-permission-for-user]] for :perms/download-results, whose cache it shares."
  [user-id     :- ::lib.schema.id/user
   database-id :- ::lib.schema.id/database]
  (full-db-permission-for-user user-id :perms/download-results database-id))

(mu/defn most-permissive-database-permission-for-user :- ::permissions.schema/data-permission-value
  "Similar to checking _partial_ permissions with permissions paths - what is the *most permissive* permission the
  user has on any of the tables within this database?

  Called without a `database-id`, answers the same question across every database at once -- for asking about the
  user's access to the instance as a whole. That takes one query, where walking the databases would take one each."
  ([user-id perm-type]
   (most-permissive-database-permission-for-user user-id perm-type nil))

  ([user-id perm-type database-id]
   (when (not= :model/Table (model-by-perm-type perm-type))
     (throw (ex-info (tru "Permission type {0} is not a table-level permission." perm-type)
                     {perm-type (permissions.schema/data-permissions perm-type)})))
   (cond
     (is-superuser? user-id)
     (most-permissive-value perm-type)

     (and (= perm-type :perms/manage-table-metadata)
          (is-data-analyst? user-id))
     (most-permissive-value perm-type)

     database-id
     (or (get-in (cached-db-perms user-id database-id) [perm-type database-id :any-table])
         (least-permissive-value perm-type))

     :else
     (let [ordered (-> permissions.schema/data-permissions perm-type :values)
           values  (into #{} (keep :any-table) (vals (get (all-db-perms user-id) perm-type)))]
       (or (first (filter values ordered))
           (least-permissive-value perm-type))))))

(mu/defn user-has-any-perms-of-type? :- :boolean
  "Returns a Boolean indicating whether the user has the highest level of access for the given permission type in any
  group, for at least one database or table. Optionally takes `:exclude-db-ids` to exclude specific databases from the
  check.

  Answered from [[*db-permission-cache*]] — one aggregated query, memoized per request — so callers that invoke this
  repeatedly within one request (e.g. once per snippet in a list) cost at most one query, however many databases the
  instance has. Note that permission rows for inactive tables do not count."
  [user-id perm-type & {:keys [exclude-db-ids]}]
  (or (is-superuser? user-id)
      (and (= perm-type :perms/manage-table-metadata)
           (is-data-analyst? user-id))
      (let [value    (most-permissive-value perm-type)
            exclude? (set exclude-db-ids)]
        (boolean (some (fn [[db-id vals]]
                         (and (= (:any-table vals) value)
                              (not (exclude? db-id))))
                       (get (all-db-perms user-id) perm-type))))))

;;; --------------------------------------- cache assembly ------------------------------------------------------------

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
  "Populates the per-function permission caches above (and `*sandboxes-for-user*`) for use by the cache-aware
  functions in this namespace."
  [user-id & body]
  `(binding [*table-permission-cache*  (atom {:db-ids #{} :table-ids #{} :perms {}})
             *schema-permission-cache* (atom {:db-ids #{} :perms {}})
             *db-permission-cache*     (atom {:db-ids #{} :perms {}})
             *all-db-permission-cache* (atom {})
             *sandboxes-for-user*           (delay (enforced-sandboxes-for-user ~user-id))]
     ~@body))

;;; ---------------------------------------- Fetching a user's permissions --------------------------------------------

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

;; Memoized per application DB. Destination status is immutable after creation, so the cache can't go stale.

(def ^:private destination-db-id?
  "Whether `db-id` is a destination database — one with `router_database_id` set."
  (mdb/memoize-for-application-db
   (fn [db-id]
     (t2/exists? :model/Database :id db-id :router_database_id [:not= nil]))))

(defn assert-no-destination-db-permissions!
  "Throws if any row in `perm-rows` targets a destination database — one with `router_database_id`
  set. Destinations are reachable only through their router and must never carry `data_permissions`
  rows."
  [perm-rows]
  (when-let [dest-ids (seq (into #{} (comp (keep :db_id) (filter destination-db-id?)) perm-rows))]
    (throw (ex-info (tru "Cannot grant permissions on a destination database.")
                    {:status-code 400 :destination-db-ids dest-ids}))))

(t2/define-before-insert :model/DataPermissions
  [permission]
  (assert-valid-permission permission)
  (assert-no-destination-db-permissions! [permission])
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
  [perms
   group-or-id :- TheIdable
   db-or-id    :- TheIdable
   perm-type   :- ::permissions.schema/data-permission-type
   value       :- :keyword]
  (let [group-id (u/the-id group-or-id)
        db-id    (u/the-id db-or-id)
        existing-perms (get perms [group-id db-id perm-type])
        new-perm {:perm_type  perm-type
                  :group_id   group-id
                  :perm_value value
                  :db_id      db-id}
        recursive-calls (cond-> []
                          (and (= perm-type :perms/create-queries) (not= value :no))
                          (conj (build-database-permission perms group-or-id db-or-id :perms/view-data :unrestricted))

                          (= [:perms/view-data :blocked] [perm-type value])
                          (into [(build-database-permission perms group-or-id db-or-id :perms/create-queries :no)
                                 (build-database-permission perms group-or-id db-or-id :perms/download-results :no)])

                          (and (= perm-type :perms/view-data) (not= value :unrestricted))
                          (conj (build-database-permission perms group-or-id db-or-id :perms/transforms :no))

                          (and (= perm-type :perms/create-queries) (not= value :query-builder-and-native))
                          (conj (build-database-permission perms group-or-id db-or-id :perms/transforms :no)))]
    (apply merge-with concat
           {:to-delete existing-perms
            :to-insert [new-perm]}
           recursive-calls)))

(def ^:private permission-batch-size 1000)

(defn batch-insert-permissions!
  "In certain cases, when updating the permissions for many tables at once, we need to batch the insertions to avoid
  hitting database limits for the number of parameters in a prepared statement. This is only really applicable when a DB
  has more than ~10k tables and we're transitioning from database-level permissions to table-level permissions."
  [new-perms]
  ;; The before-insert hook already runs this per row, so this call is dormant. Un-comment it if perms
  ;; are ever inserted by a path that bypasses the hook (e.g. t2/query).
  #_(assert-no-destination-db-permissions! new-perms)
  (doseq [batched-new-perms (partition-all permission-batch-size new-perms)]
    (t2/insert! :model/DataPermissions batched-new-perms)))

(defn batch-delete-permissions!
  "Much like on insert, sometimes we have to delete more permission models than the psql limit of MAX 16-bit parameters.
  This batches our deletes into groups of `permission-batch-size`."
  [to-delete-ids]
  (doseq [batched-to-delete-ids (partition-all permission-batch-size to-delete-ids)]
    (t2/delete! :model/DataPermissions :id [:in batched-to-delete-ids])))

(defn index-database-permissions
  "Given seqs of `group-ids` and `db-ids`, computes an index of all relevant permissions.

  Use this to avoid N+1s in repeated [[set-database-permission!]] calls.

  BEWARE race conditions! This function must be run inside a cluster lock on the relevant DB(s), or you risk working
  from stale data and generating bad permissions. See
  [[metabase.permissions.models.data-permissions-test/race-conditions-test]].

  Returns a map of `{[group-id db-id perm-type] [DataPermission ...]}`. Returns nil if either input list is empty."
  [group-ids db-ids]
  (when (and (seq group-ids) (seq db-ids))
    (group-by (juxt :group_id :db_id :perm_type)
              (t2/select :model/DataPermissions :group_id [:in group-ids] :db_id [:in db-ids]))))

(mu/defn set-database-permission!
  "Set a single permission to a specified value for a given group and database. If a permission value already exists
  for the specified group and object, it will be updated to the new value.

  The optional first argument holds an in-memory index of permissions; this exists to avoid N+1 queries in large edits
  like updating the entire permissions graph. Singular calls to this function can omit it, and an index for just the
  input group and DB will be created on demand.

  Block permissions (i.e. :perms/view-data :blocked) can be set at the table or database-level."
  ([group-or-id :- TheIdable
    db-or-id    :- TheIdable
    perm-type   :- ::permissions.schema/data-permission-type
    value       :- :keyword]
   (let [group-id (u/the-id group-or-id)
         db-id    (u/the-id db-or-id)]
     (with-cluster-lock {:db-id     db-id
                         :perm-type (u/qualified-name perm-type)}
       (set-database-permission! (index-database-permissions [group-id] [db-id])
                                 group-or-id db-or-id perm-type value))))
  ([perms       :- [:map-of
                    [:tuple pos-int? pos-int? ::permissions.schema/data-permission-type]
                    [:sequential :any]]
    group-or-id :- TheIdable
    db-or-id    :- TheIdable
    perm-type   :- ::permissions.schema/data-permission-type
    value       :- :keyword]
   (with-cluster-lock {:db-id     (u/the-id db-or-id)
                       :perm-type (u/qualified-name perm-type)}
     (let [{:keys [to-insert to-delete]} (build-database-permission perms group-or-id db-or-id perm-type value)]
       (when (seq to-delete)
         (batch-delete-permissions! (map :id to-delete)))
       (when (seq to-insert)
         (batch-insert-permissions! to-insert))))))

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
      (let [other-new-perms (->> (t2/select [:model/Table :id :schema]
                                            {:where
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
  (let [existing-table-values (into #{}
                                    (map (comp keyword :perm_value))
                                    (t2/query {:select-distinct [:perm_value]
                                               :from [(t2/table-name :model/DataPermissions)]
                                               :where [:and
                                                       [:= :group_id group-id]
                                                       [:= :db_id db-id]
                                                       [:= :perm_type (u/qualified-name perm-type)]
                                                       [:not= :table_id nil]
                                                       [:not [:in :table_id table-ids]]]}))]
    (if (and (= (count existing-table-values) 1)
             (= values existing-table-values))
      ;; If all tables would have the same permissions after we update these ones, we can replace all of the table
      ;; perms with a DB-level perm instead.
      (build-database-permission (index-database-permissions [group-id] [db-id])
                                 group-id db-id perm-type (first values))
      ;; Otherwise, just replace the rows for the individual table perm
      ;; only :id is consumed downstream (see [[set-table-permissions-internal!]]), so don't fetch full rows
      (let [table-perms-to-delete (t2/select [:model/DataPermissions :id]
                                             {:where [:and
                                                      [:= :perm_type (u/qualified-name perm-type)]
                                                      [:= :group_id group-id]
                                                      [:in :table_id table-ids]]})]
        {:to-delete table-perms-to-delete
         :to-insert new-perms}))))

(mu/defn- build-table-permissions
  "Determines which DataPermissions rows must be deleted and inserted to set the permissions for the provided tables.

  Returns a map with keys:
  - :to-delete - sequence of DataPermissions row IDs to delete
  - :to-insert - sequence of DataPermissions maps to insert "
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
              au-perms (t2/select :model/DataPermissions
                                  {:select-distinct [:db_id :perm_type :perm_value]
                                   :where [:= :group_id au-id]})
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
                                             [:in :perm_type ["perms/create-queries" "perms/download-results"]]
                                             [:not [:exists {:select [1]
                                                             :from   [[(t2/table-name :model/Database) :audit_db]]
                                                             :where  [:and
                                                                      [:= :audit_db.is_audit true]
                                                                      [:= :audit_db.id :data_permissions.db_id]]}]]]}))
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

(defn- mk-perm-row [group-id perm-type perm-value db-id table-id schema]
  {:perm_type perm-type :group_id group-id :perm_value perm-value
   :db_id db-id :table_id table-id :schema_name schema})

(defn- load-perm-context
  "Load the introspection state needed to classify each `(group, perm-type)`
  for new tables on `db-id`."
  [db-id group-ids perm-types]
  (let [qn          (mapv u/qualified-name perm-types)
        db-level    (t2/select :model/DataPermissions
                               {:where [:and [:= :db_id db-id] [:= :table_id nil]
                                        [:in :group_id group-ids] [:in :perm_type qn]]})
        ;; `schema-vals-idx` only needs the set of distinct perm-values per
        ;; (group, perm-type, schema). Selecting DISTINCT on those four columns
        ;; keeps the result bounded by groups × perm-types × schemas × values
        ;; instead of growing with the table count, which can be millions of
        ;; rows on databases with very many tables (see #76077).
        table-level (t2/select :model/DataPermissions
                               {:select-distinct [:group_id :perm_type :schema_name :perm_value]
                                :where [:and [:= :db_id db-id] [:not= :table_id nil]
                                        [:in :group_id group-ids] [:in :perm_type qn]]})]
    {:db-id            db-id
     :db-level-idx     (into {} (map (juxt (juxt :group_id :perm_type) identity)) db-level)
     :schema-vals-idx  (reduce (fn [acc {:keys [group_id perm_type schema_name perm_value]}]
                                 (update-in acc [group_id perm_type schema_name] (fnil conj #{}) perm_value))
                               {} table-level)
     :all-db-tables    (t2/select [:model/Table :id :db_id :schema] :db_id db-id :active true)
     :view-data-levels (new-table-view-data-permission-levels db-id group-ids)}))

(defn- compute-actual-value
  "Per-entry resolution: enterprise view-data override, then schema-consistency
  if all existing tables in the schema agree, else the caller's default."
  [{:keys [view-data-levels schema-vals-idx]}
   {:keys [group-id perm-type default-value table]}]
  (or (when (= perm-type :perms/view-data)
        (get view-data-levels group-id))
      (let [sv (get-in schema-vals-idx [group-id perm-type (:schema table)])]
        (when (and (seq sv) (= (count sv) 1))
          (first sv)))
      default-value))

(defn- classify-key
  "For one `(group-id, perm-type)`, return `{:deletes [id?] :rows [perm-row...]}`.
  Three branches mirror the original cond: going-granular, simple-insert, no-op."
  [{:keys [db-id db-level-idx all-db-tables batch-table-ids]}
   [[group-id perm-type] entries]]
  (let [db-perm      (get db-level-idx [group-id perm-type])
        ;; Only go granular when a batch table needs `:blocked` and the DB-level row has some *other*
        ;; value: a `:blocked` DB-level row already covers the new tables, and expanding it would write
        ;; one redundant row per table (see #76077, where this ballooned data_permissions to 46M rows).
        go-granular? (and db-perm
                          (not= :blocked (:perm_value db-perm))
                          (some #(= :blocked (:actual-value %)) entries))
        mk           (fn [v table-id schema]
                       (mk-perm-row group-id perm-type v db-id table-id schema))]
    (cond
      ;; Going-granular fires once for the whole `(group, perm-type)`:
      ;; delete the DB-level row, expand non-batch tables to the old value,
      ;; then write each batch table at its actual-value.
      go-granular?
      (let [expansion-value (case (:perm_value db-perm)
                              :query-builder-and-native :query-builder
                              (:perm_value db-perm))]
        {:deletes [(:id db-perm)]
         :rows    (concat
                   (for [t all-db-tables :when (not (contains? batch-table-ids (:id t)))]
                     (mk expansion-value (:id t) (:schema t)))
                   (for [{:keys [actual-value table]} entries]
                     (mk actual-value (u/the-id table) (:schema table))))})
      (nil? db-perm)
      {:rows (for [{:keys [actual-value table]} entries]
               (mk actual-value (u/the-id table) (:schema table)))}
      ;; DB-level covers the batch tables — no-op.
      :else nil)))

(defn set-default-table-permissions-bulk!
  "Bulk-set default permissions for many newly-created tables on the same
  database. Issues the introspection SELECTs once for the whole batch and
  a single DELETE + INSERT, deduping going-granular triggers across the
  batch.

  Caller must hold [[with-db-scoped-permissions-lock]] for `db-id`.
  `tables+defaults` is a seq of `[table group-perm-defaults]` pairs."
  [db-id tables+defaults]
  (when (seq tables+defaults)
    (let [batch-table-ids (set (map (fn [[t _]] (u/the-id t)) tables+defaults))
          all-defaults    (mapcat (fn [[t defs]] (map #(assoc % :table t) defs))
                                  tables+defaults)
          group-ids       (distinct (map :group-id all-defaults))
          perm-types      (distinct (map :perm-type all-defaults))
          ctx             (assoc (load-perm-context db-id group-ids perm-types)
                                 :batch-table-ids batch-table-ids)
          annotated       (mapv (fn [d] (assoc d :actual-value (compute-actual-value ctx d)))
                                all-defaults)
          results         (->> annotated
                               (group-by (juxt :group-id :perm-type))
                               (keep #(classify-key ctx %)))
          to-delete       (mapcat :deletes results)
          to-insert       (mapcat :rows results)]
      (when (seq to-delete) (batch-delete-permissions! to-delete))
      (when (seq to-insert) (batch-insert-permissions! to-insert)))))

(defn set-default-table-permissions!
  "Set default permissions for a newly-created table across all relevant
  groups. Handles three cases per `(group, perm-type)`:
   - Group has DB-level perm covering the default (including `:blocked` covering `:blocked`) → no-op
   - Group has non-`:blocked` DB-level perm but new table needs `:blocked` → going-granular
   - Group has no DB-level perm → simple insert

   `group-perm-defaults` is a seq of `{:group-id :perm-type :default-value}`
   triples. Thin wrapper over [[set-default-table-permissions-bulk!]] for
   the single-table case."
  [table group-perm-defaults]
  (let [table (if (map? table)
                table
                (t2/select-one [:model/Table :id :db_id :schema] :id table))]
    (set-default-table-permissions-bulk! (:db_id table) [[table group-perm-defaults]])))

(defenterprise download-perms-level
  "Return the download permission for the query that the given user has. OSS returns :full"
  metabase-enterprise.advanced-permissions.models.permissions.data-permissions
  [_query _user-id]
  :full)

(defn has-db-transforms-permission?
  "Returns true if the given user has the transforms permission for the given source db.
  Superusers always pass. A nil `database-id` (an orphaned transform whose source database
  was deleted) only grants permission to superusers."
  [user-id database-id]
  (and (not= database-id audit/audit-db-id)
       (or (is-superuser? user-id)
           (and (some? database-id)
                (user-has-permission-for-database? user-id
                                                   :perms/transforms
                                                   :yes
                                                   database-id)))))

(defn has-any-transforms-permission?
  "Returns true if the current user has the transforms permission for _any_ source db."
  [user-id]
  (user-has-any-perms-of-type? user-id :perms/transforms))
