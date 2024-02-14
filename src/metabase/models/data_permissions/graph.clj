(ns metabase.models.data-permissions.graph
  "Code involving reading and writing the API-style data permission graph. This is the graph which we use to represent
  permissions when communicating with the frontend, which has different keys and a slightly different structure
  from the one returned by `metabase.models.data-permissions/data-permissions-graph`, which is based directly on the
  keys and values stored in the `data_permissions` table.

  Essentially, this is a translation layer between the graph used by the v1 permissions schema and the v2 permissions
  schema."
  (:require
   [medley.core :as m]
   [metabase.api.permission-graph :as api.permission-graph]
   [metabase.config :as config]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-revision :as perms-revision]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

;; See also: [[data-perms/Permissions]]
(def ^:private ->api-keys
  {:perms/data-access           :data
   :perms/download-results      :download
   :perms/manage-table-metadata :data-model

   :perms/native-query-editing  :native
   :perms/manage-database       :details})

(def ^:private ->api-vals
  {:perms/data-access           {:unrestricted    :all
                                 :no-self-service nil
                                 :block           :block}
   :perms/download-results      {:one-million-rows  :full
                                 :ten-thousand-rows :limited
                                 :no                nil}
   :perms/manage-table-metadata {:yes :all :no nil}
   :perms/native-query-editing  {:yes :write :no nil}
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
  (if (= type :perms/data-access)
    ;; for `:perms/data-access`, `:no-self-service` is the default (block  is a 'negative' permission),  so we should ellide
    (= value :no-self-service)
    (= (data-perms/least-permissive-value type) value)))

(defn- rename-or-ellide-kv
  "Renames a kv pair from the data-permissions-graph to an API-style data permissions graph (which we send to the client)."
  [[type value]]
  (when-not (ellide? type value)
    [(->api-keys type) ((->api-vals type) value)]))

(mu/defn ^:private api-table-perms
  "Helper to transform a 'leaf' value with table-level schemas in the data permissions graph into an API-style data permissions value."
  [type :- data-perms/PermissionType
   schema->table-id->api-val]
  (update-vals schema->table-id->api-val
               (fn [table-id->api-val]
                 (->> table-id->api-val
                      (keep
                       (fn [[table-id perm-val]]
                         (when-not (ellide? type perm-val)
                           [table-id ((->api-vals type) perm-val)])))
                      (into {})))))

(defn- granular-perm-rename [perms perm-key legacy-path]
  (let [perm-value (get perms perm-key)]
    (when perm-value
      (cond
        (map? perm-value)
        (assoc-in {} legacy-path (api-table-perms perm-key perm-value))
        (not (ellide? perm-key perm-value))
        (assoc-in {} legacy-path ((->api-vals perm-key) perm-value))
        :else {}))))

(defn- rename-perm
  "Transforms a 'leaf' value with db-level or table-level perms in the data permissions graph into an API-style data permissions value.
  There's some tricks in here that ellide table-level and table-level permissions values that are the most-permissive setting."
  [perm-map]
  (let [granular-keys [:perms/native-query-editing :perms/data-access
                       :perms/download-results :perms/manage-table-metadata]]
    (m/deep-merge
     (into {} (keep rename-or-ellide-kv (apply dissoc perm-map granular-keys)))
     (granular-perm-rename perm-map :perms/data-access [:data :schemas])
     (granular-perm-rename perm-map :perms/native-query-editing [:data :native])
     (granular-perm-rename perm-map :perms/download-results [:download :schemas])
     (granular-perm-rename perm-map :perms/manage-table-metadata [:data-model :schemas]))))

(defn- rename-perms [graph]
  (update-vals graph
               (fn [db-id->perms]
                 (update-vals db-id->perms rename-perm))))

(def ^:private legacy-admin-perms
   {:data {:native :write, :schemas :all},
    :download {:native :full, :schemas :full},
    :data-model {:schemas :all},
    :details :yes})

(defn- add-admin-perms-to-permissions-graph
  "These are not stored in the data-permissions table, but the API expects them to be there (for legacy reasons), so here we populate it.
  For every db in the incoming graph, adds on admin permissions."
  [api-graph {:keys [db-id group-id]}]
  (let [admin-group-id (u/the-id (perms-group/admin))]
    (if (and group-id (not= group-id admin-group-id))
      ;; Don't add admin perms when we're fetching the perms for a specific non-admin group
      api-graph
      (reduce
       (fn [api-graph db-id]
         (assoc-in api-graph [admin-group-id db-id] legacy-admin-perms))
       api-graph
       (if db-id
         [db-id]
         (t2/select-pks-vec :model/Database {:where [:not= :id config/audit-db-id]}))))))

(mu/defn db-graph->api-graph :- api.permission-graph/StrictData
  "Converts the backend representation of the data permissions graph to the representation we send over the API. Mainly
  renames permission types and values from the names stored in the database to the ones expected by the frontend.
  - Converts DB key names to API key names
  - Converts DB value names to API value names
  - Nesting: see [[rename-perms]] to see which keys in `graph` affect which paths in the api permission-graph
  - Adds sandboxed entries, and impersonations to graph"
  [& {:as opts} :- [:map
                    [:group-id {:optional true} [:maybe pos-int?]]
                    [:db-id {:optional true} [:maybe pos-int?]]
                    [:audit? {:optional true} [:maybe :boolean]]
                    [:perm-type {:optional true} [:maybe data-perms/PermissionType]]]]
  (let [graph (data-perms/data-permissions-graph opts)]
    {:revision (perms-revision/latest-id)
     :groups (-> graph
                 rename-perms
                 (add-sandboxes-to-permissions-graph opts)
                 (add-impersonations-to-permissions-graph opts)
                 (add-admin-perms-to-permissions-graph opts))}))


;;; ---------------------------------------- Updating permissions -----------------------------------------------------

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

; ;; TODO: Make sure we update download perm enforcement to infer native download permissions, since
; ;; we'll no longer be setting them explicitly in the database.
; ;; i.e. you should only be able to download the results of a native query at the most limited level
; ;; you have for any table in the DB
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

(defn- update-native-data-access-permissions!
  [group-id db-id new-native-perms]
  (data-perms/set-database-permission! group-id db-id :perms/native-query-editing (case new-native-perms
                                                                                    :write :yes
                                                                                    :none  :no)))

(defn- update-table-level-data-access-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms
        (-> new-table-perms
            (update-vals (fn [table-perm]
                           (if (map? table-perm)
                             (if (#{:all :segmented} (table-perm :query))
                               ;; `:segmented` indicates that the table is sandboxed, but we should set :perms/data-access
                               ;; permissions to :unrestricted and rely on the `sandboxes` table as the source of truth
                               ;; for sandboxing.
                               :unrestricted
                               :no-self-service)
                             (case table-perm
                               :all  :unrestricted
                               :none :no-self-service))))
            (update-keys (fn [table-id] {:id table-id :db_id db-id :schema schema})))]
    (data-perms/set-table-permissions! group-id :perms/data-access new-table-perms)))

(defn- update-schema-level-data-access-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-data-access-permissions! group-id db-id schema new-schema-perms)
    (let [tables (t2/select :model/Table :db_id db-id :schema (not-empty schema))]
      (when (seq tables)
        (case new-schema-perms
          :all
          (data-perms/set-table-permissions! group-id :perms/data-access (zipmap tables (repeat :unrestricted)))

          :none
          (data-perms/set-table-permissions! group-id :perms/data-access (zipmap tables (repeat :no-self-service))))))))

(defn- update-db-level-data-access-permissions!
  [group-id db-id new-db-perms]
  (when-let [new-native-perms (:native new-db-perms)]
    (update-native-data-access-permissions! group-id db-id new-native-perms))
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-data-access-permissions! group-id db-id schema schema-changes))
      (case schemas
        (:all :impersonated)
        (data-perms/set-database-permission! group-id db-id :perms/data-access :unrestricted)

        :none
        (data-perms/set-database-permission! group-id db-id :perms/data-access :no-self-service)

        :block
        (data-perms/set-database-permission! group-id db-id :perms/data-access :block)))))

(defn- update-details-perms!
  [group-id db-id value]
  (data-perms/set-database-permission! group-id db-id :perms/manage-database value))

(defn update-data-perms-graph!
  "Takes an API-style perms graph and sets the permissions in the database accordingly."
  [graph]
  (doseq [[group-id group-changes] graph]
    (doseq [[db-id db-changes] group-changes
            [perm-type new-perms] db-changes]
      (case perm-type
        :data       (update-db-level-data-access-permissions! group-id db-id new-perms)
        :download   (update-db-level-download-permissions! group-id db-id new-perms)
        :data-model (update-db-level-metadata-permissions! group-id db-id new-perms)
        :details    (update-details-perms! group-id db-id new-perms)))))
