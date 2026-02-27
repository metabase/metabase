(ns metabase.lib.parameters-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel parameter-target-field-id-test
  (is (= 256
         (lib/parameter-target-field-id [:dimension [:field 256 nil]]))))

(deftest ^:parallel parameter-target-stage-number-test
  (let [query     (lib/query meta/metadata-provider (meta/table-metadata :orders))
        col       (first (lib/filterable-columns query))
        field-ref (lib/->legacy-MBQL (lib.ref/ref col))
        target    [:dimension field-ref]]
    (testing "defaults to -1 when no stage-number specified"
      (is (= -1
             (lib/parameter-target-stage-number target))))
    (testing "returns stage-number from dimension options"
      (is (= 0
             (lib/parameter-target-stage-number (conj target {:stage-number 0}))))
      (is (= 2
             (lib/parameter-target-stage-number (conj target {:stage-number 2})))))))
