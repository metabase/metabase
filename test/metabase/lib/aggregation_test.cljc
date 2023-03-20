(ns metabase.lib.aggregation-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]))

(defn- is-fn? [op tag args expected-args]
  (let [f (apply op args)]
    (is (fn? f))
    (is (=? (into [tag {:lib/uuid string?}]
                  expected-args)
            (f {:lib/metadata meta/metadata} -1)))))

(deftest ^:parallel aggregation-test
  (let [q1 (lib/query-for-table-name meta/metadata-provider "CATEGORIES")
        venues-category-id-metadata (lib.metadata/field q1 nil "VENUES" "CATEGORY_ID")
        venue-field-check [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]]
    (testing "count"
      (testing "without query/stage-number, return a function for later resolution"
        (is-fn? lib/count :count [] [])
        (is-fn? lib/count :count [venues-category-id-metadata] [venue-field-check])))
    (testing "single arg aggregations"
      (doseq [[op tag] [[lib/avg :avg]
                        [lib/max :max]
                        [lib/min :min]
                        [lib/median :median]
                        [lib/sum :sum]
                        [lib/stddev :stddev]
                        [lib/distinct :distinct]]]
        (testing "without query/stage-number, return a function for later resolution"
          (is-fn? op tag [venues-category-id-metadata] [venue-field-check]))))))

(deftest ^:parallel aggregate-test
  (is (=? {:lib/type :mbql/query,
           :database (meta/id) ,
           :type :pipeline,
           :stages [{:lib/type :mbql.stage/mbql,
                     :source-table (meta/id :venues) ,
                     :lib/options {:lib/uuid string?},
                     :aggregation [[:sum {:lib/uuid string?}
                                    [:field {:base-type :type/Integer, :lib/uuid string?} (meta/id :venues :category-id)]]]}]}
          (-> (lib/query-for-table-name meta/metadata-provider "VENUES")
              (lib/aggregate (lib/sum (lib/field "VENUES" "CATEGORY_ID")))
              (dissoc :lib/metadata)))))
