(ns ^:mb/driver-tests metabase-enterprise.dependencies.driver-api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.dependencies.api-test :refer [card-with-query]]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.test-util :as transforms.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.permissions.core :as perms]
   [metabase.queries.models.card :as card]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest transform-target-card-graph-test
  (testing "GET /api/ee/dependencies/graph shows card -> transform-target-table -> transform -> source-table chain"
    (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table)
      (mt/with-premium-features #{:dependencies :transforms}
        (mt/with-model-cleanup [:model/Card :model/Dependency :model/Table]
          (let [metadata-provider (mt/metadata-provider)
                orders-table-metadata (lib.metadata/table metadata-provider (mt/id :orders))
                orders-query (-> (lib/query metadata-provider orders-table-metadata)
                                 (lib/limit 10))
                target-schema (t2/select-one-fn :schema :model/Table (mt/id :orders))
                target-table-name "transform_target"]
            (mt/with-non-admin-groups-no-root-collection-perms
              (mt/with-temp [:model/Collection readable-collection {}
                             :model/User user {:email "test@test.com"}
                             :model/Transform transform {:name "Orders Transform"
                                                         :source {:type "query"
                                                                  :query orders-query}
                                                         :target {:type "table"
                                                                  :schema target-schema
                                                                  :name target-table-name}}]
                (transforms.i/execute! transform {:run-method :manual})
                (let [target-table (transforms.tu/wait-for-table target-table-name 10000)
                      target-table-metadata (lib.metadata/table metadata-provider (:id target-table))
                      target-query (lib/query metadata-provider target-table-metadata)
                      card (card/create-card! (assoc (card-with-query "Card on transform target" target-query)
                                                     :collection_id (:id readable-collection))
                                              user)]
                  (perms/grant-collection-read-permissions! (perms/all-users-group) readable-collection)
                  (testing "Graph endpoint shows full chain"
                    (let [response (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph"
                                                         :id (:id card)
                                                         :type "card")
                          node-types (set (map :type (:nodes response)))]
                      (is (= #{"card" "table" "transform"} node-types))))
                  (testing "Dependents endpoint works from transform"
                    (mt/user-http-request :crowberto :get 200 "ee/dependencies/graph/dependents"
                                          :id (:id transform)
                                          :type "transform"
                                          :dependent_type "card"
                                          :dependent_card_type "question"))
                  (testing "Permission restrictions: :rasta cannot see transform target table"
                    (mt/with-no-data-perms-for-all-users!
                      (let [response (mt/user-http-request :rasta :get 200 "ee/dependencies/graph"
                                                           :id (:id card)
                                                           :type "card")
                            node-types (set (map :type (:nodes response)))]
                        (is (= #{"card"} node-types) "Only card should be visible")))))))))))))
