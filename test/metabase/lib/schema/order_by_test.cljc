(ns metabase.lib.schema.order-by-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.order-by :as lib.schema.order-by]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]))

(def ^:private valid-order-bys
  [[:asc
    {:lib/uuid "00000000-0000-0000-0000-000000000000"}
    [:field
     {:lib/uuid "00000000-0000-0000-0000-000000000000"
      :base-type :type/Text}
     63400]]
   [:desc
    {:lib/uuid "00000000-0000-0000-0000-000000000001"}
    [:field
     {:lib/uuid "00000000-0000-0000-0000-000000000001"
      :base-type :type/DateTime
      :effective-type :type/Integer}
     63401]]])

(def ^:private invalid-order-bys
  [;; Invalid asc/desc key
   [:increasing
    {:lib/uuid "00000000-0000-0000-0000-000000000000"}
    [:field
     {:lib/uuid "00000000-0000-0000-0000-000000000000"
      :base-type :type/Text}
     63400]]
   ;; Invalid :base-type
   [:desc
    {:lib/uuid "00000000-0000-0000-0000-000000000001"}
    [:field
     {:lib/uuid "00000000-0000-0000-0000-000000000001"
      :base-type :type/Address}
     63401]]])

(deftest ^:parallel valid-order-by-schema-test
  (testing "valid order-by conforms to schema"
    (doseq [order-by valid-order-bys]
      (testing (u/pprint-to-str order-by)
        (is (not (mr/explain ::lib.schema.order-by/order-by order-by)))))))

(deftest ^:parallel invalid-order-by-schema-test
  (testing "invalid order-by does not conform to schema"
    (doseq [invalid-order-by invalid-order-bys]
      (testing (u/pprint-to-str invalid-order-by)
        (binding [lib.schema.expression/*suppress-expression-type-check?* nil]
          (is (mr/explain ::lib.schema.order-by/order-by invalid-order-by)))))))

(deftest ^:parallel valid-order-bys-schema-test
  (testing "valid order-bys conform to schema"
    (is (not (mr/explain ::lib.schema.order-by/order-bys valid-order-bys)))))

(deftest ^:parallel invalid-order-bys-schema-test
  (testing "invalid order-bys do not conform to schema"
    (binding [lib.schema.expression/*suppress-expression-type-check?* nil]
      (is (mr/explain ::lib.schema.order-by/order-bys invalid-order-bys))))

  (testing "non-distinct order-bys do not conform to schema"
    (is (mr/explain ::lib.schema.order-by/order-bys (conj valid-order-bys (first valid-order-bys))))))
