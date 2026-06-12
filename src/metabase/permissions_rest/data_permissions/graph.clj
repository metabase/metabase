(ns metabase.permissions-rest.data-permissions.graph
  "Code involving reading and writing the API-style data permission graph. This is the graph which we use to represent
  permissions when communicating with the frontend, which has different keys and a slightly different structure
  from the one returned by `metabase.models.data-permissions/data-permissions-graph`, which is based directly on the
  keys and values stored in the `data_permissions` table.

  Essentially, this is a translation layer between the graph used by the v1 permissions schema and the v2 permissions
  schema."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.audit-app.core :as audit]
   [metabase.permissions-rest.schema :as permissions-rest.schema]
   [metabase.permissions.core :as perms]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.premium-features.core :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

;; See also: [[permissions.schema/data-permissions]]
(def ^:private ->api-keys
  {:perms/view-data             :view-data
   :perms/create-queries        :create-queries
   :perms/download-results      :download
   :perms/manage-table-metadata :data-model
   :perms/manage-database       :details
   :perms/transforms            :transforms})

(def ^:private ->api-vals
  {:perms/view-data             {:unrestricted           :unrestricted
                                 :legacy-no-self-service :legacy-no-self-service
                                 :blocked                :blocked}
   :perms/create-queries        {:query-builder-and-native :query-builder-and-native
                                 :query-builder            :query-builder
                                 :no                       :no}
   :perms/download-results      {:one-million-rows  :full
                                 :ten-thousand-rows :limited
                                 :no                nil}
   :perms/manage-table-metadata {:yes :all :no nil}
   :perms/manage-database       {:yes :yes :no :no}
   :perms/transforms            {:yes :yes :no :no}})

(defenterprise add-impersonations-to-permissions-graph
  "Augment the permissions graph with active connection impersonation policies. OSS implementation returns graph as-is."
  metabase-enterprise.impersonation.models
  [graph & [_opts]]
  graph)

(defenterprise add-sandboxes-to-permissions-graph
  "Augment the permissions graph with active connection impersonation policies. OSS implementation returns graph as-is."
  metabase-enterprise.sandbox.models.sandbox
  [graph & [_opts]]
  graph)

(mu/defn ellide? :- :boolean
  "If a table has the least permissive value for a perm type, leave it out."
  [type  :- ::permissions.schema/data-permission-type
   value :- ::permissions.schema/data-permission-value]
  (= (perms/least-permissive-data-perms-value type) value))

(defn- rename-or-ellide-kv
  "Renames a kv pair from the data-permissions-graph to an API-style data permissions graph (which we send to the client)."
  [[type value]]
  (when-not (ellide? type value)
    [(->api-keys type) ((->api-vals type) value)]))

(mu/defn- api-table-perms
  "Helper to transform 'leaf' values with table-level schemas in the data permissions graph into an API-style data permissions value.
   Coalesces permissions at the schema level if all table-level permissions within a schema are identical."
  [type :- ::permissions.schema/data-permission-type
   schema->table-id->api-val]
  (let [transform-val         (fn [perm-val] ((->api-vals type) perm-val))
        coalesce-or-transform (fn [table-id->perm]
                                (let [unique-perms (set (vals table-id->perm))]
                                  (if (= 1 (count unique-perms))
                                    ;; Coalesce to schema-level permission if all table perms are identical
                                    (transform-val (first unique-perms))
                                    ;; Otherwise, transform each table-level permission individually
                                    (into {} (map (fn [[table-id perm-val]]
                                                    [table-id (transform-val perm-val)])
                                                  (filter (fn [[_ perm-val]] (not (ellide? type perm-val)))
                                                          table-id->perm))))))]
    (->> (update-vals schema->table-id->api-val coalesce-or-transform)
         (filter second)
         (into {}))))

(defn- granular-perm-rename [perms perm-key legacy-path]
  (let [perm-value (get perms perm-key)]
    (when perm-value
      (cond
        (map? perm-value)
        (assoc-in {} legacy-path (api-table-perms perm-key perm-value))

        (not (ellide? perm-key perm-value))
        (assoc-in {} legacy-path ((->api-vals perm-key) perm-value))))))

(defn- rename-perm
  "Transforms a 'leaf' value with db-level or table-level perms in the data permissions graph into an API-style data permissions value.
  There's some tricks in here that ellide schema-level and table-level permissions values that are the most-permissive setting."
  [perm-map]
  (let [granular-keys [:perms/download-results :perms/manage-table-metadata
                       :perms/view-data :perms/create-queries]]
    (m/deep-merge
     (into {} (keep rename-or-ellide-kv (apply dissoc perm-map granular-keys)))
     (granular-perm-rename perm-map :perms/download-results [:download :schemas])
     (granular-perm-rename perm-map :perms/manage-table-metadata [:data-model :schemas])
     (granular-perm-rename perm-map :perms/view-data [:view-data])
     (granular-perm-rename perm-map :perms/create-queries [:create-queries]))))

(defn- rename-perms [graph]
  (update-vals graph
               (fn [db-id->perms]
                 (update-vals db-id->perms rename-perm))))

(def ^:private admin-perms
  {:view-data      :unrestricted
   :create-queries :query-builder-and-native
   :download       {:schemas :full}
   :data-model     {:schemas :all}
   :details        :yes
   :transforms     :yes})

(def ^:private data-analyst-perms
  "Data Analysts have implicit manage-table-metadata permission for all databases."
  {:data-model {:schemas :all}})

(defn- add-admin-perms-to-permissions-graph
  "These are not stored in the data-permissions table, but the API expects them to be there (for legacy reasons), so here we populate it.
  For every db in the incoming graph, adds on admin permissions."
  [api-graph {:keys [db-id group-ids group-id audit?]}]
  (let [admin-group-id (u/the-id (perms/admin-group))
        db-ids         (if db-id [db-id] (t2/select-pks-vec :model/Database
                                                            {:where [:and
                                                                     (when-not audit? [:not= :id audit/audit-db-id])
                                                                     [:= :router_database_id nil]]}))]
    ;; Don't add admin perms when we're fetching the perms for a specific non-admin group or set of groups
    (if (or (= group-id admin-group-id)
            (contains? (set group-ids) admin-group-id)
            ;; If we're not filtering on specific group IDs, always include the admin group
            (and (nil? group-id)
                 (nil? (seq group-ids))))
      (reduce (fn [api-graph db-id]
                (assoc-in api-graph [admin-group-id db-id] admin-perms))
              api-graph
              db-ids)
      api-graph)))

(defn- add-data-analyst-perms-to-permissions-graph
  "Data Analysts have implicit manage-table-metadata permission for all databases.
  This is not stored in the data-permissions table, so we add it to the graph for the API."
  [api-graph {:keys [db-id group-ids group-id audit?]}]
  (let [data-analyst-group-id (u/the-id (perms/data-analyst-group))
        db-ids                (if db-id [db-id] (t2/select-pks-vec :model/Database
                                                                   {:where [:and
                                                                            (when-not audit? [:not= :id audit/audit-db-id])
                                                                            [:= :router_database_id nil]]}))]
    ;; Don't add data analyst perms when we're fetching perms for a specific non-data-analyst group
    (if (or (= group-id data-analyst-group-id)
            (contains? (set group-ids) data-analyst-group-id)
            ;; If we're not filtering on specific group IDs, always include the data analyst group
            (and (nil? group-id)
                 (nil? (seq group-ids))))
      (reduce (fn [api-graph db-id]
                (update-in api-graph [data-analyst-group-id db-id]
                           #(merge % data-analyst-perms)))
              api-graph
              db-ids)
      api-graph)))

(defn- remove-empty-vals
  "Recursively walks a nested map from bottom-up, removing keys with nil or empty map values."
  [m]
  (if (map? m)
    (->> m
         (map (fn [[k v]] [k (remove-empty-vals v)]))
         (filter (fn [[_ v]] (not (or (nil? v) (and (map? v) (empty? v))))))
         (into {}))
    m))

(mr/def ::graph
  [:map-of [:int {:title "group-id" :min 0}]
   [:map-of [:int {:title "db-id" :min 0}]
    [:map-of ::permissions.schema/data-permission-type
     [:or
      ::permissions.schema/data-permission-value
      [:map-of [:string {:title "schema"}]
       [:map-of
        [:int {:title "table-id" :min 0}]
        ::permissions.schema/data-permission-value]]]]]])

(defn- collapse-uniform-view-data
  "If every table-level `:perms/view-data` value across every schema for a given (group, db) is the same
   scalar, collapse the schema/table map to that scalar at the db level. Without this, a newly-added DB
   whose tables are all uniformly `:blocked` (e.g. via the going-granular path during sync) is reported
   as a `{schema {table-id :blocked}}` map, which the frontend interprets as `granular`. Only applied to
   `:perms/view-data`; other granular perm types intentionally retain their map shape."
  [perm-type->value]
  (let [view-data-val (:perms/view-data perm-type->value)
        leaf-vals     (when (map? view-data-val)
                        (into #{} (mapcat vals) (vals view-data-val)))]
    (cond-> perm-type->value
      (= 1 (count leaf-vals))
      (assoc :perms/view-data (first leaf-vals)))))

(mu/defn data-permissions-graph :- ::graph
  "Returns a tree representation of all data permissions. Can be optionally filtered by group ID, database ID,
  and/or permission type. This is intended to power the permissions editor in the admin panel, and should not be used
  for permission enforcement, as it will read much more data than necessary."
  [& {:keys [group-id group-ids db-id perm-type audit?]}]
  (let [data-perms (t2/select [:model/DataPermissions
                               [:perm_type :type]
                               [:group_id :group-id]
                               [:perm_value :value]
                               [:db_id :db-id]
                               [:schema_name :schema]
                               [:table_id :table-id]]
                              {:where [:and
                                       (when perm-type [:= :perm_type (u/qualified-name perm-type)])
                                       (when db-id [:= :db_id db-id])
                                       (when group-id [:= :group_id group-id])
                                       (when group-ids [:in :group_id group-ids])
                                       (when-not audit? [:not= :db_id audit/audit-db-id])
                                       [:not-in :db_id {:select [:id]
                                                        :from   [:metabase_database]
                                                        :where  [:not= :router_database_id nil]}]]})
        raw-graph  (reduce
                    (fn [graph {:keys [group-id value db-id schema table-id]
                                perm-type :type}]
                      (let [schema (or schema "")
                            path   (if table-id
                                     [group-id db-id perm-type schema table-id]
                                     [group-id db-id perm-type])]
                        (assoc-in graph path value)))
                    {}
                    data-perms)]
    (update-vals raw-graph (fn [db-id->perms]
                             (update-vals db-id->perms collapse-uniform-view-data)))))

(mu/defn api-graph :- ::permissions-rest.schema/data-permissions-graph
  "Converts the backend representation of the data permissions graph to the representation we send over the API. Mainly
  renames permission types and values from the names stored in the database to the ones expected by the frontend.
  - Converts DB key names to API key names
  - Converts DB value names to API value names
  - Nesting: see [[rename-perms]] to see which keys in `graph` affect which paths in the api permission-graph
  - Adds sandboxed entries, and impersonations to graph"
  ([]
   (api-graph {}))

  ([& {:as opts}
    :- [:map
        [:group-id  {:optional true} [:maybe pos-int?]]
        [:group-ids {:optional true} [:maybe [:sequential pos-int?]]]
        [:db-id     {:optional true} [:maybe pos-int?]]
        [:audit?    {:optional true} [:maybe :boolean]]
        [:perm-type {:optional true} [:maybe ::permissions.schema/data-permission-type]]]]
   (let [graph (data-permissions-graph opts)]
     {:revision (perms/latest-permissions-revision-id)
      :groups (-> graph
                  rename-perms
                  remove-empty-vals
                  (add-sandboxes-to-permissions-graph opts)
                  (add-impersonations-to-permissions-graph opts)
                  (add-admin-perms-to-permissions-graph opts)
                  (add-data-analyst-perms-to-permissions-graph opts))})))

;;; ---------------------------------------- Updating permissions -----------------------------------------------------

(defenterprise delete-gtaps-if-needed-after-permissions-change!
  "Delete GTAPs (sandboxes) that are no longer needed after the permissions graph is updated. This is EE-specific --
  OSS impl is a no-op, since sandboxes are an EE-only feature."
  metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  [_])

(defenterprise delete-impersonations-if-needed-after-permissions-change!
  "Delete connection impersonation policies that are no longer needed after the permissions graph is updated. This is
  EE-specific -- OSS impl is a no-op, since connection impersonation is an EE-only feature."
  metabase-enterprise.impersonation.models
  [_])

(defn ee-permissions-exception
  "Exception to throw when a permissions operation fails due to missing Enterprise Edition code, or missing a valid
   token with the advanced-permissions feature."
  [perm-type]
  (ex-info
   (tru "The {0} permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
        (str/replace (name perm-type) "-" " "))
   {:status-code 402}))

;; Bulk update implementation ====================================================================================
;; Instead of iterating over groups x dbs x perm-types x schemas and making individual DB calls,
;; this implementation:
;; 1. Pre-fetches all tables and current permissions in bulk (2 queries)
;; 2. Uses pure functions to compute the desired state
;; 3. Diffs desired vs current to produce minimal inserts/deletes
;; 4. Applies changes in bulk (2 queries)

(def ^:private api-val->db-val
  {:view-data      {:unrestricted           :unrestricted
                    :impersonated           :unrestricted
                    :sandboxed              :unrestricted
                    :legacy-no-self-service :legacy-no-self-service
                    :blocked                :blocked}
   :create-queries {:query-builder-and-native :query-builder-and-native
                    :query-builder            :query-builder
                    :no                       :no}
   :download       {:full    :one-million-rows
                    :limited :ten-thousand-rows
                    :none    :no}
   :data-model     {:all  :yes
                    :none :no}
   :details        {:yes :yes :no :no}
   :transforms     {:yes :yes :no :no}})

(def ^:private api-key->perm-type
  {:view-data      :perms/view-data
   :create-queries :perms/create-queries
   :download       :perms/download-results
   :data-model     :perms/manage-table-metadata
   :details        :perms/manage-database
   :transforms     :perms/transforms})

(defn- resolve-api-value
  "Translates an API permission value for a single [group-id db-id api-key] into a map of
   {table-id-or-nil {:perm_value v :schema_name s}}. A nil key means db-level."
  [api-key api-value db-id tables-by-db-schema]
  (let [raw-value (if (#{:download :data-model} api-key)
                    (:schemas api-value)
                    api-value)]
    (if (keyword? raw-value)
      {nil {:perm_value  (get-in api-val->db-val [api-key raw-value])
            :schema_name nil}}
      (into {}
            (mapcat
             (fn [[schema-str schema-val]]
               (let [db-schema (not-empty schema-str)]
                 (if (keyword? schema-val)
                   (map (fn [{:keys [id schema]}]
                          [id {:perm_value  (get-in api-val->db-val [api-key schema-val])
                               :schema_name schema}])
                        (get tables-by-db-schema [db-id db-schema]))
                   (map (fn [[table-id table-val]]
                          [table-id {:perm_value  (get-in api-val->db-val [api-key table-val])
                                     :schema_name db-schema}])
                        schema-val)))))
            raw-value))))

(defn- add-implications:db-level
  [desired group-id db-id perm-type db-value]
  (cond-> desired
    (and (= perm-type :perms/create-queries) (not= db-value :no))
    (update [group-id db-id :perms/view-data]
            #(merge % {nil {:perm_value :unrestricted :schema_name nil}}))

    (and (= perm-type :perms/view-data) (= db-value :blocked))
    (-> (update [group-id db-id :perms/create-queries]
                #(merge % {nil {:perm_value :no :schema_name nil}}))
        (update [group-id db-id :perms/download-results]
                #(merge % {nil {:perm_value :no :schema_name nil}})))

    (and (= perm-type :perms/view-data) (not= db-value :unrestricted))
    (update [group-id db-id :perms/transforms]
            #(merge % {nil {:perm_value :no :schema_name nil}}))

    (and (= perm-type :perms/create-queries) (not= db-value :query-builder-and-native))
    (update [group-id db-id :perms/transforms]
            #(merge % {nil {:perm_value :no :schema_name nil}}))))

(defn- add-implications:table-level
  [desired group-id db-id perm-type table-entries]
  (cond-> desired
    (= perm-type :perms/create-queries)
    (update [group-id db-id :perms/view-data]
            #(merge %
                    (into {}
                          (keep (fn [[tid {:keys [perm_value schema_name]}]]
                                  (when (not= perm_value :no)
                                    [tid {:perm_value :unrestricted :schema_name schema_name}])))
                          table-entries)))

    (= perm-type :perms/view-data)
    (-> (update [group-id db-id :perms/create-queries]
                #(merge %
                        (into {}
                              (keep (fn [[tid {:keys [perm_value schema_name]}]]
                                      (when (= perm_value :blocked)
                                        [tid {:perm_value :no :schema_name schema_name}])))
                              table-entries)))
        (update [group-id db-id :perms/download-results]
                #(merge %
                        (into {}
                              (keep (fn [[tid {:keys [perm_value schema_name]}]]
                                      (when (= perm_value :blocked)
                                        [tid {:perm_value :no :schema_name schema_name}])))
                              table-entries))))))

(defn- add-implications
  "Given a desired-state map and entries just added for a perm-type, merges in implied permission changes.
   Implications from later-processed perm-types override earlier values."
  [desired group-id db-id perm-type entries]
  (let [has-db-level? (contains? entries nil)
        db-value      (get-in entries [nil :perm_value])
        table-entries (dissoc entries nil)]
    (cond
      has-db-level?          (add-implications:db-level desired group-id db-id perm-type db-value)
      (empty? table-entries) desired
      :else                  (add-implications:table-level desired group-id db-id perm-type table-entries))))

(defn- compute-desired-state
  "Process the API graph changes in dependency order, producing a desired-state map of
   {[group-id db-id perm-type] {table-id-or-nil {:perm_value v :schema_name s}}}."
  [graph tables-by-db-schema]
  (reduce
   (fn [desired [group-id db-id api-key api-value]]
     (let [perm-type (api-key->perm-type api-key)
           entries   (resolve-api-value api-key api-value db-id tables-by-db-schema)]
       (-> desired
           (update [group-id db-id perm-type] #(merge % entries))
           (add-implications group-id db-id perm-type entries))))
   {}
   (for [[group-id group-changes] graph
         [db-id db-changes] group-changes
         api-key [:details :data-model :download :transforms :create-queries :view-data]
         :let [api-value (get db-changes api-key)]
         :when api-value]
     [group-id db-id api-key api-value])))

(defn- expand-to-table-level
  "Expands a db-level permission value to table-level entries for all tables in the db.
   :query-builder-and-native becomes :query-builder per table since it can only be db-level."
  [perm-value all-tables]
  (let [table-value (if (= perm-value :query-builder-and-native) :query-builder perm-value)]
    (into {}
          (map (fn [{:keys [id schema]}]
                 [id {:perm_value table-value :schema_name schema}]))
          all-tables)))

(defn- table-permissions-map [current-rows]
  (into {}
        (keep (fn [{:keys [table_id perm_value schema_name] :as _row}]
                (when table_id
                  [table_id
                   {:perm_value  perm_value
                    :schema_name schema_name}])))
        current-rows))

(defn- perms->base-state [current-rows current-db-row all-tables]
  (if current-db-row
    (expand-to-table-level (:perm_value current-db-row) all-tables)
    (table-permissions-map current-rows)))

(defn- finalize-tuple
  "For a single [group-id db-id perm-type], compute the final desired DataPermissions rows.
   Merges desired entries with current state for unmentioned tables, then coalesces if possible.

   Coalescing rules (matching legacy behavior):
   - Explicit db-level desired (nil key, no table overrides) → always db-level
   - Mixed (db-level default + table overrides) where all values same → coalesce to db-level
   - Table-level desired, current was db-level, all values match current → keep db-level (no-op)
   - Otherwise → table-level rows"
  [group-id db-id perm-type desired-entries current-rows all-tables]
  (let [has-db-level?  (contains? desired-entries nil)
        table-entries  (dissoc desired-entries nil)]
    (if (and has-db-level? (empty? table-entries))
      [{:perm_type   perm-type
        :group_id    group-id
        :perm_value  (:perm_value (desired-entries nil))
        :db_id       db-id}]
      (let [current-db-row (first (filter #(nil? (:table_id %)) current-rows))
            base-state     (if has-db-level?
                             (expand-to-table-level (:perm_value (desired-entries nil)) all-tables)
                             (perms->base-state current-rows current-db-row all-tables))
            final-state    (merge base-state table-entries)
            values         (into #{} (map :perm_value) (vals final-state))
            all-same?      (and (= 1 (count values))
                                (seq all-tables)
                                (= (count final-state) (count all-tables)))
            coalesce?      (and all-same?
                                (or has-db-level?
                                    (and current-db-row
                                         (= (first values) (:perm_value current-db-row)))))]
        (if coalesce?
          [{:perm_type   perm-type
            :group_id    group-id
            :perm_value  (first values)
            :db_id       db-id}]
          (mapv (fn [[table-id {:keys [perm_value schema_name]}]]
                  {:perm_type   perm-type
                   :group_id    group-id
                   :perm_value  perm_value
                   :db_id       db-id
                   :table_id    table-id
                   :schema_name schema_name})
                final-state))))))

(def ^:private row-signature
  (juxt :perm_type :perm_value :table_id :schema_name))

(defn- rows-match?
  "Check if the current rows already represent the desired state (no changes needed)."
  [current-rows desired-rows]
  (= (into #{} (map row-signature) current-rows)
     (into #{} (map row-signature) desired-rows)))

(defn- compute-diff
  "Given the desired state, current permissions index, and tables-by-db,
   returns {:to-delete [id ...] :to-insert [row-map ...]}."
  [desired-state current-perms-index tables-by-db]
  (reduce-kv
   (fn [acc [group-id db-id perm-type] desired-entries]
     (let [current-rows (get current-perms-index [group-id db-id perm-type] [])
           all-tables   (get tables-by-db db-id [])
           desired-rows (finalize-tuple group-id db-id perm-type desired-entries current-rows all-tables)]
       (if (rows-match? current-rows desired-rows)
         acc
         (-> acc
             (update :to-delete into (keep :id) current-rows)
             (update :to-insert into desired-rows)))))
   {:to-delete [] :to-insert []}
   desired-state))

(defn- validate-blocked-permissions!
  [graph]
  (doseq [[_group-id group-changes] graph
          [_db-id db-changes] group-changes]
    (when (= (:view-data db-changes) :blocked)
      (when-not (premium-features/has-feature? :advanced-permissions)
        (throw (ee-permissions-exception :blocked))))))

(defn- check-data-analyst-locked-permissions
  "Check that we're not modifying data-model permission for the Data Analysts group.
   Data Analysts always have full data-model (manage-table-metadata) permissions."
  [group-updates]
  (let [data-analyst-group-id (u/the-id (perms/data-analyst-group))]
    (when-let [da-updates (get group-updates data-analyst-group-id)]
      (doseq [[_db-id db-changes] da-updates]
        (when (and (contains? db-changes :data-model)
                   (not= (:data-model db-changes) (:data-model data-analyst-perms)))
          (throw (ex-info (tru "You cannot modify the data model permission for the ''{0}'' group."
                               (:name (perms/data-analyst-group)))
                          {:status-code 400})))))))

(defn check-audit-db-permissions
  "Check that the changes coming in does not attempt to change audit database permission. Admins should
  change these permissions implicitly via collection permissions."
  [group-updates]
  (let [changes-ids (->> group-updates
                         vals
                         (map keys)
                         (apply concat))]
    (when (some #{audit/audit-db-id} changes-ids)
      (throw (ex-info (tru "Audit database permissions can only be changed by updating audit collection permissions.")
                      {:status-code 400})))))

(mu/defn update-data-perms-graph!*
  "Takes an API-style perms graph and sets the permissions in the database accordingly.
   Uses bulk operations to minimize database round-trips."
  ([graph]
   (let [affected-group-ids  (keys graph)
         affected-db-ids     (into #{} (mapcat keys) (vals graph))
         all-tables          (when (seq affected-db-ids)
                               (t2/select [:model/Table :id :db_id :schema]
                                          :db_id [:in affected-db-ids]))
         tables-by-db-schema (group-by (juxt :db_id :schema) all-tables)
         tables-by-db        (group-by :db_id all-tables)
         current-perms       (or (perms/index-database-permissions affected-group-ids affected-db-ids) {})
         desired-state       (compute-desired-state graph tables-by-db-schema)
         {:keys [to-delete to-insert]} (compute-diff desired-state current-perms tables-by-db)]
     (validate-blocked-permissions! graph)
     (when (seq to-delete)
       (perms/batch-delete-permissions! to-delete))
     (when (seq to-insert)
       (perms/batch-insert-permissions! to-insert))))

  ;; The following arity is provided solely for convenience for tests/REPL usage
  ([ks :- [:vector :any] new-value]
   (-> (api-graph)
       :groups
       (assoc-in ks new-value)
       update-data-perms-graph!*)))

(mu/defn update-data-perms-graph!
  "Takes an API-style perms graph and sets the permissions in the database accordingly. Additionally ensures
  impersonations and sandboxes are consistent if necessary."
  ([graph-updates :- ::permissions-rest.schema/data-permissions-graph]
   (when (seq graph-updates)
     (perms/with-global-permissions-lock
       (let [group-updates (:groups graph-updates)]
         (check-data-analyst-locked-permissions group-updates)
         (check-audit-db-permissions group-updates)
         (update-data-perms-graph!* group-updates)
         (delete-impersonations-if-needed-after-permissions-change! group-updates)
         (delete-gtaps-if-needed-after-permissions-change! group-updates)))))

  ;; The following arity is provided solely for convenience for tests/REPL usage
  ([ks :- [:vector :any] new-value]
   (-> (api-graph)
       (assoc-in (cons :groups ks) new-value)
       update-data-perms-graph!)))
