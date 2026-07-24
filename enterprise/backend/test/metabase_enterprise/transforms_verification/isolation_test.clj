(ns ^:mb/driver-tests metabase-enterprise.transforms-verification.isolation-test
  "Chained test runs inside a database-isolation frame: the whole run — seed,
  node CTAS, read-back, assertions — executes as the confined isolation
  principal in the isolation's dedicated schema. Postgres-gated: the isolation
  provisioner needs a driver isolation impl and admin-capable default creds
  (the local test superuser)."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.database-isolation.core :as isolation]
   [metabase-enterprise.transforms-verification.chain :as chain]
   [metabase-enterprise.transforms-verification.test-util :as tu]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest chain-run-inside-isolation-test
  (tu/with-test-run-features
    (mt/test-driver :postgres
      (mt/dataset test-data
        (let [db            (t2/select-one :model/Database :id (mt/id))
              isolation-id  (isolation/provision! db #{(tu/test-schema)})
              iso-schema    (isolation/isolation-schema isolation-id)
              enriched-name (mt/random-name)
              mp            (mt/metadata-provider)]
          (try
            (mt/with-temp [:model/Transform t1
                           {:source {:type :query :query (lib/native-query mp (tu/enrich-sql))}
                            :target {:schema (tu/test-schema) :type "table" :name enriched-name}}
                           :model/Transform t2*
                           {:source {:type :query :query (lib/native-query mp (tu/aggregate-sql enriched-name))}
                            :target {:schema (tu/test-schema) :type "table" :name (mt/random-name)}}]
              (testing "the chain runs to :passed entirely inside the isolation frame"
                (let [before-iso-scratch  (tu/count-test-scratch-tables (mt/id) iso-schema)
                      before-prod-scratch (tu/count-test-scratch-tables (mt/id) (tu/test-schema))
                      result              (chain/run-chain-test!
                                           (:id t2*) #{(:id t1)}
                                           {(mt/id :orders) tu/orders-rows
                                            (mt/id :people) tu/people-rows}
                                           tu/correct-expected-csv
                                           {:isolation-id isolation-id}
                                           (t2/select :model/Transform))]
                  (is (= :passed (:status result))
                      (str "diff: " (pr-str (:diff result))))
                  (testing "scratch tables lived and died in the isolation schema"
                    (is (= before-iso-scratch (tu/count-test-scratch-tables (mt/id) iso-schema))))
                  (testing "nothing was created in the production schema"
                    (is (= before-prod-scratch (tu/count-test-scratch-tables (mt/id) (tu/test-schema)))))))
              (testing "a bogus isolation id fails loud before any warehouse work"
                (is (thrown-with-msg? clojure.lang.ExceptionInfo #"(?i)isolation"
                                      (chain/run-chain-test!
                                       (:id t2*) #{(:id t1)}
                                       {(mt/id :orders) tu/orders-rows
                                        (mt/id :people) tu/people-rows}
                                       tu/correct-expected-csv
                                       {:isolation-id Integer/MAX_VALUE}
                                       (t2/select :model/Transform))))))
            (finally
              (isolation/decommission! isolation-id))))))))
