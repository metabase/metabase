(ns metabase.models.data-permissions.graph
  "Code involving reading and writing the API-style data permission graph. This is the graph which we use to represent
  permissions when communicating with the frontend, which has different keys and a slightly different structure
  from the one returned by `metabase.models.data-permissions/data-permissions-graph`, which is based directly on the
  keys and values stored in the `data_permissions` table.

  Essentially, this is a translation layer between the graph used by the v1 permissions schema and the v2 permissions
  schema."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.permission-graph :as api.permission-graph]
   [metabase.audit :as audit]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-revision :as perms-revision]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; See also: [[data-perms/Permissions]]
(def ^:private ->api-keys
  {:perms/view-data             :view-data
   :perms/create-queries        :create-queries
   :perms/download-results      :download
   :perms/manage-table-metadata :data-model
   :perms/manage-database       :details})

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
   :perms/manage-database       {:yes :yes :no :no}})

(defenterprise add-impersonations-to-permissions-graph
  "Augment the permissions graph with active connection impersonation policies. OSS implementation returns graph as-is."
  metabase-enterprise.advanced-permissions.models.connection-impersonation
  [graph & [_opts]]
  graph)

(defenterprise add-sandboxes-to-permissions-graph
  "Augment the permissions graph with active connection impersonation policies. OSS implementation returns graph as-is."
  metabase-enterprise.sandbox.models.group-table-access-policy
  [graph & [_opts]]
  graph)

(defn get-dbs-and-groups
  "Given an api permission graph, this returns the groups and db-ids"
  [graph]
  {:group-ids (->> graph :groups keys set)
   :db-ids (->> graph :groups vals (mapcat keys) set)})

(mu/defn ellide? :- :boolean
  "If a table has the least permissive value for a perm type, leave it out,
   Unless it's :data perms, in which case, leave it out only if it's no-self-service"
  [type :- data-perms/PermissionType
   value :- data-perms/PermissionValue]
  (= (data-perms/least-permissive-value type) value))

(defn- rename-or-ellide-kv
  "Renames a kv pair from the data-permissions-graph to an API-style data permissions graph (which we send to the client)."
  [[type value]]
  (when-not (ellide? type value)
    [(->api-keys type) ((->api-vals type) value)]))

(mu/defn ^:private api-table-perms
  "Helper to transform 'leaf' values with table-level schemas in the data permissions graph into an API-style data permissions value.
   Coalesces permissions at the schema level if all table-level permissions within a schema are identical."
  [type :- data-perms/PermissionType
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
    :details        :yes})

(defn- add-admin-perms-to-permissions-graph
  "These are not stored in the data-permissions table, but the API expects them to be there (for legacy reasons), so here we populate it.
  For every db in the incoming graph, adds on admin permissions."
  [api-graph {:keys [db-id group-ids group-id audit?]}]
  (let [admin-group-id (u/the-id (perms-group/admin))
        db-ids         (if db-id [db-id] (t2/select-pks-vec :model/Database
                                                            {:where [:and
                                                                     (when-not audit? [:not= :id audit/audit-db-id])]}))]
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

(defn remove-empty-vals
  "Recursively walks a nested map from bottom-up, removing keys with nil or empty map values."
  [m]
  (if (map? m)
    (->> m
         (map (fn [[k v]] [k (remove-empty-vals v)]))
         (filter (fn [[_ v]] (not (or (nil? v) (and (map? v) (empty? v))))))
         (into {}))
    m))

(mu/defn api-graph :- api.permission-graph/DataPermissionsGraph
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
        [:group-id {:optional true} [:maybe pos-int?]]
        [:group-ids {:optional true} [:maybe [:sequential pos-int?]]]
        [:db-id {:optional true} [:maybe pos-int?]]
        [:audit? {:optional true} [:maybe :boolean]]
        [:perm-type {:optional true} [:maybe data-perms/PermissionType]]]]
   (let [graph (data-perms/data-permissions-graph opts)]
     {:revision (perms-revision/latest-id)
      :groups (-> graph
                  rename-perms
                  remove-empty-vals
                  (add-sandboxes-to-permissions-graph opts)
                  (add-impersonations-to-permissions-graph opts)
                  (add-admin-perms-to-permissions-graph opts))})))

;;; ---------------------------------------- Updating permissions -----------------------------------------------------

(defenterprise delete-gtaps-if-needed-after-permissions-change!
  "Delete GTAPs (sandboxes) that are no longer needed after the permissions graph is updated. This is EE-specific --
  OSS impl is a no-op, since sandboxes are an EE-only feature."
  metabase-enterprise.sandbox.models.permissions.delete-sandboxes
  [_])

(defenterprise delete-impersonations-if-needed-after-permissions-change!
  "Delete connection impersonation policies that are no longer needed after the permissions graph is updated. This is
  EE-specific -- OSS impl is a no-op, since connection impersonation is an EE-only feature."
  metabase-enterprise.advanced-permissions.models.connection-impersonation
  [_])

(defn ee-permissions-exception
  "Exception to throw when a permissions operation fails due to missing Enterprise Edition code, or missing a valid
   token with the advanced-permissions feature."
  [perm-type]
  (ex-info
    (tru "The {0} permissions functionality is only enabled if you have a premium token with the advanced-permissions feature."
         (str/replace (name perm-type) "-" " "))
    {:status-code 402}))

(defn- update-table-level-metadata-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms
        (-> new-table-perms
            (update-vals (fn [table-perm]
                           (case table-perm
                             :all  :yes
                             :none :no)))
            (update-keys (fn [table-id] {:id table-id :db_id db-id :schema schema})))]
    (data-perms/set-table-permissions! group-id :perms/manage-table-metadata new-table-perms)))

(defn- update-schema-level-metadata-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-metadata-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (case new-schema-perms
          :all
          (data-perms/set-table-permissions! group-id :perms/manage-table-metadata (zipmap tables (repeat :yes)))

          :none
          (data-perms/set-table-permissions! group-id :perms/manage-table-metadata (zipmap tables (repeat :no))))))))

(defn- update-db-level-metadata-permissions!
  [group-id db-id new-db-perms]
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-metadata-permissions! group-id db-id schema schema-changes))
      (case schemas
        :all
        (data-perms/set-database-permission! group-id db-id :perms/manage-table-metadata :yes)

        :none
        (data-perms/set-database-permission! group-id db-id :perms/manage-table-metadata :no)))))

(defn- update-table-level-download-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms
        (-> new-table-perms
            (update-vals (fn [table-perm]
                           (case table-perm
                             :full    :one-million-rows
                             :limited :ten-thousand-rows
                             :none    :no)))
            (update-keys (fn [table-id] {:id table-id :db_id db-id :schema schema})))]
    (data-perms/set-table-permissions! group-id :perms/download-results new-table-perms)))

(defn- update-schema-level-download-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-download-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (case new-schema-perms
          :full
          (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :one-million-rows)))

          :limited
          (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :ten-thousand-rows)))

          :none
          (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :no))))))))

(defn- update-db-level-download-permissions!
  [group-id db-id new-db-perms]
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-download-permissions! group-id db-id schema schema-changes))
      (case schemas
        :full
        (data-perms/set-database-permission! group-id db-id :perms/download-results :one-million-rows)

        :limited
        (data-perms/set-database-permission! group-id db-id :perms/download-results :ten-thousand-rows)

        :none
        (data-perms/set-database-permission! group-id db-id :perms/download-results :no)))))

(defn- update-details-perms!
  [group-id db-id value]
  (data-perms/set-database-permission! group-id db-id :perms/manage-database value))

(defn- update-table-level-create-queries-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms (update-keys
                         new-table-perms
                         (fn [table-id] {:id table-id :db_id db-id :schema schema}))]
    (data-perms/set-table-permissions! group-id :perms/create-queries new-table-perms)))

(defn- update-schema-level-create-queries-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-create-queries-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (data-perms/set-table-permissions! group-id :perms/create-queries (zipmap tables (repeat new-schema-perms)))))))

(defn- update-db-level-create-queries-permissions!
  [group-id db-id new-db-perms]
  (if (map? new-db-perms)
    (doseq [[schema new-schema-perms] new-db-perms]
      (update-schema-level-create-queries-permissions! group-id db-id schema new-schema-perms))
    (when new-db-perms
      (data-perms/set-database-permission! group-id db-id :perms/create-queries new-db-perms))))

(defn- update-table-level-view-data-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms (->
                         (update-keys
                          new-table-perms
                          (fn [table-id] {:id table-id :db_id db-id :schema schema}))
                         (update-vals (fn [table-perm]
                                        (case table-perm
                                          :unrestricted           :unrestricted
                                          ;; If the table is sandboxed, we set `view-data` to `unrestricted` since
                                          ;; sandboxes are stored separately in the `sandboxes` table
                                          :sandboxed              :unrestricted
                                          :legacy-no-self-service :legacy-no-self-service))))]
    (data-perms/set-table-permissions! group-id :perms/view-data new-table-perms)))

(defn- update-schema-level-view-data-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-view-data-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (data-perms/set-table-permissions! group-id :perms/view-data (zipmap tables (repeat new-schema-perms)))))))

(defn- update-db-level-view-data-permissions!
  [group-id db-id new-db-perms]
  (if (map? new-db-perms)
    (doseq [[schema new-schema-perms] new-db-perms]
      (update-schema-level-view-data-permissions! group-id db-id schema new-schema-perms))
    (case new-db-perms
      (:unrestricted :impersonated)
      (data-perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)

      ;; Support setting legacy-no-self-service for testing purposes, though the UI shouldn't allow it normally
      :legacy-no-self-service
      (data-perms/set-database-permission! group-id db-id :perms/view-data :legacy-no-self-service)

      :blocked
      (do
        (when-not (premium-features/has-feature? :advanced-permissions)
          (throw (ee-permissions-exception :blocked)))
        (data-perms/set-database-permission! group-id db-id :perms/view-data :blocked)))))

(defn check-audit-db-permissions
  "Check that the changes coming in does not attempt to change audit database permission. Admins should
  change these permissions implicitly via collection permissions."
  [group-updates]
  (let [changes-ids (->> group-updates
                         vals
                         (map keys)
                         (apply concat))]
    (when (some #{audit/audit-db-id} changes-ids)
      (throw (ex-info (tru
                       (str "Audit database permissions can only be changed by updating audit collection permissions."))
                      {:status-code 400})))))

(mu/defn update-data-perms-graph!*
  "Takes an API-style perms graph and sets the permissions in the database accordingly."
  ([graph]
   (doseq [[group-id group-changes] graph]
     (doseq [[db-id db-changes] group-changes
             [perm-type new-perms] db-changes]
       (case perm-type
         :view-data      (update-db-level-view-data-permissions! group-id db-id new-perms)
         :create-queries (update-db-level-create-queries-permissions! group-id db-id new-perms)
         :download       (update-db-level-download-permissions! group-id db-id new-perms)
         :data-model     (update-db-level-metadata-permissions! group-id db-id new-perms)
         :details        (update-details-perms! group-id db-id new-perms)))))

  ;; The following arity is provided soley for convenience for tests/REPL usage
  ([ks :- [:vector :any] new-value]
   (update-data-perms-graph!* (assoc-in (-> api-graph :groups) ks new-value))))

(mu/defn update-data-perms-graph!
  "Takes an API-style perms graph and sets the permissions in the database accordingly. Additionally ensures
  impersonations and sandboxes are consistent if necessary."
  ([graph-updates :- api.permission-graph/DataPermissionsGraph]
   (when (seq graph-updates)
     (let [group-updates (:groups graph-updates)]
       (check-audit-db-permissions group-updates)
       (t2/with-transaction [_conn]
         (update-data-perms-graph!* group-updates)
         (delete-impersonations-if-needed-after-permissions-change! group-updates)
         (delete-gtaps-if-needed-after-permissions-change! group-updates)))))

  ;; The following arity is provided soley for convenience for tests/REPL usage
  ([ks :- [:vector :any] new-value]
   (update-data-perms-graph! (assoc-in (api-graph) (cons :groups ks) new-value))))
