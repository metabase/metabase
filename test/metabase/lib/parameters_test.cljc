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
    (testing "defaults to 0 when no stage-number specified"
      (is (= 0
             (lib/parameter-target-stage-number target))))
    (testing "returns stage-number from dimension options"
      (is (= 0
             (lib/parameter-target-stage-number (conj target {:stage-number 0}))))
      (is (= 2
             (lib/parameter-target-stage-number (conj target {:stage-number 2})))))))

(deftest ^:parallel update-parameter-target-field-ref-test
  (let [query      (lib/query meta/metadata-provider (meta/table-metadata :orders))
        col        (first (lib/filterable-columns query))
        field-ref  (lib/->legacy-MBQL (lib.ref/ref col))
        other-col  (second (lib/filterable-columns query))
        other-ref  (lib/->legacy-MBQL (lib.ref/ref other-col))]
    (testing "dimension target: replaces the field ref"
      (is (= [:dimension other-ref]
             (lib/update-parameter-target-field-ref
              [:dimension field-ref]
              (fn [_pmbql-ref] (lib.ref/ref other-col))))))
    (testing "dimension target with options: preserves options"
      (is (= [:dimension other-ref {:stage-number 0}]
             (lib/update-parameter-target-field-ref
              [:dimension field-ref {:stage-number 0}]
              (fn [_pmbql-ref] (lib.ref/ref other-col))))))
    (testing "no field ref: returns target unchanged"
      (doseq [target [[:variable [:template-tag "foo"]]
                      [:dimension [:template-tag "tag"]]]]
        (is (= target
               (lib/update-parameter-target-field-ref
                target
                (fn [_] (throw (ex-info "should not be called" {}))))))))
    (testing "passes extra args to f"
      (is (= [:dimension other-ref]
             (lib/update-parameter-target-field-ref
              [:dimension field-ref]
              (fn [_pmbql-ref extra-col] (lib.ref/ref extra-col))
              other-col))))))
