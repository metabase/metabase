(ns metabase.lib-be.source-swap-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.test]))

(deftest ^:parallel swap-source-in-parameter-target-test
  (let [field-id-mapping {1 2}]
    (are [expected-target original-target]
         (= expected-target
            (lib-be/swap-source-in-parameter-target original-target field-id-mapping))
      ;; regular field id ref
      [:dimension [:field 2 nil]]
      [:dimension [:field 1 nil]]

      ;; regular field id ref with options
      [:dimension [:field 2 {:base-type :type/BigInteger}]]
      [:dimension [:field 1 {:base-type :type/BigInteger}]]

      ;; field ref with dimension options
      [:dimension [:field 2 nil] {:stage-number 0}]
      [:dimension [:field 1 nil] {:stage-number 0}]

      ;; regular field name ref
      [:dimension [:field "ID" {:base-type :type/BigInteger}]]
      [:dimension [:field "ID" {:base-type :type/BigInteger}]]

      ;; explicit join
      [:dimension [:field 2 {:join-alias "Orders"}]]
      [:dimension [:field 1 {:join-alias "Orders"}]]

      ;; implicit join - change the field id
      [:dimension [:field 2 {:source-field 9}]]
      [:dimension [:field 1 {:source-field 9}]]

      ;; implicit join - change the source field id
      [:dimension [:field 9 {:source-field 2}]]
      [:dimension [:field 9 {:source-field 1}]]

      ;; field filter template tag should be left unchanged
      [:dimension [:template-tag "category"]]
      [:dimension [:template-tag "category"]]

      ;; variable template tag should be left unchanged
      [:variable [:template-tag "category"]]
      [:variable [:template-tag "category"]])))
