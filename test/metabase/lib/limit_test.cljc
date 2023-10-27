(ns metabase.lib.limit-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.limit :as lib.limit]
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


(println "FIXME: update to use pMBQL queries.")

(deftest ^:parallel query->max-rows-limit-test
  (doseq [[group query->expected]
          {"should return `:limit` if set"
           {{:database 1, :type :query, :query {:source-table 1, :limit 10}} 10}

           "should return `:page` items if set"
           {{:database 1, :type :query, :query {:source-table 1, :page {:page 1, :items 5}}} 5}

           "if `:max-results` is set return that"
           {{:database 1, :type :query, :query {:source-table 1}, :constraints {:max-results 15}} 15}

           "if `:max-results-bare-rows` is set AND query has no aggregations, return that"
           {{:database    1
             :type        :query
             :query       {:source-table 1}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 10
            {:database    1
             :type        :native
             :native      {:query "SELECT * FROM my_table"}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 10}

           "if `:max-results-bare-rows` is set but query has aggregations, return `:max-results` instead"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :aggregation [[:count]]}
             :constraints {:max-results 5, :max-results-bare-rows 10}} 5}

           "if both `:limit` and `:page` are set (not sure makes sense), return the smaller of the two"
           {{:database 1, :type :query, :query {:source-table 1, :limit 10, :page {:page 1, :items 5}}} 5
            {:database 1, :type :query, :query {:source-table 1, :limit 5, :page {:page 1, :items 10}}} 5}

           "if both `:limit` and `:constraints` are set, prefer the smaller of the two"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 5}
             :constraints {:max-results 10}} 5

            {:database    1
             :type        :query
             :query       {:source-table 1, :limit 15}
             :constraints {:max-results 10}} 10}

           "since this query doesn't have an aggregation we should be using `max-results-bare-rows`"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 10}
             :constraints {:max-results 15, :max-results-bare-rows 5}} 5}

           "add an aggregation, and `:max-results` is used instead; since `:limit` is lower, return that"
           {{:database    1
             :type        :query
             :query       {:source-table 1, :limit 10, :aggregation [[:count]]}
             :constraints {:max-results 15, :max-results-bare-rows 5}} 10}

           "if nothing is set return `nil`"
           {{:database 1
             :type     :query
             :query    {:source-table 1}} nil}}]
    (testing group
      (doseq [[query expected] query->expected]
        (testing (pr-str (list 'query->max-rows-limit query))
          (is (= expected
                 (lib.limit/query->max-rows-limit query -1))))))))
