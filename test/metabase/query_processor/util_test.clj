(ns metabase.query-processor.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.util :as qp.util]
   [metabase.system.core :as system]))

(defn- venues-query []
  (lib/query meta/metadata-provider (meta/table-metadata :venues)))

(deftest ^:parallel default-query->remark-test
  (testing "Without query info, the remark has the instance and database IDs only"
    (is (= (format "Metabase accountID: %s databaseID: %d" (system/site-uuid) (meta/id))
           (qp.util/default-query->remark (venues-query)))))
  (testing "With query info, the remark has all the fields that are set"
    (is (= (format (str "Metabase:: userID: 1000 queryType: MBQL queryHash: 01020304"
                        " accountID: %s dashboardID: 20 cardID: 10 pulseID: 30 context: pulse databaseID: %d")
                   (system/site-uuid)
                   (meta/id))
           (qp.util/default-query->remark
            (assoc (venues-query) :info {:executed-by  1000
                                         :query-hash   (byte-array [1 2 3 4])
                                         :card-id      10
                                         :dashboard-id 20
                                         :pulse-id     30
                                         :context      :pulse})))))
  (testing "Native queries have the native query type"
    (is (= (format "Metabase:: userID: 1000 queryType: native queryHash: 01020304 accountID: %s cardID: 10 context: question databaseID: %d"
                   (system/site-uuid)
                   (meta/id))
           (qp.util/default-query->remark
            (assoc (lib/native-query meta/metadata-provider "SELECT 1")
                   :info {:executed-by 1000
                          :query-hash  (byte-array [1 2 3 4])
                          :card-id     10
                          :context     :question}))))))
