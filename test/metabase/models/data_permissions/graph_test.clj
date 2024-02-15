(ns metabase.models.data-permissions.graph-test
  (:require
   [clojure.test :refer :all]
   [clojure.walk :as walk]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.data-permissions.graph :as data-perms.graph]
   [metabase.models.permissions :as perms]
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
  (is (= (#'data-perms.graph/rename-perm {:perms/data-access :unrestricted})           {:data {:schemas :all}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/data-access :no-self-service})        {}))
  (is (= (#'data-perms.graph/rename-perm {:perms/data-access :block})                  {:data {:schemas :block}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/download-results :one-million-rows})  {:download {:schemas :full}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/download-results :ten-thousand-rows}) {:download {:schemas :limited}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/download-results :no})                {}))
  (is (= (#'data-perms.graph/rename-perm {:perms/manage-table-metadata :yes})          {:data-model {:schemas :all}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/manage-table-metadata :no})           {}))
  (is (= (#'data-perms.graph/rename-perm {:perms/native-query-editing :yes})           {:data {:native :write}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/native-query-editing :no})            {}))
  (is (= (#'data-perms.graph/rename-perm {:perms/manage-database :yes})                {:details :yes}))
  (is (= (#'data-perms.graph/rename-perm {:perms/manage-database :no})                 {}))
  ;; with schemas:
  (is (= (#'data-perms.graph/rename-perm {:perms/data-access {"PUBLIC" {22 :unrestricted}}})    {:data {:schemas {"PUBLIC" {22 :all}}}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/data-access {"PUBLIC" {22 :no-self-service}}}) {:data {:schemas {"PUBLIC" {}}}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/data-access {"PUBLIC" {22 :block}}})           {:data {:schemas {"PUBLIC" {22 :block}}}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/download-results {"PUBLIC" {22 :no}}})         {:download {:schemas {"PUBLIC" {}}}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/download-results {"PUBLIC" {22 :yes}}})        {:download {:schemas {"PUBLIC" {22 nil}}}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/manage-table-metadata {"PUBLIC" {22 :no}}})    {:data-model {:schemas {"PUBLIC" {}}}}))
  (is (= (#'data-perms.graph/rename-perm {:perms/manage-table-metadata {"PUBLIC" {22 :yes}}})   {:data-model {:schemas {"PUBLIC" {22 :all}}}}))
  ;; multiple schemas
  (is (= (#'data-perms.graph/rename-perm {:perms/data-access {"PUBLIC" {22 :unrestricted} "OTHER" {7 :no-self-service} "SECRET" {11 :block}}})
         {:data {:schemas {"PUBLIC" {22 :all}, "OTHER" {}, "SECRET" {11 :block}}}}))

  (is (= (#'data-perms.graph/rename-perm {:perms/download-results {"PUBLIC" {22 :unrestricted} "OTHER" {7 :no-self-service} "SECRET" {11 :block}}})
         {:download {:schemas {"PUBLIC" {22 nil}, "OTHER" {7 nil}, "SECRET" {11 nil}}}}))

  (is (= (#'data-perms.graph/rename-perm {:perms/manage-table-metadata {"PUBLIC" {22 :unrestricted} "OTHER" {7 :no-self-service} "SECRET" {11 :block}}})
         {:data-model {:schemas {"PUBLIC" {22 nil}, "OTHER" {7 nil}, "SECRET" {11 nil}}}})))

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

(deftest api-graphs-are-equal
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}  {}
                 :model/Database         {db-id-1 :id}     {}]
    (testing "legacy perms-graph should be equal to the new one"
      (let [data-perms (constrain-graph group-id-1 db-id-1
                                        (data-perms.graph/api-graph {:audit? false}))
            api-perms (constrain-graph group-id-1 db-id-1
                                       (perms/data-perms-graph))]
        (is (api-graph=
             (:groups api-perms)
             (:groups data-perms)))))))

(comment
  (clojure.test/run-test-var #'api-graphs-are-equal))


(comment
  #_(require '[clojure.math.combinatorics :as math.combo])

  #_(defn- generate-maps
      "Given a map like {:a [1 2] :b [2]} returns all combos like: [{:a 1 :b 2} {:a 2 :b 2}]"
      [m]
      (let [keys (keys m)
            values (vals m)
            combinations (apply math.combo/cartesian-product values)]
        (mapv #(zipmap keys %) combinations)))

  ;; TODO: eyeball this:
  #_(defn- all-nongranular-perm-maps []
      (generate-maps (update-vals @#'data-perms.graph/->api-vals keys)))
  #_(doseq [in (all-nongranular-perm-maps)] (println "----\n" in "\n" (#'data-perms.graph/rename-perm in))))
