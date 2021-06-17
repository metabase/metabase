(ns metabase.driver.mongo.query-processor-test
  (:require [clojure.test :refer :all]
            [metabase.driver.mongo.query-processor :as mongo.qp]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [schema.core :as s]))

(deftest query->collection-name-test
  (testing "query->collection-name"
    (testing "should be able to extract :collection from :source-query")
    (is (= "checkins"
           (#'mongo.qp/query->collection-name {:query {:source-query
                                                       {:collection "checkins"
                                                        :native     []}}})))
    (testing "should work for nested-nested queries"
      (is (= "checkins"
             (#'mongo.qp/query->collection-name {:query {:source-query {:source-query
                                                                        {:collection "checkins"
                                                                         :native     []}}}}))))

    (testing "should ignore :joins"
      (is (= nil
             (#'mongo.qp/query->collection-name {:query {:source-query
                                                         {:native []}
                                                         :joins [{:source-query "wow"}]}}))))

    (testing "should ignore other :collection keys"
      (is (= nil
             (#'mongo.qp/query->collection-name {:query {:source-query
                                                         {:native [{:collection "wow"}]}}}))))))

(deftest relative-datetime-test
  (mt/test-driver :mongo
    (testing "Make sure relative datetimes are compiled sensibly"
      (mt/with-clock #t "2021-02-17T10:36:00-08:00[US/Pacific]"
        (mt/dataset attempted-murders
          (is (= {:projections ["count"]
                  :query       [{"$match"
                                 {"$and"
                                  [{:$expr {"$gte" ["$datetime" {:$dateFromString {:dateString "2021-01-01T00:00Z"}}]}}
                                   {:$expr {"$lt" ["$datetime" {:$dateFromString {:dateString "2021-02-01T00:00Z"}}]}}]}}
                                {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                {"$sort" {"_id" 1}}
                                {"$project" {"_id" false, "count" true}}]
                  :collection  "attempts"
                  :mbql?       true}
                 (qp/query->native
                  (mt/mbql-query attempts
                    {:aggregation [[:count]]
                     :filter      [:time-interval $datetime :last :month]})))))))))

(deftest no-initial-projection-test
  (mt/test-driver :mongo
    (testing "Don't need to create initial projections anymore (#4216)"
      (testing "Don't create an initial projection for datetime-fields that use `:default` bucketing (#14838)"
        (mt/with-clock #t "2021-02-15T17:33:00-08:00[US/Pacific]"
          (mt/dataset attempted-murders
            (is (= {:projections ["count"]
                    :query       [{"$match"
                                   {"$and"
                                    [{:$expr {"$gte" ["$datetime" {:$dateFromString {:dateString "2021-01-01T00:00Z"}}]}}
                                     {:$expr {"$lt" ["$datetime" {:$dateFromString {:dateString "2021-02-01T00:00Z"}}]}}]}}
                                  {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                  {"$sort" {"_id" 1}}
                                  {"$project" {"_id" false, "count" true}}]
                    :collection  "attempts"
                    :mbql?       true}
                   (qp/query->native
                    (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :filter      [:time-interval $datetime :last :month]}))))

            (testing "should still work even with bucketing bucketing"
              (let [query (mt/with-everything-store
                            (mongo.qp/mbql->native
                             (mt/mbql-query attempts
                               {:aggregation [[:count]]
                                :breakout    [[:field %datetime {:temporal-unit :month}]
                                              [:field %datetime {:temporal-unit :day}]]
                                :filter      [:= [:field %datetime {:temporal-unit :month}] [:relative-datetime -1 :month]]})))]
                (is (= {:projections ["datetime~~~month" "datetime~~~day" "count"]
                        :query       [{"$match"
                                       {:$expr
                                        {"$eq"
                                         [{:$let {:vars {:parts {:$dateToParts {:date "$datetime"}}}
                                                  :in   {:$dateFromParts {:year "$$parts.year", :month "$$parts.month"}}}}
                                          {:$dateFromString {:dateString "2021-01-01T00:00Z"}}]}}}
                                      {"$group" {"_id"   {"datetime~~~month" {:$let {:vars {:parts {:$dateToParts {:date "$datetime"}}}
                                                                                     :in   {:$dateFromParts {:year  "$$parts.year"
                                                                                                             :month "$$parts.month"}}}},
                                                          "datetime~~~day"   {:$let {:vars {:parts {:$dateToParts {:date "$datetime"}}}
                                                                                     :in   {:$dateFromParts {:year  "$$parts.year"
                                                                                                             :month "$$parts.month"
                                                                                                             :day   "$$parts.day"}}}}}
                                                 "count" {"$sum" 1}}}
                                      {"$sort" {"_id" 1}}
                                      {"$project" {"_id"              false
                                                   "datetime~~~month" "$_id.datetime~~~month"
                                                   "datetime~~~day"   "$_id.datetime~~~day"
                                                   "count"            true}}],
                        :collection  "attempts"
                        :mbql?       true}
                       query))
                (testing "Make sure we can actually run the query"
                  (is (schema= {:status   (s/eq :completed)
                                s/Keyword s/Any}
                               (qp/process-query (mt/native-query query)))))))))))))

(deftest nested-columns-test
  (mt/test-driver :mongo
    (testing "Should generate correct queries against nested columns"
      (mt/dataset geographical-tips
        (mt/with-everything-store
          (is (= {:projections ["count"]
                  :query       [{"$match" {"source.username" "tupac"}}
                                {"$group" {"_id" nil, "count" {"$sum" 1}}}
                                {"$sort" {"_id" 1}}
                                {"$project" {"_id" false, "count" true}}],
                  :collection  "tips",
                  :mbql?       true}
                 (mongo.qp/mbql->native
                  (mt/mbql-query tips
                    {:aggregation [[:count]]
                     :filter      [:= $tips.source.username "tupac"]}))))

          (is (= {:projections ["source.username" "count"]
                  :query       [{"$group" {"_id"   {"source" {"username" "$source.username"}}
                                           "count" {"$sum" 1}}}
                                {"$sort" {"_id" 1}}
                                ;; Or should this be {"source" {"username" "$_id.source.username"}} ?
                                {"$project" {"_id" false, "source.username" "$_id.source.username", "count" true}}]
                  :collection  "tips"
                  :mbql?       true}
                 (mongo.qp/mbql->native
                  (mt/mbql-query tips
                    {:aggregation [[:count]]
                     :breakout    [$tips.source.username]})))))))))

(deftest multiple-distinct-count-test
  (mt/test-driver :mongo
    (testing "Should generate correct queries for multiple `:distinct` count aggregations (#13097)"
      (is (= {:projections ["count" "count_2"]
              :query
              [{"$group" {"_id" nil, "count" {"$addToSet" "$name"}, "count_2" {"$addToSet" "$price"}}}
               {"$sort" {"_id" 1}}
               {"$project" {"_id" false, "count" {"$size" "$count"}, "count_2" {"$size" "$count_2"}}}
               {"$limit" 5}],
              :collection  "venues"
              :mbql?       true}
             (qp/query->native
              (mt/mbql-query venues
                {:aggregation [[:distinct $name]
                               [:distinct $price]]
                 :limit       5})))))))

(deftest compile-time-interval-test
  (mt/test-driver :mongo
    (testing "Make sure time-intervals work the way they're supposed to."
      (mt/with-clock #t "2021-02-17T10:36:00-08:00[US/Pacific]"
        (testing "[:time-interval $date -4 :month] should give us something like Oct 01 2020 - Feb 01 2021 if today is Feb 17 2021"
          (is (= [{"$match"
                   {"$and"
                    [{:$expr {"$gte" ["$date" {:$dateFromString {:dateString "2020-10-01T00:00Z"}}]}}
                     {:$expr {"$lt" ["$date" {:$dateFromString {:dateString "2021-02-01T00:00Z"}}]}}]}}
                  {"$group"
                   {"_id"
                    {"date~~~day"
                     {:$let
                      {:vars {:parts {:$dateToParts {:date "$date"}}},
                       :in   {:$dateFromParts {:year "$$parts.year", :month "$$parts.month", :day "$$parts.day"}}}}}}}
                  {"$sort" {"_id" 1}}
                  {"$project" {"_id" false, "date~~~day" "$_id.date~~~day"}}
                  {"$sort" {"date~~~day" 1}}
                  {"$limit" 1048575}]
                 (:query
                  (qp/query->native
                   (mt/mbql-query checkins
                     {:filter   [:time-interval $date -4 :month]
                      :breakout [[:datetime-field $date :day]]}))))))))))
