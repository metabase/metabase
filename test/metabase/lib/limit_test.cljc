(ns metabase.lib.limit-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel limit-test
  (letfn [(limit [query]
            (get-in query [:stages 0 :limit] ::not-found))]
    (let [query (-> (lib.tu/venues-query)
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
    (let [query (lib.tu/venues-query)]
      (is (nil? (lib/current-limit query)))
      (is (nil? (lib/current-limit query -1)))
      (is (= 100 (lib/current-limit (lib/limit query 100))))
      (is (= 100 (lib/current-limit (lib/limit query 100) -1))))))

(deftest ^:parallel current-limit-test-2
  (testing "First stage"
    (let [query (lib/query meta/metadata-provider {:database (meta/id)
                                                   :type     :query
                                                   :query    {:source-query {:source-table (meta/id :venues)}}})]
      (is (nil? (lib/current-limit query 0)))
      (is (nil? (lib/current-limit query 1)))
      (is (= 100 (lib/current-limit (lib/limit query 0 100) 0)))
      (is (nil? (lib/current-limit query 1))))))

(deftest ^:parallel max-rows-limit-test-1
  (testing "if `:max-results` is set return that"
    (is (= 15
           (lib/max-rows-limit
            {:database     1
             :lib/type     :mbql/query
             :lib/metadata meta/metadata-provider
             :stages       [{:lib/type :mbql.stage/mbql, :source-table 1}]
             :constraints  {:max-results 15}})))))

(deftest ^:parallel max-rows-limit-test-2
  (testing "if `:max-results-bare-rows` is set AND query has no aggregations, return that"
    (are [query expected] (= expected (lib/max-rows-limit query))
      {:database     1
       :lib/type     :mbql/query
       :lib/metadata meta/metadata-provider
       :stages       [{:lib/type :mbql.stage/mbql, :source-table 1}]
       :constraints  {:max-results 15, :max-results-bare-rows 10}}
      10

      {:database     1
       :lib/type     :mbql/query
       :lib/metadata meta/metadata-provider
       :stages       [{:lib/type :mbql.stage/native
                       :native   "SELECT * FROM my_table"}]
       :constraints  {:max-results 15, :max-results-bare-rows 10}}
      10)))

(deftest ^:parallel max-rows-limit-test-3
  (testing "if `:max-results-bare-rows` is set but query has aggregations, return `:max-results` instead"
    (is (= 5
           (lib/max-rows-limit
            {:database     1
             :lib/type     :mbql/query
             :lib/metadata meta/metadata-provider
             :stages       [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]
             :constraints  {:max-results 5, :max-results-bare-rows 4}})))))

(deftest ^:parallel max-rows-limit-test-4
  (testing "should return `:limit` if set"
    (is (= 10
           (lib/max-rows-limit
            {:database     1
             :lib/type     :mbql/query
             :lib/metadata meta/metadata-provider
             :stages       [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :limit        10}]})))))

(deftest ^:parallel max-rows-limit-test-5
  (testing "if both `:limit` and `:constraints` are set, prefer the smaller of the two"
    (are [query expected] (= expected (lib/max-rows-limit query))
      {:database     1
       :lib/type     :mbql/query
       :lib/metadata meta/metadata-provider
       :stages       [{:lib/type     :mbql.stage/mbql
                       :source-table 1
                       :limit        5}]
       :constraints  {:max-results 10}}
      5

      {:database     1
       :lib/type     :mbql/query
       :lib/metadata meta/metadata-provider
       :stages       [{:lib/type     :mbql.stage/mbql
                       :source-table 1
                       :limit        15}]
       :constraints  {:max-results 10}}
      10)))

(deftest ^:parallel max-rows-limit-test-6
  (testing "if both `:limit` and `:page` are set (not sure makes sense), return the smaller of the two"
    (are [query expected] (= expected (lib/max-rows-limit query))
      {:database     1
       :lib/type     :mbql/query
       :lib/metadata meta/metadata-provider
       :stages       [{:lib/type     :mbql.stage/mbql
                       :source-table 1
                       :limit        10
                       :page         {:page 1, :items 5}}]}
      5

      {:database     1
       :lib/type     :mbql/query
       :lib/metadata meta/metadata-provider
       :stages       [{:lib/type     :mbql.stage/mbql
                       :source-table 1
                       :limit        5
                       :page         {:page 1, :items 10}}]}
      5)))

(deftest ^:parallel max-rows-limit-test-7
  (testing "if nothing is set return `nil`"
    (is (nil? (lib/max-rows-limit
               {:database 1
                :lib/type :mbql/query
                :lib/metadata meta/metadata-provider
                :stages [{:lib/type :mbql.stage/mbql
                          :source-table 1}]})))))

(deftest ^:parallel max-rows-limit-test-8
  (testing "should return `:page` items if set"
    (is (= 5
           (lib/max-rows-limit
            {:database     1
             :lib/type     :mbql/query
             :lib/metadata meta/metadata-provider
             :stages       [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :page         {:page 1, :items 5}}]})))))

(deftest ^:parallel max-rows-limit-test-9
  (testing "since this query doesn't have an aggregation we should be using `max-results-bare-rows`"
    (is (= 5
           (lib/max-rows-limit
            {:database    1
             :lib/type    :mbql/query :lib/metadata meta/metadata-provider
             :stages      [{:lib/type     :mbql.stage/mbql
                            :source-table 1
                            :limit        10}]
             :constraints {:max-results 15, :max-results-bare-rows 5}})))))

(deftest ^:parallel max-rows-limit-test-10
  (testing "add an aggregation, and `:max-results` is used instead; since `:limit` is lower, return that"
    (is (= 10
           (lib/max-rows-limit
            {:database     1
             :lib/type     :mbql/query
             :lib/metadata meta/metadata-provider
             :stages       [{:lib/type     :mbql.stage/mbql
                             :source-table 1
                             :limit        10
                             :aggregation  [[:count {:lib/uuid "00000000-0000-0000-0000-000000000000"}]]}]
             :constraints  {:max-results 15, :max-results-bare-rows 5}})))))
