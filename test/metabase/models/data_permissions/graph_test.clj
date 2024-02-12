(ns metabase.models.data-permissions.graph-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.test :as mt]
   [toucan2.core :as db]))

(deftest update-db-level-data-access-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}      {}
                 :model/Database         {database-id-1 :id}   {}
                 :model/Table            {table-id-1 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-2 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-3 :id}      {:db_id database-id-1
                                                                :schema nil}]
    ;; Clear default perms for the group
    (db/delete! :model/DataPermissions :group_id group-id-1)
    (testing "data-access permissions can be updated via API-style graph"
      (are [api-graph db-graph] (= db-graph
                                   (do
                                     (data-perms.graph/update-data-perms-graph! api-graph)
                                     (data-perms/data-permissions-graph :group-id group-id-1)))
        ;; Setting granular data access permissions
        {group-id-1
         {database-id-1
          {:data
           {:native :none
            :schemas {"PUBLIC"
                      {table-id-1 :all
                       table-id-2 :none}
                      ""
                      {table-id-3 :all}}}}}}
        {group-id-1
         {database-id-1
          {:perms/native-query-editing :no
           :perms/data-access {"PUBLIC"
                               {table-id-1 :unrestricted
                                table-id-2 :no-self-service}
                               ""
                               {table-id-3 :unrestricted}}}}}

        ;; Restoring full data access and native query permissions
        {group-id-1
         {database-id-1
          {:data
           {:native :write
            :schemas :all}}}}
        {group-id-1
         {database-id-1
          {:perms/native-query-editing :yes
           :perms/data-access :unrestricted}}}

        ;; Setting data access permissions at the schema-level
        {group-id-1
         {database-id-1
          {:data
           {:native :none
            :schemas {"PUBLIC" :all
                      ""       :none}}}}}
        {group-id-1
         {database-id-1
          {:perms/native-query-editing :no
           :perms/data-access {"PUBLIC"
                               {table-id-1 :unrestricted
                                table-id-2 :unrestricted}
                               ""
                               {table-id-3 :no-self-service}}}}}

        ;; Setting block permissions for the database also sets :native-query-editing and :downlaod-results to :no
        {group-id-1
         {database-id-1
          {:data
           {:native :none
            :schemas :block}}}}
        {group-id-1
          {database-id-1
           {:perms/native-query-editing :no
            :perms/data-access :block
            :perms/download-results :no}}}))))

(deftest update-db-level-download-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}      {}
                 :model/Database         {database-id-1 :id}   {}
                 :model/Table            {table-id-1 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-2 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-3 :id}      {:db_id database-id-1
                                                                :schema nil}]
    ;; Clear default perms for the group
    (db/delete! :model/DataPermissions :group_id group-id-1)
    (testing "download permissions can be updated via API-style graph"
      (are [api-graph db-graph] (= db-graph
                                   (do
                                     (data-perms.graph/update-data-perms-graph! api-graph)
                                     (data-perms/data-permissions-graph :group-id group-id-1)))
        ;; Setting granular download permissions
        {group-id-1
         {database-id-1
          {:download
           {:schemas {"PUBLIC"
                      {table-id-1 :full
                       table-id-2 :none}
                      ""
                      {table-id-3 :limited}}}}}}
        {group-id-1
         {database-id-1
          {:perms/download-results {"PUBLIC"
                                    {table-id-1 :one-million-rows
                                     table-id-2 :no}
                                    ""
                                    {table-id-3 :ten-thousand-rows}}}}}

        ;; Restoring full download permissions
        {group-id-1
         {database-id-1
          {:download
           {:schemas :full}}}}
        {group-id-1
         {database-id-1
          {:perms/download-results :one-million-rows}}}

        ;; Setting download permissions at the schema-level
        {group-id-1
         {database-id-1
          {:download
           {:schemas {"PUBLIC" :full
                      ""       :none}}}}}
        {group-id-1
         {database-id-1
          {:perms/download-results {"PUBLIC"
                                    {table-id-1 :one-million-rows
                                     table-id-2 :one-million-rows}
                                    ""
                                    {table-id-3 :no}}}}}

        ;; Revoking download permissions for the database
        {group-id-1
         {database-id-1
          {:download
           {:schemas :none}}}}
        {group-id-1
         {database-id-1
          {:perms/download-results :no}}}))))

(deftest update-db-level-metadata-permissions!-test
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}      {}
                 :model/Database         {database-id-1 :id}   {}
                 :model/Table            {table-id-1 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-2 :id}      {:db_id database-id-1
                                                                :schema "PUBLIC"}
                 :model/Table            {table-id-3 :id}      {:db_id database-id-1
                                                                :schema nil}]
    ;; Clear default perms for the group
    (db/delete! :model/DataPermissions :group_id group-id-1)
    (testing "data model editing permissions can be updated via API-style graph"
      (are [api-graph db-graph] (= db-graph
                                   (do
                                     (data-perms.graph/update-data-perms-graph! api-graph)
                                     (data-perms/data-permissions-graph :group-id group-id-1)))
        ;; Setting granular data model editing permissions
        {group-id-1
         {database-id-1
          {:data-model
           {:schemas {"PUBLIC"
                      {table-id-1 :all
                       table-id-2 :none}
                      ""
                      {table-id-3 :none}}}}}}
        {group-id-1
         {database-id-1
          {:perms/manage-table-metadata {"PUBLIC"
                                         {table-id-1 :yes
                                          table-id-2 :no}
                                         ""
                                         {table-id-3 :no}}}}}

        ;; Restoring full data model editing permissions
        {group-id-1
         {database-id-1
          {:data-model
           {:schemas :all}}}}
        {group-id-1
         {database-id-1
          {:perms/manage-table-metadata :yes}}}

        ;; Setting data model editing permissions at the schema-level
        {group-id-1
         {database-id-1
          {:data-model
           {:schemas {"PUBLIC" :all
                      ""       :none}}}}}
        {group-id-1
         {database-id-1
          {:perms/manage-table-metadata {"PUBLIC"
                                         {table-id-1 :yes
                                          table-id-2 :yes}
                                         ""
                                         {table-id-3 :no}}}}}

        ;; Revoking all data model editing permissions for the database
        {group-id-1
         {database-id-1
          {:data-model
           {:schemas :none}}}}
        {group-id-1
         {database-id-1
          {:perms/manage-table-metadata :no}}}))))

(deftest update-details-perms!-test
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}      {}
                 :model/Database         {database-id-1 :id}   {}]
    ;; Clear default perms for the group
    (db/delete! :model/DataPermissions :group_id group-id-1)
    (testing "database details editing permissions can be updated via API-style graph"
      (are [api-graph db-graph] (= db-graph
                                   (do
                                     (data-perms.graph/update-data-perms-graph! api-graph)
                                     (data-perms/data-permissions-graph :group-id group-id-1)))
        ;; Granting permission to edit database details
        {group-id-1
         {database-id-1
          {:details :yes}}}
        {group-id-1
         {database-id-1
          {:perms/manage-database :yes}}}

        ;; Revoking permission to edit database details
        {group-id-1
         {database-id-1
          {:details :no}}}
        {group-id-1
         {database-id-1
          {:perms/manage-database :no}}}))))
