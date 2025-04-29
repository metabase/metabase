(ns metabase-enterprise.impersonation.cache-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer [deftest testing is]]
   [metabase-enterprise.impersonation.util-test :as impersonation.util-test]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.cache-test :as cache-test]
   [metabase.test :as mt]))

(deftest impersonated-users-get-a-different-cache
  (let [query (assoc (mt/mbql-query products)
                     :cache-strategy
                     {:type :ttl
                      :multiplier 60
                      :avg-execution-ms 1000
                      :min-duration-ms 1})]
    (mt/with-premium-features #{:advanced-permissions}
      (cache-test/with-mock-cache! [save-chan purge-chan]
        (while (a/poll! save-chan))
        (while (a/poll! purge-chan))
        (impersonation.util-test/with-impersonations! {:impersonations [{:db-id (mt/id) :attribute "impersonation_attr"}]
                                                       :attributes     {:impersonation_attr "impersonation_role"}}
          (testing "on the first run, rasta's query is not cached"
            (is (not (:cached (:cache/details (mt/with-test-user :rasta (qp/process-query query)))))))
          (mt/wait-for-result save-chan)
          (testing "on the second run, rasta's query is cached"
            (is (:cached (:cache/details (mt/with-test-user :rasta (qp/process-query query))))))
          (is (not (:cached (:cache/details (mt/with-test-user :crowberto (qp/process-query query))))))
          (mt/wait-for-result save-chan)
          (let [{rasta-hash :hash rasta-updated :updated_at rasta-cached? :cached}
                (:cache/details (mt/with-test-user :rasta (qp/process-query query)))
                {crowberto-hash :hash crowberto-updated :updated_at crowberto-cached? :cached}
                (:cache/details (mt/with-test-user :crowberto (qp/process-query query)))]
            (is (= true rasta-cached? crowberto-cached?))
            (is (not= rasta-hash crowberto-hash))
            (is (not= rasta-updated crowberto-updated))))))))
