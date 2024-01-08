(ns metabase.models.permissions-v2.graph
  "Code involving reading and writing the API-style data permission graph. This is the graph which we use to represent
  permissions when communicating with the frontend, which has different keys and a slightly different structure
  from the one returned by `metabase.models.permissions-v2/data-permissions-graph`, which is based directly on the
  keys and values stored in the `permissions_v2` table.

  Essentially, this is a translation layer between the graph used by the v1 permissions system and the v2 permissions
  system."
  (:require
   [metabase.models.permissions-v2 :as perms-v2]
   [toucan2.core :as db]))

#_(def ^:private db->api-keys
    {:data-access           :data
     :download-results      :download
     :manage-table-metadata :data-model

     :native-query-editing  :native
     :native-downloads      :native
     :manage-database       :details})

#_(def ^:private db->api-vals
    {:data-access           {:unrestricted    :all
                             :no-self-service nil
                             :block           :block}
     :download-results      {:one-million-rows  :full
                             :ten-thousand-rows :partial
                             :no                 nil}
     :manage-table-metadata {:yes :all
                             :no nil}

     :native-query-editing  {:yes :full
                             :no nil}
     :native-downloads      {:yes :write
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
  ;; 4. Coalesce table values to DB-level values if they all are the same
  ;; 5. Add sandboxed entries to graph (maybe do this a level up?)
  graph)


;;; ---------------------------------------- Updating permissions -----------------------------------------------------

(defn- update-table-level-metadata-permissions!
  [group-id db-id table-id schema new-table-perms]
  (case new-table-perms
    :all
    (perms-v2/set-permission! :manage-table-metadata group-id :yes table-id db-id schema)

    :none
    (perms-v2/set-permission! :manage-table-metadata group-id :no table-id db-id schema)))

(defn- update-schema-level-metadata-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (doseq [[table-id table-perm] new-schema-perms]
      (update-table-level-metadata-permissions! group-id db-id table-id schema table-perm))
    (let [tables (db/select :model/Table :db_id db-id :schema schema)]
      (case new-schema-perms
        :all
        (perms-v2/set-table-permissions! :manage-table-metadata group-id :yes tables)

        :none
        (perms-v2/set-table-permissions! :manage-table-metadata group-id :no tables)))))

(defn- update-db-level-metadata-permissions!
  [group-id db-id new-db-perms]
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-metadata-permissions! group-id db-id schema schema-changes))
      (let [tables (db/select :model/Table :db_id db-id)]
        (case schemas
          :all
          (perms-v2/set-table-permissions! :manage-table-metadata group-id :yes tables)

          :none
          (perms-v2/set-table-permissions! :manage-table-metadata group-id :no tables))))))

(defn- update-table-level-download-permissions!
  [group-id db-id table-id schema new-table-perms]
  (case new-table-perms
    :full
    (perms-v2/set-permission! :download-results group-id :one-million-rows table-id db-id schema)

    :limited
    (perms-v2/set-permission! :download-results group-id :ten-thousand-rows table-id db-id schema)

    :none
    (perms-v2/set-permission! :download-results group-id :no table-id db-id schema)))

(defn- update-schema-level-download-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (doseq [[table-id table-perm] new-schema-perms]
      (update-table-level-download-permissions! group-id db-id table-id schema table-perm))
    (let [tables (db/select :model/Table :db_id db-id :schema schema)]
      (case new-schema-perms
        :full
        (perms-v2/set-table-permissions! :download-results group-id :one-million-rows tables)

        :limited
        (perms-v2/set-table-permissions! :download-results group-id :ten-thousand-rows tables)

        :none
        (perms-v2/set-table-permissions! :download-results group-id :no tables)))))

;; TODO: Make sure we update download perm enforcement to infer native download permissions, since
;; we'll no longer be setting them explicitly in the database.
;; i.e. you should only be able to download the results of a native query at the most limited level
;; you have for any table in the DB
(defn- update-db-level-download-permissions!
  [group-id db-id new-db-perms]
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-download-permissions! group-id db-id schema schema-changes))
      (let [tables (db/select :model/Table :db_id db-id)]
        (case schemas
          :full
          (perms-v2/set-table-permissions! :download-results group-id :one-million-rows tables)

          :limited
          (perms-v2/set-table-permissions! :download-results group-id :ten-thousand-rows tables)

          :none
          (perms-v2/set-table-permissions! :download-results group-id :no tables))))))

(defn- update-native-data-access-permissions!
  [group-id db-id new-native-perms]
  (perms-v2/set-permission! :native-query-editing
                            group-id
                            (case new-native-perms
                              :write :yes
                              :none  :no)
                            db-id))

(defn- update-table-level-data-access-permissions!
  [group-id db-id table-id schema table-perm]
  (case table-perm
    :all
    (perms-v2/set-permission! :data-access group-id :unrestricted table-id db-id schema)

    ;; This indicates that the table is sandboxed, but we should set :data-access permissions to :unrestricted
    ;; and rely on the `sandboxes` table as the source of truth for sandboxing.
    {:read :all :query :segmented}
    (perms-v2/set-permission! :data-access group-id :unrestricted table-id db-id schema)

    :none
    (perms-v2/set-permission! :data-access group-id :no-self-service table-id db-id schema)>))

(defn- update-schema-level-data-access-permissions!
  [group-id db-id schema new-schema-perms]
  (if (map? new-schema-perms)
    (doseq [[table-id table-perm] new-schema-perms]
      (update-table-level-data-access-permissions! group-id db-id table-id schema table-perm))
    (let [tables (db/select :model/Table :db_id db-id :schema schema)]
      (case new-schema-perms
        :all
        (perms-v2/set-table-permissions! :data-access group-id :unrestricted tables)

        :none
        (perms-v2/set-table-permissions! :data-access group-id :no-self-service tables)))))

(defn- update-db-level-data-access-permissions!
  [group-id db-id new-db-perms]
  (when-let [new-native-perms (:native new-db-perms)]
    (update-native-data-access-permissions! group-id db-id new-native-perms))
  (when-let [schemas (:schemas new-db-perms)]
    (if (map? schemas)
      (doseq [[schema schema-changes] schemas]
        (update-schema-level-data-access-permissions! group-id db-id schema schema-changes))
      (let [tables (db/select :model/Table :db_id db-id)]
        (case schemas
          (:all :impersonated)
          (perms-v2/set-table-permissions! :data-access group-id :unrestricted tables)

          :none
          (perms-v2/set-table-permissions! :data-access group-id :no-self-service tables)

          :block
          (perms-v2/set-table-permissions! :data-access group-id :block tables))))))

(defn- update-details-perms!
  [group-id db-id value]
  (perms-v2/set-permission! :manage-database group-id value db-id))

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
