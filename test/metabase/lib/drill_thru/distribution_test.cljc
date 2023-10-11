(ns metabase.lib.drill-thru.distribution-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.distribution :as lib.drill-thru.distribution]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel aggregate-column-test
  (testing "Don't suggest distribution drill thrus for aggregate columns like `count(*)`"
    (let [query     (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                        (lib/aggregate (lib/count))
                        (lib/breakout (meta/field-metadata :orders :product-id)))
          count-col (m/find-first (fn [col]
                                    (= (:display-name col) "Count"))
                                  (lib/returned-columns query))
          context   {:column count-col
                     :value  nil}]
      (is (some? count-col))
      (is (nil? (lib.drill-thru.distribution/distribution-drill query -1 context))))))
