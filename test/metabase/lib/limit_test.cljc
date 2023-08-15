(ns metabase.lib.limit-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel limit-test
  (letfn [(limit [query]
            (get-in query [:stages 0 :limit] ::not-found))]
    (let [query (-> lib.tu/venues-query
                    (lib/limit 100))]
      (is (= 100
             (limit query)))
      (is (=? {:stages [{:source-table (meta/id :venues)
                         :limit        100}]}
              query))
      (testing "remove a limit"
        (is (= ::not-found
               (limit (-> query
                          (lib/limit nil)))))))))

(deftest ^:parallel current-limit-test
  (testing "Last stage"
    (let [query lib.tu/venues-query]
      (is (nil? (lib/current-limit query)))
      (is (nil? (lib/current-limit query -1)))
      (is (= 100 (lib/current-limit (lib/limit query 100))))
      (is (= 100 (lib/current-limit (lib/limit query 100) -1)))))
  (testing "First stage"
    (let [query (lib/query meta/metadata-provider {:database (meta/id)
                                                   :type     :query
                                                   :query    {:source-query {:source-table (meta/id :venues)}}})]
      (is (nil? (lib/current-limit query 0)))
      (is (nil? (lib/current-limit query 1)))
      (is (= 100 (lib/current-limit (lib/limit query 0 100) 0)))
      (is (nil? (lib/current-limit query 1))))))
