(ns metabase-enterprise.permission-debug.reasons
  "The reasons behind a permission debugging answer, per group: what each group the person is in gives on a Collection
  and on the Tables a query reads, which row and column security, connection impersonation and database routing
  apply to them, and what keeps those from working."
  (:require
   [metabase-enterprise.permission-debug.db :as permission-debug.db]
   [metabase.api.common :as api]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.match :as match]))

(set! *warn-on-reflection* true)

(def ^:private router-sentinel
  "The routing attribute value that keeps a person's queries on the router database itself."
  "__METABASE_ROUTER__")

(def ^:private collection-values
  {:read-and-write :curate
   :read           :view
   :none           :none})

(def ^:private table-permission-types
  {:view-data        :perms/view-data
   :create-queries   :perms/create-queries
   :download-results :perms/download-results})

(defn- group-names
  "A map of group id to the name an admin sees for each of `groups`."
  [groups]
  (let [using-tenants? (boolean (setting/get :use-tenants))]
    (into {} (map (fn [group] [(:id group) (perms/group-display-name group using-tenants?)])) groups)))

(defn- by-group
  "One `{:group-id :group-name :value :applies?}` per group of `groups`, with `value-of` giving the group's value
  (a keyword) and `applies?` marking the groups whose value is `effective`, unless that is `nothing`."
  [groups names value-of effective nothing]
  (mapv (fn [{:keys [id]}]
          (let [value (value-of id)]
            {:group-id   id
             :group-name (get names id)
             :value      (name value)
             :applies?   (and (= value effective) (not= value nothing))}))
        groups))

;;; ------------------------------------------------ Collection --------------------------------------------------

(defn collection-reasons
  "What each group of the User with `user-id` gives on the Collection with `collection-id` (nil: the root of
  `root-namespace`, by default of the default namespace), and the User's own access. `:by-rule` is true when the User
  has access that no group gives, as a personal or tenant Collection does, and `:personal?` when the Collection is
  someone's personal Collection."
  ([user-id collection-id]
   (collection-reasons user-id collection-id nil))
  ([user-id collection-id root-namespace]
   (let [collection (some-> collection-id permission-debug.db/collection)
         groups     (permission-debug.db/user-groups user-id)
         names      (group-names groups)
         target     (or collection-id {:metabase.collections.models.collection.root/is-root? true
                                       :namespace                                            (some-> root-namespace name)})
         writes     (perms/collection-readwrite-path target)
         reads      (perms/collection-read-path target)
         grants     (set (permission-debug.db/collection-grant-objects (set (map :id groups)) [writes reads]))
         group-read (fn [group-id]
                      (cond
                        (grants [group-id writes]) :read-and-write
                        (grants [group-id reads])  :read
                        :else                      :none))
         effective  (get (perms/collection-permissions-for-user (perms/user-info user-id) [collection-id]
                                                                {:root-namespace root-namespace})
                         collection-id)
         value-of   (comp collection-values group-read)]
     {:collection-id collection-id
      :name          (cond
                       collection-id  (:name collection)
                       root-namespace (tru "Shared collections")
                       :else          (tru "Our analytics"))
      :personal?     (some? (:personal_owner_id collection))
      :value        (name (collection-values effective))
      :by-rule       (and (not= :none effective)
                          (every? #(= :none (group-read (:id %))) groups))
      :groups        (by-group groups names value-of (collection-values effective) :none)})))

;;; --------------------------------------------------- Tables ---------------------------------------------------

(defn- column-label
  "How a Sandbox's remapping target reads: `Table.Field` for a Field, else the name the target gives."
  [field-labels target]
  (let [field-id (if (integer? target)
                   target
                   (match/match-one target [:field (id :guard pos-int?) _] id))]
    (or (get field-labels field-id)
        (when (string? target) target)
        (match/match-one target [:variable [:template-tag tag-name]] (name tag-name))
        "")))

(defn- sandbox-reasons
  "The row and column security `sandboxes` of the groups, each with the person's attribute values."
  [sandboxes names enforced-ids attributes]
  (let [field-ids    (into #{} (comp (mapcat (comp vals :attribute_remappings))
                                     (keep #(if (integer? %) % (match/match-one % [:field (id :guard pos-int?) _] id))))
                           sandboxes)
        field-labels (permission-debug.db/field-labels field-ids)]
    (mapv (fn [{:keys [id group_id table_id card_id attribute_remappings]}]
            {:sandbox-id       id
             :table-id         table_id
             :group-id         group_id
             :group-name       (get names group_id)
             :enforced?        (contains? enforced-ids id)
             :columns-limited? (some? card_id)
             :filters          (mapv (fn [[attribute target]]
                                       {:attribute attribute
                                        :value     (some-> (get attributes attribute) str)
                                        :column    (column-label field-labels target)
                                        :missing?  (nil? (get attributes attribute))})
                                     attribute_remappings)})
          sandboxes)))

(defn- table-entry
  "One Table's entry: what each group gives for each kind of table permission, and its Sandboxes."
  [groups names table->db user-info group-values sandboxes {:keys [id db_id schema name db_name]}]
  (let [permissions (into {}
                          (map (fn [[kind perm-type]]
                                 (let [effective (get (perms/table-permissions-for-user user-info perm-type table->db) id)]
                                   [kind {:value  (clojure.core/name effective)
                                          :groups (by-group groups names #(get-in group-values [perm-type % id])
                                                            effective (perms/least-permissive-data-perms-value perm-type))}])))
                          table-permission-types)]
    (merge {:table-id id :db-id db_id :db-name db_name :schema schema :name name}
           permissions
           {:sandboxes (filterv #(= id (:table-id %)) sandboxes)})))

(defn- impersonation-enforced?
  [database-id]
  (try
    (boolean (perms/impersonation-enforced-for-db? database-id))
    (catch clojure.lang.ExceptionInfo _
      ;; the policies conflict, which `sandbox-and-impersonation` problems report
      true)))

(defn- impersonation-reasons
  [group-ids names database-ids database-names attributes]
  (let [enforced (into {} (map (fn [database-id] [database-id (impersonation-enforced? database-id)])) database-ids)]
    (mapv (fn [{:keys [db_id group_id attribute]}]
            {:db-id      db_id
             :db-name    (get database-names db_id)
             :group-id   group_id
             :group-name (get names group_id)
             :attribute  attribute
             :value      (some-> (get attributes attribute) str)
             :missing?   (nil? (get attributes attribute))
             :enforced?  (get enforced db_id)})
          (permission-debug.db/impersonations group-ids database-ids))))

(defn- route-reasons
  [database-ids attributes]
  (mapv (fn [{:keys [database_id user_attribute name]}]
          (let [value       (some-> (get attributes user_attribute) str)
                destination (when (and value (not= value router-sentinel))
                              (permission-debug.db/destination-database database_id value))]
            {:db-id            database_id
             :db-name          name
             :attribute        user_attribute
             :value            value
             :status           (cond
                                 (= value router-sentinel) "router"
                                 (nil? value)              "missing-value"
                                 destination               "routed"
                                 :else                     "no-destination")
             :destination-id   (:id destination)
             :destination-name (:name destination)}))
        (permission-debug.db/routers database-ids)))

(defn- problems
  "What keeps the policies of `tables`, `impersonations` and `routes` from working: a missing attribute value, two
  enforced policies on one Table, row and column security with impersonation on one Database."
  [tables impersonations routes]
  (let [sandboxes     (filter :enforced? (mapcat :sandboxes tables))
        table->db     (into {} (map (juxt :table-id :db-id)) tables)
        sandbox-dbs   (into #{} (map (comp table->db :table-id)) sandboxes)
        enforced-imps (filter :enforced? impersonations)]
    (vec
     (concat
      (for [{:keys [table-id filters]} sandboxes
            {:keys [attribute missing?]} filters
            :when missing?]
        {:type "missing-attribute" :attribute attribute :table-id table-id})
      (for [[table-id table-sandboxes] (group-by :table-id sandboxes)
            :when (> (count table-sandboxes) 1)]
        {:type "conflicting-sandboxes" :table-id table-id :group-ids (mapv :group-id table-sandboxes)})
      (for [{:keys [db-id attribute missing?]} enforced-imps
            :when missing?]
        {:type "missing-attribute" :attribute attribute :db-id db-id})
      (for [db-id (distinct (map :db-id enforced-imps))
            :when (contains? sandbox-dbs db-id)]
        {:type "sandbox-and-impersonation" :db-id db-id})
      (for [{:keys [db-id attribute status]} routes
            :when (#{"missing-value" "no-destination"} status)]
        {:type      (if (= status "missing-value") "routing-missing-value" "routing-no-destination")
         :attribute attribute
         :db-id     db-id})))))

(defn table-reasons
  "The reasons for the Tables with `table-ids` for the User with `user-id`: per Table, what each group gives for View
  data, Create queries and Download results and the row and column security that applies; per Database, the
  connection impersonation and the routing; and the `:problems` that keep a policy from working."
  [user-id table-ids]
  (let [tables         (permission-debug.db/tables-with-database (set table-ids))
        table->db      (into {} (map (juxt :id :db_id)) tables)
        database-ids   (set (vals table->db))
        database-names (into {} (map (juxt :db_id :db_name)) tables)
        groups         (permission-debug.db/user-groups user-id)
        group-ids      (set (map :id groups))
        names          (group-names groups)
        user-info      (perms/user-info user-id)
        group-values   (into {}
                             (map (fn [perm-type]
                                    [perm-type (into {}
                                                     (map (fn [group-id]
                                                            [group-id (perms/table-permissions-for-groups #{group-id} perm-type table->db)]))
                                                     group-ids)]))
                             (vals table-permission-types))
        {:keys [enforced-ids attributes]}
        (request/with-current-user user-id
          {:enforced-ids (into #{} (map :id) (perms/sandboxes-for-user))
           :attributes   (api/current-user-attributes)})
        sandboxes      (sandbox-reasons (permission-debug.db/sandboxes group-ids (set (keys table->db)))
                                        names enforced-ids attributes)
        entries        (mapv (partial table-entry groups names table->db user-info group-values sandboxes) tables)
        impersonations (request/with-current-user user-id
                         (impersonation-reasons group-ids names database-ids database-names attributes))
        routes         (route-reasons database-ids attributes)]
    {:tables         entries
     :impersonations impersonations
     :routes         routes
     :problems       (problems entries impersonations routes)}))

;;; --------------------------------------------------- Everything -----------------------------------------------

(defn- collection-entries
  "The [[collection-reasons]] of the Collections an access answer lists for the User with `user-id`, each with its
  `:location` and `:namespace`, one namespace after the other. The default namespace and, with tenants on, the shared
  one start with their root; the tenant Collections come last and have no root to list."
  [user-id]
  (let [tenants?    (boolean (setting/get :use-tenants))
        collections (group-by :namespace (permission-debug.db/accessible-collections
                                          user-id (if tenants? ["shared-tenant-collection" "tenant-specific"] [])))
        root        (fn [root-namespace]
                      (assoc (collection-reasons user-id nil root-namespace)
                             :location "/" :namespace root-namespace))
        entries     (fn [collection-namespace]
                      (for [{:keys [id location]} (get collections collection-namespace)]
                        (assoc (collection-reasons user-id id) :location location :namespace collection-namespace)))]
    (vec (concat [(root nil)]
                 (entries nil)
                 (when tenants?
                   (concat [(root :shared-tenant-collection)]
                           (entries :shared-tenant-collection)
                           (entries :tenant-specific)))))))

(defn access-reasons
  "Everything the User with `user-id` can reach: `:collections`, the [[collection-entries]], and `:reasons`, the
  `table-reasons` of every active Table."
  [user-id]
  {:collections (collection-entries user-id)
   :reasons     (table-reasons user-id (permission-debug.db/active-table-ids))})
