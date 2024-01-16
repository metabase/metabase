(ns metabase.models.data-permissions.graph
  "Code involving reading and writing the API-style data permission graph. This is the graph which we use to represent
  permissions when communicating with the frontend, which has different keys and a slightly different structure
  from the one returned by `metabase.models.permissions-v2/data-permissions-graph`, which is based directly on the
  keys and values stored in the `permissions_v2` table.

  Essentially, this is a translation layer between the graph used by the v1 permissions system and the v2 permissions
  system."
  (:require
   [metabase.models.data-permissions :as data-perms]
   [toucan2.core :as db]))

#_(def ^:private db->api-keys
    {:data-access           :data
     :download-results      :download
     :manage-table-metadata :data-model

     :native-query-editing  :native
     :manage-database       :details})

#_(def ^:private db->api-vals
    {:data-access           {:unrestricted    :all
                             :no-self-service nil
                             :block           :block}
     :download-results      {:one-million-rows  :full
                             :ten-thousand-rows :limited
                             :no                 nil}
     :manage-table-metadata {:yes :all
                             :no nil}

     :native-query-editing  {:yes :full
                             :no nil}
     :manage-database       {:yes :yes
                             :no  :no}})

;; TODO
(defn db-graph->api-graph
  "Converts the backend representation of the data permissions graph to the representation we send over the API. Mainly
  renames permission types and values from the names stored in the database to the ones expected by the frontend."
  [graph]
  ;; 1. Convert DB key names to API key names
  ;; 2. Nest table-level perms under :native and :schemas keys
  ;; 3. Walk tree and convert values to API values
  ;; 4. Add sandboxed entries to graph (maybe do this a level up?)
  graph)

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
    (data-perms/set-table-permissions! group-id :manage-table-metadata new-table-perms)))

(defn- update-schema-level-metadata-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-metadata-permissions! group-id db-id schema new-schema-perms)
    (let [tables (db/select :model/Table :db_id db-id :schema (not-empty schema))]
     (case new-schema-perms
       :all
       (data-perms/set-table-permissions! group-id :manage-table-metadata (zipmap tables (repeat :yes)))

       :none
       (data-perms/set-table-permissions! group-id :manage-table-metadata (zipmap tables (repeat :no)))))))

(defn- update-db-level-metadata-permissions!
  [group-id db-id new-db-perms]
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-metadata-permissions! group-id db-id schema schema-changes))
      (case schemas
        :all
        (data-perms/set-database-permission! group-id db-id :manage-table-metadata :yes)

        :none
        (data-perms/set-database-permission! group-id db-id :manage-table-metadata :no)))))

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
    (data-perms/set-table-permissions! group-id :download-results new-table-perms)))

(defn- update-schema-level-download-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-download-permissions! group-id db-id schema new-schema-perms)
    (let [tables (db/select :model/Table :db_id db-id :schema (not-empty schema))]
      (case new-schema-perms
        :full
        (data-perms/set-table-permissions! group-id :download-results (zipmap tables (repeat :one-million-rows)))

        :limited
        (data-perms/set-table-permissions! group-id :download-results (zipmap tables (repeat :ten-thousand-rows)))

        :none
        (data-perms/set-table-permissions! group-id :download-results (zipmap tables (repeat :no)))))))

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
        (data-perms/set-database-permission! group-id db-id :download-results :one-million-rows)

        :limited
        (data-perms/set-database-permission! group-id db-id :download-results :ten-thousand-rows)

        :none
        (data-perms/set-database-permission! group-id db-id :download-results :no)))))

(defn- update-native-data-access-permissions!
  [group-id db-id new-native-perms]
  (data-perms/set-database-permission! group-id db-id :native-query-editing (case new-native-perms
                                                                              :write :yes
                                                                              :none  :no)))

(defn- update-table-level-data-access-permissions!
  [group-id db-id schema new-table-perms]
  (let [new-table-perms
        (-> new-table-perms
            (update-vals (fn [table-perm]
                           (if (map? table-perm)
                             (if (#{:all :segmented} (table-perm :query))
                               ;; `:segmented` indicates that the table is sandboxed, but we should set :data-access
                               ;; permissions to :unrestricted and rely on the `sandboxes` table as the source of truth
                               ;; for sandboxing.
                               :unrestricted
                               :no-self-service)
                             (case table-perm
                               :all  :unrestricted
                               :none :no-self-service))))
            (update-keys (fn [table-id] {:id table-id :db_id db-id :schema schema})))]
    (data-perms/set-table-permissions! group-id :data-access new-table-perms)))

(defn- update-schema-level-data-access-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (update-table-level-data-access-permissions! group-id db-id schema new-schema-perms)
    (let [tables (db/select :model/Table :db_id db-id :schema (not-empty schema))]
      (case new-schema-perms
        :all
        (data-perms/set-table-permissions! group-id :data-access (zipmap tables (repeat :unrestricted)))

        :none
        (data-perms/set-table-permissions! group-id :data-access (zipmap tables (repeat :no-self-service)))))))

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
        (data-perms/set-database-permission! group-id db-id :data-access :unrestricted)

        :none
        (data-perms/set-database-permission! group-id db-id :data-access :no-self-service)

        :block
        (data-perms/set-database-permission! group-id db-id :data-access :block)))))

(defn- update-details-perms!
  [group-id db-id value]
  (data-perms/set-database-permission! group-id db-id :manage-database value))

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
