(ns metabase.lib.schema.expression.window-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   #?@(:clj  ([metabase.lib.core :as lib]
              [metabase.lib.metadata :as lib.metadata]
              [metabase.lib.serialize :as lib.serialize]
              [metabase.lib.test-metadata :as meta]
              [metabase.util.json :as json]))
   [clojure.test :refer [deftest are #?@(:clj [is testing])]]
   [metabase.lib.normalize :as lib.normalize]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel normalize-offset-test
  (are [x] (=? [:offset
                {:lib/uuid string?, :effective-type :type/Float}
                [:field
                 {:base-type :type/Float, :effective-type :type/Float, :lib/uuid string?}
                 1]
                -1]
               (lib.normalize/normalize x))
    [:offset
     {:effective-type "type/Float"}
     [:field
      {:base-type "type/Float", :effective-type "type/Float"}
      1]
     -1]

    ["offset"
     {"effective-type" "type/Float"}
     ["field"
      {"base-type" "type/Float", "effective-type" "type/Float"}
      1]
     -1]))

#?(:clj
   (deftest ^:parallel window-json-roundtrip-test
     (testing "a query with a :window expression round-trips through JSON serialization"
       (let [mp        meta/metadata-provider
             checkins  (lib.metadata/table mp (meta/id :checkins))
             uid       (lib.metadata/field mp (meta/id :checkins :user-id))
             date      (lib.metadata/field mp (meta/id :checkins :date))
             venue-id  (lib.metadata/field mp (meta/id :checkins :venue-id))
             window    (lib/window (lib/lag (lib/ref date) 1)
                                   {:partition-by [(lib/ref uid)]
                                    :order-by     [[(lib/ref date) :asc]]
                                    :frame        {:type    :rows
                                                   :start   [:preceding 3]
                                                   :end     :current-row
                                                   :exclude :current-row}})
             original  (-> (lib/query mp checkins)
                           (lib/expression "prev_venue_lag" window)
                           (lib/aggregate (lib/sum (lib/ref venue-id))))
             prepped   (lib.serialize/prepare-for-serialization original)
             round-trip (-> prepped json/encode json/decode lib.normalize/normalize)]
         (is (=? prepped round-trip))))))
