(ns metabase.permissions.data-permissions
  "Data permissions: what a user or groups may do with Databases, schemas and Tables, asked of the application database
  every time, and the functions that change the `data_permissions` rows. The Table and Database questions are bulk:
  they take many ids and answer them together, so a caller checking many rows, such as a batched hydration, gathers
  their ids and asks once."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.app-db.core :as mdb]
   [metabase.audit-app.core :as audit]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.db :as permissions.db]
   [metabase.permissions.published-tables :as published-tables]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema]
   [metabase.warehouses.schema]
   [toucan2.core :as t2])
  (:import
   (clojure.lang PersistentVector)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^:private *skip-cluster-locks*
  "When true, skip per-(db-id, perm-type) cluster locks. Should only be bound to true
   when a coarser lock is already held by the calling code."
  false)

;; Permission mutation locks form a two-level intent-lock hierarchy over the
;; `metabase_cluster_lock` table:
;;
;;   root = :metabase.permissions.models.data-permissions/batch-permissions-update (named for the model namespace that
;;          held it before, so that a rolling deploy keeps one lock)
;;   leaf = :metabase.permissions.models.data-permissions/batch-permissions-update-db-<db-id>  (one per DB)
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
  `(cluster-lock/with-cluster-lock :metabase.permissions.models.data-permissions/batch-permissions-update
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
       {:locks [{:lock :metabase.permissions.models.data-permissions/batch-permissions-update :mode :share}
                {:lock (db-scoped-leaf-lock-name db-id#) :mode :exclusive}]}
       (binding [*skip-cluster-locks* true]
         ~@body))))

(mu/defn- with-cluster-lock-fn
  [m :- [:map {:closed true}
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

(defn- coalesce-most-restrictive
  "In some cases (fetching schema permissions) we need to coalesce permissions using the most restrictive option."
  [perm-type perm-values]
  (let [ordered-values (-> permissions.schema/data-permissions perm-type :values reverse)]
    (first (filter (set perm-values) ordered-values))))

;;; ---------------------------------------------------- Users ----------------------------------------------------------

(defn is-superuser?
  "Returns true if the given user ID is a superuser. Avoids a DB query when checking the current user."
  [user-id]
  (if (= user-id api/*current-user-id*)
    api/*is-superuser?*
    (permissions.db/user-superuser? user-id)))

(defn is-data-analyst?
  "Returns true if the given user ID is a data analyst. Avoids a DB query when checking the current user."
  [user-id]
  (if (= user-id api/*current-user-id*)
    api/*is-data-analyst?*
    (permissions.db/user-data-analyst? user-id)))

(mu/defn user-info :- ::permissions.schema/data-user-info
  "The `::permissions.schema/data-user-info` of the User with `user-id`, read from the request for the current user
  and from the application database for another one."
  [user-id :- [:maybe ::lib.schema.id/user]]
  {:user-id          user-id
   :is-superuser?    (boolean (is-superuser? user-id))
   :is-data-analyst? (boolean (is-data-analyst? user-id))})

;;; ------------------------------------------------- Raw queries ------------------------------------------------

(defn- chunked
  "The concatenated results of `f` on chunks of `ids` small enough for one query."
  [f ids]
  (into [] (mapcat #(f (vec %))) (partition-all 1000 ids)))

(defn- coalesce-rows
  "The [[coalesce]]d value of the `rows`' `:perm_value`s, or nil when there are none."
  [perm-type rows]
  (when (seq rows)
    (coalesce perm-type (map (comp keyword :perm_value) rows))))

(defn- coalesce-ranks
  "The [[coalesce]]d value of the `perm-type` values ranked `mn` and `mx`, or nil when `mn` is nil."
  [perm-type mn mx]
  (when mn
    (let [^PersistentVector values (-> permissions.schema/data-permissions perm-type :values)]
      (coalesce perm-type [(nth values mn) (nth values mx)]))))

(defn- probe-order
  "The `perm-type` values in the order [[coalesce]] prefers them."
  [perm-type]
  (if (= perm-type :perms/view-data)
    [:unrestricted :blocked :legacy-no-self-service]
    (-> permissions.schema/data-permissions perm-type :values)))

(defn- table-rows-permissions
  "The coalesced `perm-type` value of the rows `database-level-values` and `table-level-values` return for each Table of
  `table-id->db-id` within its Database, the Database's own and the Table's, as `{table-id value}`, nil without rows."
  [database-level-values table-level-values perm-type table-id->db-id]
  (let [db-rows    (group-by :db_id (chunked database-level-values (distinct (vals table-id->db-id))))
        table-rows (group-by (juxt :table_id :db_id)
                             (chunked table-level-values (filter pos-int? (keys table-id->db-id))))]
    (into {} (map (fn [[table-id db-id]]
                    [table-id (coalesce-rows perm-type (concat (db-rows db-id) (table-rows [table-id db-id])))]))
          table-id->db-id)))

(defn- probed-permission
  "The first `perm-type` value in [[probe-order]] that `user-id` has on a row in `scope`, or nil."
  [user-id perm-type scope]
  (u/seek #(permissions.db/user-has-perm-value? user-id perm-type % scope) (probe-order perm-type)))

;;; ---------------------------------------------- Table level checks ----------------------------------------------

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *additional-table-permissions*
  "See the `with-additional-table-permission` macro below."
  {})

(defmacro with-additional-table-permission
  "Sometimes, for sandboxing, we need to run something in a context with additional permissions - for example, so that a
  user can read a table to which they have only sandboxed access.

  I intentionally did *not* build this as a general-purpose 'add an additional context' macro, because supporting it
  for every function in the DataPermission API will be challenging, and the API is still in flux. Instead, for now,
  this is a very tightly constrained macro that only adds an additional *table* level permission, and only affects the
  output of `table-permissions-for-user`."
  [perm-type database-id table-id perm-value & form]
  `(binding [*additional-table-permissions* (assoc-in *additional-table-permissions*
                                                      [~database-id ~table-id ~perm-type]
                                                      ~perm-value)]
     ~@form))

(defn- additional-table-permission
  "The additional `perm-type` value bound for the Table with `table-id` in the Database with `db-id`, or nil."
  [db-id table-id perm-type]
  (get-in *additional-table-permissions* [db-id table-id perm-type]))

(defn- check-table-level
  "Throws unless `perm-type` is a Table-level permission type."
  [perm-type]
  (when (not= :model/Table (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is not a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)}))))

(defn- has-highest-everywhere?
  "Whether the user of `user-info` has the most permissive `perm-type` value everywhere without asking, as a superuser
  has, and a data analyst has for managing table metadata."
  [{:keys [is-superuser? is-data-analyst?]} perm-type]
  (boolean (or is-superuser?
               (and (= perm-type :perms/manage-table-metadata)
                    is-data-analyst?))))

(defn- no-user?
  "Whether `user-info` names no user and no superuser context, which has no permissions."
  [{:keys [user-id is-superuser?]}]
  (and (nil? user-id) (not is-superuser?)))

(defn- coalesce-with-additional
  "The [[coalesce]]d value of `value`, a Table's own answer or nil, and the additional value bound for the Table."
  [perm-type db-id table-id value]
  (coalesce perm-type (into #{} (remove nil?) [value (additional-table-permission db-id table-id perm-type)])))

(def ^:private TableIdToDatabaseId
  "The Tables a bulk Table question is about, each with its Database: `{table-id db-id}`, table 0 standing for no
  Table of the Database."
  [:map-of ms/IntGreaterThanOrEqualToZero ::lib.schema.id/database])

(mu/defn table-permissions-for-user :- [:map-of ms/IntGreaterThanOrEqualToZero ::permissions.schema/data-permission-value]
  "The `perm-type` value that the user of `user-info` has on each Table of `table-id->db-id`, as `{table-id value}` with
  an entry for every Table asked: the most permissive across their groups of the Database's and the Table's rows, and,
  on EE, `:query-builder` for a Table published into a Collection they read. The Tables cost one query for their
  Databases' rows and one for their own, per 1,000 ids."
  [{:keys [user-id] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                       :- ::permissions.schema/data-permission-type
   table-id->db-id                 :- TableIdToDatabaseId]
  (check-table-level perm-type)
  (let [least (least-permissive-value perm-type)]
    (cond
      (empty? table-id->db-id)
      {}

      (has-highest-everywhere? user-info perm-type)
      (zipmap (keys table-id->db-id) (repeat (most-permissive-value perm-type)))

      :else
      (let [rows        (if (no-user? user-info)
                          {}
                          (table-rows-permissions #(permissions.db/user-database-level-values user-id perm-type %)
                                                  #(permissions.db/user-table-level-values user-id perm-type %)
                                                  perm-type table-id->db-id))
            permissions (into {}
                              (map (fn [[table-id db-id]]
                                     [table-id (or (coalesce-with-additional perm-type db-id table-id (get rows table-id))
                                                   least)]))
                              table-id->db-id)
            unanswered  (into [] (comp (filter (fn [[table-id value]] (and (pos-int? table-id) (= value least))))
                                       (map key))
                              permissions)]
        (merge permissions
               (when (and (seq unanswered) (not (no-user? user-info)))
                 (published-tables/published-table-permissions user-info perm-type unanswered)))))))

(mu/defn user-has-permission-for-tables? :- :boolean
  "Whether [[table-permissions-for-user]] is `perm-value` or more permissive on every Table of `table-id->db-id`."
  [user-info       :- ::permissions.schema/data-user-info
   perm-type       :- ::permissions.schema/data-permission-type
   perm-value      :- ::permissions.schema/data-permission-value
   table-id->db-id :- TableIdToDatabaseId]
  (every? #(at-least-as-permissive? perm-type % perm-value)
          (vals (table-permissions-for-user user-info perm-type table-id->db-id))))

(mu/defn table-permissions-for-groups :- [:map-of ms/IntGreaterThanOrEqualToZero ::permissions.schema/data-permission-value]
  "The `perm-type` value that the groups with `group-ids` give on each Table of `table-id->db-id`, as `{table-id
  value}`: the most permissive of the Database's and the Table's rows."
  [group-ids       :- [:set ms/PositiveInt]
   perm-type       :- ::permissions.schema/data-permission-type
   table-id->db-id :- TableIdToDatabaseId]
  (check-table-level perm-type)
  (let [least (least-permissive-value perm-type)
        rows  (if (or (empty? group-ids) (empty? table-id->db-id))
                {}
                (table-rows-permissions #(permissions.db/groups-database-level-values group-ids perm-type %)
                                        #(permissions.db/groups-table-level-values group-ids perm-type %)
                                        perm-type table-id->db-id))]
    (into {}
          (map (fn [[table-id db-id]]
                 [table-id (or (coalesce-with-additional perm-type db-id table-id (get rows table-id)) least)]))
          table-id->db-id)))

;;; --------------------------------------------- Schema level checks ----------------------------------------------

(mu/defn some-table-in-schema-permission-for-user :- ::permissions.schema/data-permission-value
  "The most permissive `perm-type` value that the user of `user-info` has on some Table of the schema `schema-name` of
  the Database with `database-id`, nil and the empty string being one schema, as `database-schemas` presents them."
  [{:keys [user-id] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                       :- ::permissions.schema/data-permission-type
   database-id                     :- ::lib.schema.id/database
   schema-name                     :- [:maybe :string]]
  (check-table-level perm-type)
  (cond
    (has-highest-everywhere? user-info perm-type) (most-permissive-value perm-type)
    (no-user? user-info)                          (least-permissive-value perm-type)
    :else
    (or (probed-permission user-id perm-type {:db-id database-id :schema-name schema-name})
        (least-permissive-value perm-type))))

(mu/defn every-table-in-schema-permission-for-user :- ::permissions.schema/data-permission-value
  "The `perm-type` value that the user of `user-info` has on every Table of the schema `schema-name` of the Database
  with `database-id`, nil naming the Tables without one: per group its most restrictive value there, and across groups
  the most permissive of those."
  [{:keys [user-id] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                       :- ::permissions.schema/data-permission-type
   database-id                     :- ::lib.schema.id/database
   schema-name                     :- [:maybe :string]]
  (check-table-level perm-type)
  (cond
    (has-highest-everywhere? user-info perm-type) (most-permissive-value perm-type)
    (no-user? user-info)                          (least-permissive-value perm-type)
    :else
    (or (let [{:keys [mn mx]} (permissions.db/most-restrictive-rank-pair user-id perm-type
                                                                         {:db-id         database-id
                                                                          :schema-name   schema-name
                                                                          :exact-schema? true})]
          (coalesce-ranks perm-type mn mx))
        (least-permissive-value perm-type))))

;;; -------------------------------------------- Database level checks ---------------------------------------------

(defn- database-answers
  "`{db-id value}` for `db-ids`, from `answer`, a function of the ids returning `{db-id value-or-nil}`, with the most
  permissive value for a user who has it everywhere and the least permissive one where there is no answer."
  [user-info perm-type db-ids highest? answer]
  (let [db-ids (vec (distinct db-ids))
        least  (least-permissive-value perm-type)]
    (cond
      (empty? db-ids)      {}
      highest?             (zipmap db-ids (repeat (most-permissive-value perm-type)))
      (no-user? user-info) (zipmap db-ids (repeat least))
      :else                (let [answers (answer db-ids)]
                             (into {} (map (fn [db-id] [db-id (or (get answers db-id) least)])) db-ids)))))

(mu/defn database-permissions-for-user :- [:map-of ::lib.schema.id/database ::permissions.schema/data-permission-value]
  "The value of the Database-level `perm-type` that the user of `user-info` has on each of the Databases with `db-ids`,
  as `{db-id value}`: the most permissive across their groups."
  [{:keys [user-id is-superuser?] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                                     :- ::permissions.schema/data-permission-type
   db-ids                                        :- [:sequential ::lib.schema.id/database]]
  (when (not= :model/Database (model-by-perm-type perm-type))
    (throw (ex-info (tru "Permission type {0} is a table-level permission." perm-type)
                    {perm-type (permissions.schema/data-permissions perm-type)})))
  (database-answers user-info perm-type db-ids (boolean is-superuser?)
                    (fn [db-ids]
                      (let [rows (group-by :db_id
                                           (chunked #(permissions.db/user-database-level-values user-id perm-type %)
                                                    db-ids))]
                        (into {} (map (fn [db-id] [db-id (coalesce-rows perm-type (rows db-id))])) db-ids)))))

(mu/defn user-has-permission-for-databases? :- :boolean
  "Whether [[database-permissions-for-user]] is `perm-value` or more permissive on every one of the Databases with
  `db-ids`."
  [user-info  :- ::permissions.schema/data-user-info
   perm-type  :- ::permissions.schema/data-permission-type
   perm-value :- ::permissions.schema/data-permission-value
   db-ids     :- [:sequential ::lib.schema.id/database]]
  (every? #(at-least-as-permissive? perm-type % perm-value)
          (vals (database-permissions-for-user user-info perm-type db-ids))))

(mu/defn every-table-in-database-permissions-for-user :- [:map-of ::lib.schema.id/database
                                                          ::permissions.schema/data-permission-value]
  "The `perm-type` value that the user of `user-info` has on every Table of each of the Databases with `db-ids`, as
  `{db-id value}`: per group its most restrictive value there, and across groups the most permissive of those."
  [{:keys [user-id] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                       :- ::permissions.schema/data-permission-type
   db-ids                          :- [:sequential ::lib.schema.id/database]]
  (check-table-level perm-type)
  (database-answers user-info perm-type db-ids (has-highest-everywhere? user-info perm-type)
                    (fn [db-ids]
                      (into {}
                            (map (fn [{:keys [db_id mn mx]}] [db_id (coalesce-ranks perm-type mn mx)]))
                            (chunked #(permissions.db/database-most-restrictive-rank-pairs user-id perm-type %)
                                     db-ids)))))

(mu/defn some-table-in-database-permissions-for-user :- [:map-of ::lib.schema.id/database
                                                         ::permissions.schema/data-permission-value]
  "The most permissive `perm-type` value that the user of `user-info` has on some Table of each of the Databases with
  `db-ids`, as `{db-id value}`."
  [{:keys [user-id] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                       :- ::permissions.schema/data-permission-type
   db-ids                          :- [:sequential ::lib.schema.id/database]]
  (check-table-level perm-type)
  (database-answers user-info perm-type db-ids (has-highest-everywhere? user-info perm-type)
                    (fn [db-ids]
                      (let [order (probe-order perm-type)]
                        (into {}
                              (map (fn [{:keys [db_id i]}] [db_id (some->> i (nth order))]))
                              (chunked #(permissions.db/database-best-value-indexes user-id perm-type order %)
                                       db-ids))))))

;;; ----------------------------------------------- Whole-user checks -----------------------------------------------

(mu/defn some-table-permission-for-user :- ::permissions.schema/data-permission-value
  "The most permissive `perm-type` value that the user of `user-info` has on some Table of any Database. Throws for
  `:perms/view-data`, whose `:blocked` overrides `:legacy-no-self-service` only within one Database."
  [{:keys [user-id] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                       :- ::permissions.schema/data-permission-type]
  (check-table-level perm-type)
  (cond
    (has-highest-everywhere? user-info perm-type)
    (most-permissive-value perm-type)

    (= perm-type :perms/view-data)
    (throw (ex-info (tru "Permission type {0} needs a database." perm-type)
                    {:perm-type perm-type}))

    (no-user? user-info)
    (least-permissive-value perm-type)

    :else
    (or (probed-permission user-id perm-type {})
        (least-permissive-value perm-type))))

(mu/defn user-has-highest-permission-anywhere? :- :boolean
  "Whether the user of `user-info` has the most permissive `perm-type` value on some Database or active Table, outside
  the Databases with `:exclude-db-ids`."
  [{:keys [user-id] :as user-info} :- ::permissions.schema/data-user-info
   perm-type                       :- ::permissions.schema/data-permission-type
   & {:keys [exclude-db-ids]} :- [:maybe [:map {:closed true}
                                          [:exclude-db-ids {:optional true} [:maybe [:sequential ::lib.schema.id/database]]]]]]
  (boolean
   (or (has-highest-everywhere? user-info perm-type)
       (and (not (no-user? user-info))
            (permissions.db/user-has-perm-value? user-id perm-type (most-permissive-value perm-type)
                                                 {:exclude-db-ids exclude-db-ids})))))

;;; ---------------------------------------------------- Sandboxes ----------------------------------------------------

(defenterprise enforced-sandboxes-for-user
  "Given a user-id, returns the set of sandboxes that should be enforced for the provided user ID. Empty on OSS
  instances."
  metabase-enterprise.sandbox.api.util
  [_user-id]
  #{})

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic *sandboxes-for-user*
  "The sandboxes enforced for the user of the request, looked up at most once, when first asked for, within
  [[with-sandboxes-for-user]]; none outside it."
  (delay nil))

(defn sandboxes-for-user
  "The sandboxes enforced for the user of the request (see [[*sandboxes-for-user*]])."
  []
  @*sandboxes-for-user*)

(defmacro with-sandboxes-for-user
  "Runs `body` with the sandboxes enforced for the user with `user-id` looked up at most once."
  [user-id & body]
  `(binding [*sandboxes-for-user* (delay (enforced-sandboxes-for-user ~user-id))]
     ~@body))

;;; ---------------------------------------- Fetching a user's permissions --------------------------------------------

(defn- admin-permission-graph
  "Returns the graph representing admin permissions for all groups"
  [& {:keys [db-id perm-type]}]
  ;; destination databases are reachable only through their router and never carry permissions of their own
  (let [db-ids     (if db-id [db-id] (permissions.db/non-destination-database-ids))
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
  [user-id :- ::lib.schema.id/user
   & {:keys [db-id perm-type]} :- [:maybe [:map {:closed true}
                                           [:db-id     {:optional true} [:maybe ::lib.schema.id/database]]
                                           [:perm-type {:optional true} [:maybe ::permissions.schema/data-permission-type]]]]]
  (if (is-superuser? user-id)
    (admin-permission-graph :db-id db-id :perm-type perm-type)
    (let [data-perms    (permissions.db/user-data-permissions user-id db-id perm-type)
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

(defn assert-valid-permission
  "Throws unless `permission` has a valid permission type and a value of that type."
  [{:keys [perm_type perm_value] :as permission}]
  (when-not (mr/validate ::permissions.schema/data-permission-type perm_type)
    (throw (ex-info (str/join (mu/explain ::permissions.schema/data-permission-type perm_type)) permission)))
  (assert-value-matches-perm-type perm_type perm_value))

;; Memoized per application DB. Destination status is immutable after creation, so the cache can't go stale.

(def ^:private destination-db-id?
  "Whether `db-id` is a destination database — one with `router_database_id` set."
  (mdb/memoize-for-application-db
   (fn [db-id]
     (permissions.db/destination-database? db-id))))

(defn assert-no-destination-db-permissions!
  "Throws if any row in `perm-rows` targets a destination database — one with `router_database_id`
  set. Destinations are reachable only through their router and must never carry `data_permissions`
  rows."
  [perm-rows]
  (when-let [dest-ids (seq (into #{} (comp (keep :db_id) (filter destination-db-id?)) perm-rows))]
    (throw (ex-info (tru "Cannot grant permissions on a destination database.")
                    {:status-code 400 :destination-db-ids dest-ids}))))

(def ^:private TheIdable
  "An ID, or something with an ID."
  [:or pos-int?
   ::permissions.schema/permissions-group
   :metabase.warehouses.schema/database
   :metabase.warehouse-schema.schema/table])

(def ^:private PermsIndex
  "An in-memory index of DataPermissions rows, as built by [[index-database-permissions]]: `{[group-id db-id
  perm-type] [DataPermissions-row ...]}`."
  [:map-of
   [:tuple pos-int? pos-int? ::permissions.schema/data-permission-type]
   [:sequential ::permissions.schema/data-permissions]])

(defn- merge-perm-changes
  "Merges `{:to-delete [...] :to-insert [...]}` maps, deduping as it concatenates: several implication
  paths can produce the same row — e.g. `view-data :blocked` implies `:perms/transforms :no` both
  directly and via the implied `create-queries :no` — and inserting every copy creates duplicate
  data_permissions rows (UXW-4927)."
  [& changes]
  (apply merge-with (fn [a b] (distinct (concat a b))) changes))

(mu/defn- build-database-permission
  "Builds a sequence of DataPermissions models to delete and insert for setting a single permission to a specified
  value for a given group and database. If a permission value already exists for the specified group and object,
  it will be updated to the new value.

  Block permissions (i.e. :perms/view-data :blocked) can be set at the table or database-level.

  Returns a map with keys:
  - :to-delete - sequence of DataPermissions models to delete
  - :to-insert - sequence of DataPermissions models to insert "
  [perms       :- PermsIndex
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
    (apply merge-perm-changes
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
    (permissions.db/insert-data-permissions! batched-new-perms)))

(defn batch-delete-permissions!
  "Much like on insert, sometimes we have to delete more permission models than the psql limit of MAX 16-bit parameters.
  This batches our deletes into groups of `permission-batch-size`."
  [to-delete-ids]
  (doseq [batched-to-delete-ids (partition-all permission-batch-size to-delete-ids)]
    (permissions.db/delete-data-permissions! batched-to-delete-ids)))

(defn index-database-permissions
  "Given seqs of `group-ids` and `db-ids`, computes an index of all relevant permissions.

  Use this to avoid N+1s in repeated [[set-database-permission!]] calls.

  BEWARE race conditions! This function must be run inside a cluster lock on the relevant DB(s), or you risk working
  from stale data and generating bad permissions. See
  [[metabase.permissions.data-permissions-test/race-conditions-test]].

  Returns a map of `{[group-id db-id perm-type] [DataPermission ...]}`. Returns nil if either input list is empty."
  [group-ids db-ids]
  (when (and (seq group-ids) (seq db-ids))
    (group-by (juxt :group_id :db_id :perm_type)
              (permissions.db/data-permissions-for-groups-and-databases group-ids db-ids))))

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
  ([perms       :- PermsIndex
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
                 (permissions.db/table-location table))]
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
      ;; We can't filter out *everything* in the database because the max number of parameters is capped. But we
      ;; might as well filter out what we can (conservatively).
      (let [other-new-perms (->> (permissions.db/table-ids-and-schemas-excluding db-id (take 10000 table-ids))
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
                                    (permissions.db/other-table-permission-values group-id
                                                                                  db-id
                                                                                  (u/qualified-name perm-type)
                                                                                  table-ids))]
    (if (and (= (count existing-table-values) 1)
             (= values existing-table-values))
      ;; If all tables would have the same permissions after we update these ones, we can replace all of the table
      ;; perms with a DB-level perm instead.
      (build-database-permission (index-database-permissions [group-id] [db-id])
                                 group-id db-id perm-type (first values))
      ;; Otherwise, just replace the rows for the individual table perm
      ;; only :id is consumed downstream (see [[set-table-permissions-internal!]]), so don't fetch full rows
      (let [table-perms-to-delete (permissions.db/table-permission-ids (u/qualified-name perm-type) group-id table-ids)]
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
      ;; merge-perm-changes rather than plain concat: the main case and the recursive implications can
      ;; produce the same row — e.g. setting `create-queries` coalesces to a DB-level row whose
      ;; implications include `view-data :unrestricted`, and the recursive table-level `view-data`
      ;; call coalesces to that same DB-level row.
      (apply merge-perm-changes
             (if-let [existing-db-perm (permissions.db/database-level-permission (u/qualified-name perm-type) group-id db-id)]
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
                (permissions.db/table-database-id table-or-id))]
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

(defenterprise data-app-collection-ids
  "Ids of the collections data apps own, which hold the copies an app runs. OSS has none."
  metabase-enterprise.data-apps.models.data-app
  []
  #{})

(defenterprise data-app-collection?
  "Whether the collection is in the data-apps namespace. OSS has none."
  metabase-enterprise.data-apps.models.data-app
  [_collection-id]
  false)

(defenterprise collection-owned-by-data-app?
  "Whether the collection with `collection-id` belongs to an existing data app. OSS has none."
  metabase-enterprise.data-apps.core
  [_collection-id]
  false)

(defenterprise new-table-sandboxed-groups
  "Returns the subset of `group-ids` whose new tables on `db-id` have a sandbox somewhere in this DB, and must therefore
  have their `view-data` forced to `:blocked` regardless of the new table's schema.

  On OSS there are no sandboxes, so the set is always empty. The EE implementation is `:feature :none`: a sandbox that
  is already configured keeps forcing new tables to `:blocked` even when the token no longer grants `:sandboxes`."
  metabase-enterprise.advanced-permissions.common
  [_db-id _group-ids]
  #{})

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
        (let [au-id    (permissions.db/group-id-by-magic-type "all-internal-users")
              au-perms (permissions.db/distinct-database-permission-values-for-group au-id)
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
                         (permissions.db/non-audit-permission-values-for-groups
                          group-ids
                          ["perms/create-queries" "perms/download-results"]))
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
        db-level    (permissions.db/database-level-permissions db-id group-ids qn)
        ;; `schema-vals-idx` only needs the set of distinct perm-values per
        ;; (group, perm-type, schema). Selecting DISTINCT on those four columns
        ;; keeps the result bounded by groups × perm-types × schemas × values
        ;; instead of growing with the table count, which can be millions of
        ;; rows on databases with very many tables (see #76077).
        table-level (permissions.db/distinct-table-level-permission-values db-id group-ids qn)]
    {:db-id            db-id
     :db-level-idx     (into {} (map (juxt (juxt :group_id :perm_type) identity)) db-level)
     :schema-vals-idx  (reduce (fn [acc {:keys [group_id perm_type schema_name perm_value]}]
                                 (update-in acc [group_id perm_type schema_name] (fnil conj #{}) perm_value))
                               {} table-level)
     :all-db-tables    (permissions.db/active-table-locations-for-database db-id)
     :view-data-levels (new-table-view-data-permission-levels db-id group-ids)
     :sandboxed-groups (new-table-sandboxed-groups db-id group-ids)}))

(defn- compute-actual-value
  "Per-entry resolution for a new table's permission value for a given `group-id` and `perm-type`.

  For perms other than `view-data`, the new table inherits its schema's value when all existing tables in that schema
  agree, otherwise the default supplied by the caller.

  For `view-data` the order depends on where the table came from, which we read off its `:data_source`:

  - Sync (any other data source): the enterprise DB-wide override wins. If the group has *any* `:blocked` table (or a
    sandbox) in the DB, then it has only partial access, so a newly-discovered, unclassified table fails safe to
    `:blocked`.
  - Upload (`:data_source` is `:upload`): if the permissions for all (active) tables in the new table's schema are
    unanimously `:unrestricted`, then the new table is granted the same permission.
    - This is a specific override for an uploaded table, since otherwise the user would be both locked out of their
      own freshly uploaded table *and* prevented from making any further uploads! (Since uploads require at least one
      group with unanimous `:unrestricted` access to the target schema. See UXW-3217.)

  Note that if the group has a sandbox anywhere on this DB, the uploaded table is still `:blocked`, preventing any
  leak of data to that group which should be sandboxed."
  [{:keys [sandboxed-groups schema-vals-idx view-data-levels]}
   {:keys [group-id perm-type default-value table]}]
  (let [view-data?   (= perm-type :perms/view-data)
        upload?      (= :upload (some-> table :data_source keyword))
        schema-value (let [sv (get-in schema-vals-idx [group-id perm-type (:schema table)])]
                       (when (and (seq sv) (= (count sv) 1))
                         (first sv)))
        override     (when view-data?
                       (get view-data-levels group-id))]
    (or (when (and view-data? (contains? sandboxed-groups group-id))
          :blocked)
        (if (and view-data? upload?)
          (or schema-value override)
          (or override schema-value))
        default-value)))

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
      (when (or (seq to-delete) (seq to-insert))
        ;; One transaction so a failed insert (e.g. a unique-constraint violation) can't leave the
        ;; DB-level rows deleted but the table-level expansion half-written.
        (t2/with-transaction [_conn]
          (when (seq to-delete) (batch-delete-permissions! to-delete))
          (when (seq to-insert) (batch-insert-permissions! to-insert)))))))

(defn set-default-table-permissions!
  "Set default permissions for a newly-created table across all relevant
  groups. Handles three cases per `(group, perm-type)`:
   - Group has DB-level perm covering the default (including `:blocked` covering `:blocked`) → no-op
   - Group has non-`:blocked` DB-level perm but new table needs `:blocked` → going-granular
   - Group has no DB-level perm → simple insert

   `group-perm-defaults` is a seq of `{:group-id :perm-type :default-value}`
   triples. Thin wrapper over [[set-default-table-permissions-bulk!]] for
   the single-table case.

   `table` may be a Table ID or a Table map. A map must carry `:data_source`, since [[compute-actual-value]] branches
   on whether the table came from an upload; the `:model/Table` after-insert hook passes the full inserted row."
  [table group-perm-defaults]
  (let [table (if (map? table)
                table
                (permissions.db/table-location table))]
    (set-default-table-permissions-bulk! (:db_id table) [[table group-perm-defaults]])))

(defenterprise download-perms-level
  "Return the download permission for the query that the given user has. OSS returns :full"
  metabase-enterprise.advanced-permissions.models.permissions.data-permissions
  [_query _user-id]
  :full)

(mu/defn user-has-transforms-permission-for-database? :- :boolean
  "Whether the user of `user-info` has the transforms permission on the Database with `database-id`, which no one has
  on the audit Database."
  [user-info   :- ::permissions.schema/data-user-info
   database-id :- ::lib.schema.id/database]
  (and (not= database-id audit/audit-db-id)
       (user-has-permission-for-databases? user-info :perms/transforms :yes [database-id])))

(mu/defn user-has-transforms-permission-anywhere? :- :boolean
  "Whether the user of `user-info` has the transforms permission on some Database."
  [user-info :- ::permissions.schema/data-user-info]
  (user-has-highest-permission-anywhere? user-info :perms/transforms))
