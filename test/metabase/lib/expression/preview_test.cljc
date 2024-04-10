(ns metabase.lib.expression.preview-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.expression.preview :as lib.expression.preview]
   [metabase.lib.test-metadata :as meta]))

(comment lib/keep-me)

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private orders-row-values
  {"ID"         "3"
   "USER_ID"    "1"
   "PRODUCT_ID" "105"
   "SUBTOTAL"   52.723521442619514
   "TAX"        2.9
   "TOTAL"      49.206842233769756
   "DISCOUNT"   nil
   "CREATED_AT" "2025-12-06T22:22:48.544+02:00"
   "QUANTITY"   2})

(defn- orders-query []
  (lib/query meta/metadata-provider (meta/table-metadata :orders)))

(defn- orders-row []
  (vec (for [col (lib/returned-columns (orders-query))]
         {:column col
          :value  (get orders-row-values (:name col))})))

(defn- preview [expression]
  (lib.expression.preview/preview-expression (orders-query) -1 expression (orders-row)))

(deftest ^:parallel preview-expression-test-1-literals-identity
  (testing "literals are returned as-is"
    (are [expected expression] (= expected (preview expression))
      0     0
      1     1
      "foo" "foo"
      true  true
      false false
      nil   nil)))

(deftest ^:parallel preview-expression-test-2-arithmetic-on-literals
  (testing "arithmetic works on literal numbers"
    (are [expected expression] (= expected (preview expression))
      12  [:+ {} 7 5]
      2.5 [:/ {} 5 2]
      71  [:- {} [:* {} 9 8] 1])))

(deftest ^:parallel preview-expression-test-3-concat-on-literals
  (testing "concat works on literal strings"
    (are [expected expression] (= expected (preview expression))
      "some text goes here" [:concat {} "some text" " " "goes" " " "here"]
      "words"               [:concat {} "words"])))

(deftest ^:parallel preview-expression-test-4a-field-refs-by-id
  (testing "field refs by ID work"
    (let [by-name (->> (orders-query)
                       lib/returned-columns
                       (m/index-by :name))]
      (doseq [[column-name expected] orders-row-values
              :let [column  (get by-name column-name)
                    col-ref (lib/ref column)]]
        (is (int? (last col-ref))) ; Confirm these are refs by ID.
        (is (= expected (preview col-ref)))))))

(deftest ^:parallel preview-expression-test-4b-field-refs-by-name
  (testing "field refs by name work"
    (let [by-name (->> (orders-query)
                       lib/returned-columns
                       (m/index-by :name))]
      (doseq [[column-name expected] orders-row-values
              :let [column  (get by-name column-name)
                    col-ref (lib/ref (dissoc column :id))]]
        (is (string? (last col-ref))) ; Confirm these are refs by name.
        (is (= expected (preview col-ref)))))))

(deftest ^:parallel preview-expression-test-5-combined
  (testing "everything mixed together"
    (is (= (/ (orders-row-values "SUBTOTAL")
              (orders-row-values "QUANTITY"))
           (preview [:/ {}
                     [:field {:lib/uuid (str (random-uuid))} (meta/id :orders :subtotal)]
                     [:field {:lib/uuid (str (random-uuid))} (meta/id :orders :quantity)]])))))
