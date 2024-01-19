(ns metabase.models.data-permissions.graph-test
  (:require
   #_[clojure.math.combinatorics :as math.combo]
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

        ;; Setting block permissions for the database
        {group-id-1
         {database-id-1
          {:data
           {:native :none
            :schemas :block}}}}
        {group-id-1
          {database-id-1
           {:perms/native-query-editing :no
            :perms/data-access :block}}}))))

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

;; ------------------------------ API Graph Tests ------------------------------

;; download.native is not used by the fe, so not needed:
(defn- remove-download:native [graph]
  (walk/postwalk
   (fn [x]
     (if (and
          (instance? clojure.lang.MapEntry x)
          (= :download (first x)))
       (update x 1 dissoc :native)
       x))
   graph))

(defn- api-graph= [a b]
  (= (remove-download:native a)
     (remove-download:native b)))

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
#_(doseq [in (all-nongranular-perm-maps)] (println "----\n" in "\n" (#'data-perms.graph/rename-perm in)))

(deftest perms-are-renamed-test
  (is (= (#'data-perms.graph/rename-perm {:data-access :unrestricted})           {:data {:schemas :all}}))
  (is (= (#'data-perms.graph/rename-perm {:data-access :no-self-service})        {}))
  (is (= (#'data-perms.graph/rename-perm {:data-access :block})                  {:data {:schemas :block}}))
  (is (= (#'data-perms.graph/rename-perm {:download-results :one-million-rows})  {:download {:schemas :full}}))
  (is (= (#'data-perms.graph/rename-perm {:download-results :ten-thousand-rows}) {:download {:schemas :partial}}))
  (is (= (#'data-perms.graph/rename-perm {:download-results :no})                {}))
  (is (= (#'data-perms.graph/rename-perm {:manage-table-metadata :yes})          {:data-model {:schemas :all}}))
  (is (= (#'data-perms.graph/rename-perm {:manage-table-metadata :no})           {}))
  (is (= (#'data-perms.graph/rename-perm {:native-query-editing :yes})           {:data {:native :write}}))
  (is (= (#'data-perms.graph/rename-perm {:native-query-editing :no})            {}))
  (is (= (#'data-perms.graph/rename-perm {:manage-database :yes})                {:details :yes}))
  (is (= (#'data-perms.graph/rename-perm {:manage-database :no})                 {})))

(deftest rename-perm-test
  (is (api-graph=
       (#'data-perms.graph/rename-perm {:data-access :unrestricted
                                        :native-query-editing :yes
                                        :manage-database :no
                                        :download-results :one-million-rows
                                        :manage-table-metadata :no})
       {:data {:native :write, :schemas :all} :download {:native :full, :schemas :full}})))

#_(deftest api-graphs-are-equal
  (mt/with-temp [:model/PermissionsGroup {group-id-1 :id}  {}
                 :model/Database         {db-id-1 :id}     {}]
    ;; TODO constrain graph outputs to just the temp values...
    (testing "legacy perms-graph should be equal to the new one"
      (let [api-perms (perms/data-perms-graph)
            data-perms (data-perms/data-permissions-graph)]
        (is (api-graph=
             (:groups api-perms)
             (:groups (data-perms.graph/db-graph->api-graph data-perms))))))))

  (comment

    (require '[metabase.util :as u])

    (defn record! []
      ;;(spit "permz.edn" "")
      (spit "../permz.edn"
            (str "\n" (u/pprint-to-str {:data-perms (data-perms/data-permissions-graph) :api-perms (perms/data-perms-graph)}))
            :append true))

    (defn samples [] (read-string (format "[%s]" (slurp "../permz.edn"))))
    (defn sample [& [n]] ((cond
                            (number? n) #(nth % n)
                            (fn? n) n
                            :else rand-nth)
                          (samples)))
    (samples)
    (:data-perms (sample last))

    (remove-download:native (:api-perms (sample last)))

    (defn api-graph= [a b]
      (= (remove-download:native a)
         (remove-download:native b)))

    (defn fmt [pg] (into (sorted-map) (remove-download:native (get pg 1))))

    (defn check-sample [{:keys [api-perms data-perms]}]
      [[::data-perms (fmt data-perms)]
       [::data->api (fmt (:groups (data-perms.graph/db-graph->api-graph data-perms)))]
       [::api (fmt (:groups api-perms))]
       [::equal? (api-graph=
                  (:groups (data-perms.graph/db-graph->api-graph data-perms))
                  (:groups api-perms))]])

    (check-sample (sample last))
    )
