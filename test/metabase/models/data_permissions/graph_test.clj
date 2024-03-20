(ns metabase.models.data-permissions.graph-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.config :as config]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as db]))

(deftest update-db-level-view-data-permissions!-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}      {}
                   :model/Database         {database-id-1 :id}   {}
                   :model/Table            {table-id-1 :id}      {:db_id database-id-1
                                                                  :schema "PUBLIC"}]
      ;; Clear default perms for the group
      (db/delete! :model/DataPermissions :group_id group-id-1)
      (testing "data-access permissions can be updated via API-style graph"
        (are [api-graph db-graph] (= db-graph
                                     (do
                                       (data-perms.graph/update-data-perms-graph!* api-graph)
                                       (data-perms/data-permissions-graph :group-id group-id-1)))
          {group-id-1
           {database-id-1
            {:view-data :unrestricted}}}
          {group-id-1
           {database-id-1
            {:perms/view-data :unrestricted}}}

          {group-id-1
           {database-id-1
            {:view-data :impersonated}}}
          {group-id-1
           {database-id-1
            {:perms/view-data :unrestricted}}}

          {group-id-1
           {database-id-1
            {:view-data {"PUBLIC" {table-id-1 :sandboxed}}}}}
          {group-id-1
           {database-id-1
            {:perms/view-data :unrestricted}}}

          ;; Setting block permissions for the database also removes query access and download access
          {group-id-1
           {database-id-1
            {:view-data :blocked}}}
          {group-id-1
           {database-id-1
            {:perms/view-data :blocked
             :perms/create-queries :no
             :perms/download-results :no}}})))))

(deftest update-db-level-create-queries-permissions!-test
  (mt/with-premium-features #{:advanced-permissions}
    (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}      {}
                   :model/Database         {database-id-1 :id}   {}
                   :model/Table            {table-id-1 :id}      {:db_id database-id-1
                                                                  :schema "PUBLIC"}]
      ;; Clear default perms for the group
      (db/delete! :model/DataPermissions :group_id group-id-1)
      (testing "data-access permissions can be updated via API-style graph"
        (are [api-graph db-graph] (= db-graph
                                     (do
                                       (data-perms.graph/update-data-perms-graph!* api-graph)
                                       (data-perms/data-permissions-graph :group-id group-id-1)))
          {group-id-1
           {database-id-1
            {:create-queries :query-builder-and-native}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries :query-builder-and-native}}}

          {group-id-1
           {database-id-1
            {:create-queries :query-builder}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries :query-builder}}}

          {group-id-1
           {database-id-1
            {:create-queries :no}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries :no}}}

          {group-id-1
           {database-id-1
            {:create-queries :no}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries :no}}}

          {group-id-1
           {database-id-1
            {:create-queries {"PUBLIC" :query-builder}}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries {"PUBLIC" {table-id-1 :query-builder}}}}}

          {group-id-1
           {database-id-1
            {:create-queries {"PUBLIC" :no}}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries {"PUBLIC" {table-id-1 :no}}}}}

          {group-id-1
           {database-id-1
            {:create-queries {"PUBLIC" {table-id-1 :query-builder}}}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries {"PUBLIC" {table-id-1 :query-builder}}}}}

          {group-id-1
           {database-id-1
            {:create-queries {"PUBLIC" {table-id-1 :no}}}}}
          {group-id-1
           {database-id-1
            {:perms/create-queries {"PUBLIC" {table-id-1 :no}}}}})))))

(deftest update-db-level-data-access-permissions!-test
  (mt/with-premium-features #{:advanced-permissions}
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
                                       (data-perms.graph/update-data-perms-graph!* api-graph)
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
              :perms/download-results :no}}})))))

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
                                     (data-perms.graph/update-data-perms-graph!* api-graph)
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
                                     (data-perms.graph/update-data-perms-graph!* api-graph)
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
                                     (data-perms.graph/update-data-perms-graph!* api-graph)
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


;; ------------------------------ API Graph Tests ------------------------------

(deftest ellide?-test
  (is (#'data-perms.graph/ellide?      :perms/data-access :no-self-service))
  (is (not (#'data-perms.graph/ellide? :perms/data-access :block))))

(defn- remove-download:native [graph]
  (walk/postwalk
   (fn [x]
     (if (and
          (instance? clojure.lang.MapEntry x)
          (= :download (first x)))
       (update x 1 dissoc :native)
       x))
   graph))

(defn replace-empty-map-with-nil [graph]
  (walk/postwalk
   (fn [x] (if (= x {}) nil x))
   graph))

(defn- api-graph=
  "When checking equality between api perm graphs:
  - download.native is not used by the client, so we remove it when checking equality:
  - {} vs nil is also a distinction without a difference:"
  [a b]
  (= (remove-download:native (replace-empty-map-with-nil a))
     (remove-download:native (replace-empty-map-with-nil b))))

(deftest perms-are-renamed-test
  (testing "Perm keys and values are correctly renamed, and permissions are ellided as necessary"
    (are [db-graph api-graph] (= api-graph (-> db-graph
                                               (#'data-perms.graph/rename-perm)
                                               (#'data-perms.graph/remove-empty-vals)))
      {:perms/data-access :unrestricted}           {:data {:schemas :all}}
      {:perms/data-access :no-self-service}        {}
      {:perms/data-access :block}                  {:data {:schemas :block}}
      {:perms/native-query-editing :yes}           {:data {:native :write}}
      {:perms/native-query-editing :no}            {}
      {:perms/download-results :one-million-rows}  {:download {:schemas :full}}
      {:perms/download-results :ten-thousand-rows} {:download {:schemas :limited}}
      {:perms/download-results :no}                {}
      {:perms/manage-table-metadata :yes}          {:data-model {:schemas :all}}
      {:perms/manage-table-metadata :no}           {}
      {:perms/manage-database :yes}                {:details :yes}
      {:perms/manage-database :no}                 {}
      ;; with schemas:
      {:perms/data-access
       {"PUBLIC" {1 :unrestricted
                  2 :no-self-service}}}            {:data {:schemas {"PUBLIC" {1 :all}}}}
      {:perms/data-access
       {"PUBLIC" {1 :unrestricted
                  2 :unrestricted}}}               {:data {:schemas {"PUBLIC" :all}}}
      {:perms/data-access
       {"PUBLIC" {1 :no-self-service
                  2 :no-self-service}}}            {}
      {:perms/download-results
       {"PUBLIC" {1 :one-million-rows
                  2 :no}}}                         {:download {:schemas {"PUBLIC" {1 :full}}}}
      {:perms/download-results
       {"PUBLIC" {1 :one-million-rows
                  2 :ten-thousand-rows}}}          {:download {:schemas {"PUBLIC" {1 :full
                                                                                   2 :limited}}}}
      {:perms/manage-table-metadata
       {"PUBLIC" {1 :yes}}}                        {:data-model {:schemas {"PUBLIC" :all}}}
      {:perms/manage-table-metadata
       {"PUBLIC" {1 :no}}}                         {}
      {:perms/manage-table-metadata
       {"PUBLIC" {1 :yes
                  2 :no}}}                         {:data-model {:schemas {"PUBLIC" {1 :all}}}}
      ;; multiple schemas
      {:perms/data-access
       {"PUBLIC" {1 :unrestricted}
        "OTHER" {2 :no-self-service}
        "SECRET" {3 :block}}}                      {:data {:schemas {"PUBLIC" :all, "SECRET" :block}}}
      {:perms/data-access
       {"PUBLIC" {1 :unrestricted
                  2 :no-self-service}
        "OTHER" {3 :no-self-service
                 4 :no-self-service}}}             {:data {:schemas {"PUBLIC" {1 :all}}}})))

(deftest rename-perm-test
  (is (api-graph=
       (#'data-perms.graph/rename-perm {:perms/data-access :unrestricted
                                        :perms/native-query-editing :yes
                                        :perms/manage-database :no
                                        :perms/download-results :one-million-rows
                                        :perms/manage-table-metadata :no})
       {:data {:native :write, :schemas :all} :download {:native :full, :schemas :full}})))

(defn constrain-graph
  "Filters out all non `group-id`X`db-id` permissions"
  [group-id db-id graph]
  (-> graph
      (assoc :groups {group-id (get-in graph [:groups group-id])})
      (assoc-in [:groups group-id] {db-id (get-in graph [:groups group-id db-id])})))

(defn- test-data-graph [group]
  (get-in (data-perms.graph/api-graph) [:groups (u/the-id group) (mt/id) :data :schemas "PUBLIC"]))

(deftest graph-set-partial-permissions-for-table-test
  (testing "Test that setting partial permissions for a table retains permissions for other tables -- #3888"
    (mt/with-temp [:model/PermissionsGroup group]
      (testing "before"
        ;; first, graph permissions only for VENUES
        (data-perms/set-table-permission! group (mt/id :venues) :perms/data-access :unrestricted)
        (is (= {(mt/id :venues) :all}
               (test-data-graph group))))
      (testing "after"
        ;; next, grant permissions via `update-graph!` for CATEGORIES as well. Make sure permissions for VENUES are
        ;; retained (#3888)
        (data-perms/set-table-permission! group (mt/id :categories) :perms/data-access :unrestricted)
        (is (= {(mt/id :categories) :all, (mt/id :venues) :all}
               (test-data-graph group)))))))

(deftest audit-db-update-test
  (testing "Throws exception when we attempt to change the audit db permission manually."
    (mt/with-temp [:model/PermissionsGroup group    {}]
      (is (thrown-with-msg?
           Exception
           #"Audit database permissions can only be changed by updating audit collection permissions."
           (data-perms.graph/update-data-perms-graph! [(u/the-id group) config/audit-db-id :data :schemas] :all))))))

(deftest update-graph-validate-db-perms-test
  (testing "Check that validation of DB `:schemas` and `:native` perms doesn't fail if only one of them changes"
    (mt/with-temp [:model/Database {db-id :id}]
      (mt/with-no-data-perms-for-all-users!
        (let [ks [:groups (u/the-id (perms-group/all-users)) db-id :data]]
          (letfn [(perms []
                    (get-in (data-perms.graph/api-graph) ks))
                  (set-perms! [new-perms]
                    (data-perms.graph/update-data-perms-graph! (assoc-in (data-perms.graph/api-graph) ks new-perms))
                    (perms))]
            (testing "Should initially have no perms"
              (is (= {:schemas :block}
                     (perms))))
            (testing "grant schema perms"
              (is (= {:schemas :all}
                     (set-perms! {:schemas :all}))))
            (testing "grant native perms"
              (is (= {:schemas :all, :native :write}
                     (set-perms! {:schemas :all, :native :write}))))
            (testing "revoke native perms"
              (is (= {:schemas :all}
                     (set-perms! {:schemas :all, :native :none}))))
            (testing "revoke schema perms"
              (is (= nil
                     (set-perms! {:schemas :none}))))
            (testing "disallow schemas :none + :native :write"
              (is (thrown-with-msg?
                   Exception
                   #"Invalid DB permissions: If you have write access for native queries, you must have data access to all schemas."
                   (set-perms! {:schemas :none, :native :write})))
              (is (= nil
                     (perms))))))))))

(deftest no-op-partial-graph-updates
  (testing "Partial permission graphs with no changes to the existing graph do not error when run repeatedly (#25221)"
    (mt/with-temp [:model/PermissionsGroup group]
      ;; Bind *current-user* so that permission revisions are written, which was the source of the original error
      (mt/with-current-user (mt/user->id :rasta)
        (is (nil? (data-perms.graph/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :none :schemas :none}}}}
                                                              :revision (:revision (data-perms.graph/api-graph))})))
        (is (nil? (data-perms.graph/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :none :schemas :none}}}}
                                                              :revision (:revision (data-perms.graph/api-graph))})))

        (data-perms/set-database-permission! group (mt/id) :perms/data-access :unrestricted)
        (is (nil? (data-perms.graph/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :write :schemas :all}}}}
                                                              :revision (:revision (data-perms.graph/api-graph))})))
        (is (nil? (data-perms.graph/update-data-perms-graph! {:groups {(u/the-id group) {(mt/id) {:data {:native :write :schemas :all}}}}
                                                              :revision (:revision (data-perms.graph/api-graph))})))))))
