(ns metabase.lib.binning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
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
