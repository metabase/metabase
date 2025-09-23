(ns metabase.lib.metadata.composed-provider-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]))

#?(:cljs
   (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel composed-metadata-provider-test
  (testing "Return things preferentially from earlier metadata providers"
    (let [time-field        (assoc (meta/field-metadata :people :birth-date)
                                   :base-type      :type/Time
                                   :effective-type :type/Time)
          metadata-provider (lib/composed-metadata-provider
                             (lib.tu/mock-metadata-provider
                              {:fields [time-field]})
                             meta/metadata-provider)]
      (is (=? {:name           "BIRTH_DATE"
               :base-type      :type/Time
               :effective-type :type/Time}
              (lib.metadata/field
               metadata-provider
               (meta/id :people :birth-date)))))))

(deftest ^:parallel equality-test
  (is (= (lib/composed-metadata-provider meta/metadata-provider)
         (lib/composed-metadata-provider meta/metadata-provider))))

(deftest ^:parallel deleted-columns-metadata-provider-sanity-check-test
  (testing "A composed provider should propagate things like inactive status correctly"
    (let [mp (lib.tu/merged-mock-metadata-provider
              meta/metadata-provider
              {:fields [{:id (meta/id :orders :tax), :active false}]})]
      (is (= {"CREATED_AT" true
              "DISCOUNT"   true
              "ID"         true
              "PRODUCT_ID" true
              "QUANTITY"   true
              "SUBTOTAL"   true
              ;; should NOT be returned because [[lib.metadata/fields]] should filter out inactive fields by default.
              ;; "TAX"        false
              "TOTAL"      true
              "USER_ID"    true}
             (into (sorted-map)
                   (map (juxt :name :active))
                   (lib.metadata/fields mp (meta/id :orders)))))
      (testing "Fetching by ID"
        (is (=? {:active false}
                (lib.metadata/field mp (meta/id :orders :tax)))))
      (testing "Fetching by Name"
        (is (=? [{:active false}]
                (lib.metadata.protocols/metadatas mp {:lib/type :metadata/column, :table-id (meta/id :orders), :name #{"TAX"}})))))))
