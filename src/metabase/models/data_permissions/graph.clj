(ns metabase.models.data-permissions.graph
  "Code involving reading and writing the API-style data permission graph. This is the graph which we use to represent
  permissions when communicating with the frontend, which has different keys and a slightly different structure
  from the one returned by `metabase.models.permissions-v2/data-permissions-graph`, which is based directly on the
  keys and values stored in the `permissions_v2` table.

  Essentially, this is a translation layer between the graph used by the v1 permissions system and the v2 permissions
  system."
  (:require
   [medley.core :as m]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.permissions-revision :as perms-revision]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(def ^:private db->api-keys
  {:data-access           :data
   :download-results      :download
   :manage-table-metadata :data-model

   :native-query-editing  :native
   :native-downloads      :native
   :manage-database       :details})

(def ^:private db->api-vals
  {:data-access           {:unrestricted    :all
                           :no-self-service nil
                           :block           :block}
   :download-results      {:one-million-rows,  :full
                           :ten-thousand-rows, :partial
                           :no,                nil}
   :manage-table-metadata {:yes :all, :no nil}
   :native-query-editing  {:yes :full, :no nil}
   :native-downloads      {:yes :write, :no nil}
   :manage-database       {:yes :yes, :no :no}})

(defn- rename-or-ellide-kv
  "Renames a kv pair from the data-permissions-graph to an API-style data permissions graph (which we send to the client)."
  [[k v]]
  (when-not (= (data-perms/most-permissive-value k) v)
    [(db->api-keys k) ((db->api-vals k) v)]))

(mu/defn ^:private api-table-perms
  "Helper to transform a 'leaf' value with table-level schemas in the data permissions graph into an API-style data permissions value."
  [k :- (into [:enum] (keys db->api-keys))
   schema->table-id->api-val]
  (update-vals schema->table-id->api-val
               (fn [table-id->api-val]
                 (->> table-id->api-val
                      (keep
                       (fn [[table-id perm-val]]
                         (when-not (= (data-perms/most-permissive-value k) perm-val)
                           [table-id ((db->api-vals k) perm-val)])))
                      (into {})))))

(defn- granular-perm-rename [perm-key perm-value legacy-path]
  (when perm-value
    (cond
      (map? perm-value)
      (assoc-in {} legacy-path (api-table-perms perm-key perm-value))
      (not= (data-perms/most-permissive-value perm-key) perm-value)
      (assoc-in {} legacy-path ((db->api-vals perm-key) perm-value))
      :else {})))

(defn- rename-perm
  "Transforms a 'leaf' value with db-level or table-level perms in the data permissions graph into an API-style data permissions value.
  There's some tricks in here that ellide table-level and table-level permissions values that are the most-permissive setting."
  [perm-map]
  (let [{:keys [native-query-editing  data-access  download-results  manage-table-metadata]} perm-map
        granular-keys [:native-query-editing :data-access :download-results :manage-table-metadata]]
    (m/deep-merge
     (into {} (keep rename-or-ellide-kv (apply dissoc perm-map granular-keys)))
     (granular-perm-rename :native-query-editing native-query-editing [:data :native])
     (granular-perm-rename :data-access data-access [:data :schemas])
     (granular-perm-rename :download-results download-results [:download :schemas])
     (granular-perm-rename :manage-table-metadata manage-table-metadata [:data-model]))))

(defn- rename-perms [graph]
  (update-vals graph
               (fn [db-id->perms]
                 (update-vals db-id->perms rename-perm))))

(def ^:private legacy-admin-perms
  {:data {:native :write, :schemas :all},
   :download {:native :full, :schemas :full},
   :data-model {:schemas :all},
   :details :yes})

(defn- add-admin-group-perms
  "These are not stored in the data-permissions table, but the API expects them to be there (for legacy reasons), so here we populate it."
  [api-graph]
  (let [{admin-group-id :id} (perms-group/admin)
        dbs (t2/select-fn-vec :id :model/Database)]
    (assoc api-graph
           admin-group-id
           (zipmap dbs (repeat legacy-admin-perms)))))

(defn db-graph->api-graph
  "Converts the backend representation of the data permissions graph to the representation we send over the API. Mainly
  renames permission types and values from the names stored in the database to the ones expected by the frontend.

  1. Convert DB key names to API key names
  2. Nest table-level perms under :native and :schemas keys
  3. Convert values to API values
  TODO: Add sandboxed entries to graph
  "
  [graph]
  (let [groups (-> graph rename-perms add-admin-group-perms)]
    {:groups groups
     :revision (perms-revision/latest-id)}))

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
     (case new-schema-perms
       :all
       (data-perms/set-table-permissions! group-id :perms/manage-table-metadata (zipmap tables (repeat :yes)))

       :none
       (data-perms/set-table-permissions! group-id :perms/manage-table-metadata (zipmap tables (repeat :no)))))))

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
      (case new-schema-perms
        :full
        (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :one-million-rows)))

        :limited
        (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :ten-thousand-rows)))

        :none
        (data-perms/set-table-permissions! group-id :perms/download-results (zipmap tables (repeat :no)))))))

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
      (case new-schema-perms
        :all
        (data-perms/set-table-permissions! group-id :perms/data-access (zipmap tables (repeat :unrestricted)))

        :none
        (data-perms/set-table-permissions! group-id :perms/data-access (zipmap tables (repeat :no-self-service)))))))

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
