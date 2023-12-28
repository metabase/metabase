(ns metabase.lib.binning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel binning-display-name-for-coordinate-columns-test
  (testing "Include little degree symbols in display names for coordinate columns"
    (let [query     (lib/query meta/metadata-provider (meta/table-metadata :people))
          longitude (meta/field-metadata :people :longitude)
          binning   (m/find-first #(= (:display-name %) "Bin every 20 degrees")
                                  (lib/available-binning-strategies query longitude))]
      (is binning)
      (let [display-name (lib/display-name query (lib/with-binning longitude binning))]
        (is (= "Longitude: 20°"
               display-name))))))

(deftest ^:parallel resolve-default-bin-width-test
  (let [query        (-> (lib/query meta/metadata-provider (meta/table-metadata :orders))
                         (lib/aggregate (lib/count))
                         (lib/breakout (-> (meta/field-metadata :orders :quantity)
                                           (lib/with-binning {:strategy :default}))))
        col-quantity (m/find-first #(= (:name %) "QUANTITY")
                                   (lib/returned-columns query))]
    (is (some? col-quantity))
    (is (= {:bin-width 12.5, :min-value 15, :max-value 27.5}
           (lib.binning/resolve-bin-width query col-quantity 15)))))
