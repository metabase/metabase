(ns metabase.lib.breakout-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel query-name-with-breakouts-test
  (let [query (-> (lib/query-for-table-name meta/metadata-provider "CHECKINS")
                  (lib/aggregate (lib/count))
                  (lib/breakout (lib/temporal-bucket (lib/field (meta/id :checkins :date)) :year)))]
    (is (=? {:lib/type :mbql/query
             :database (meta/id)
             :type     :pipeline
             :stages   [{:lib/type     :mbql.stage/mbql
                         :source-table (meta/id :checkins)
                         :aggregation  [[:count {}]]
                         :breakout     [[:field
                                         {:base-type :type/Date, :temporal-unit :year}
                                         (meta/id :checkins :date)]]}]}
            query))
    (is (= "Checkins, Count, Grouped by Date (year)"
           (lib/display-name query query)
           (lib/describe-query query)
           (lib/suggested-name query)))))
