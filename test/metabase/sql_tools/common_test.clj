(ns metabase.sql-tools.common-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.sql-tools.common :as sql-tools.common]))

;;; ------------------------------------------- find-table-or-transform --------------------------------------------

(def ^:private orders-table {:name "orders" :schema "some_other_schema" :id 1})
(def ^:private people-table {:name "people" :schema "some_other_schema" :id 2})

(deftest ^:parallel find-table-or-transform-unqualified-unique-name-test
  (testing "An unqualified reference to a name existing in exactly one schema resolves to it, even
            when that schema isn't the driver's default-schema literal (:h2's is \"PUBLIC\")."
    (is (= {:table 1}
           (sql-tools.common/find-table-or-transform
            :h2 [orders-table people-table] [] {:table "orders" :schema nil})))
    (is (= {:table 2}
           (sql-tools.common/find-table-or-transform
            :h2 [orders-table people-table] [] {:table "PEOPLE" :schema nil})))))

(deftest ^:parallel find-table-or-transform-explicit-schema-still-exact-test
  (testing "An explicit schema still requires an exact match -- the unqualified shortcut doesn't
            loosen qualified references."
    (is (= {:table 1}
           (sql-tools.common/find-table-or-transform
            :h2 [orders-table people-table] [] {:table "orders" :schema "some_other_schema"})))
    (is (nil? (sql-tools.common/find-table-or-transform
               :h2 [orders-table people-table] [] {:table "orders" :schema "PUBLIC"})))))

(deftest ^:parallel find-table-or-transform-ambiguous-name-falls-back-to-default-schema-test
  (testing "A name duplicated across schemas is ambiguous on its own, so an unqualified reference
            falls back to matching the driver's default-schema literal."
    (let [public-orders {:name "orders" :schema "PUBLIC" :id 10}
          other-orders  {:name "orders" :schema "some_other_schema" :id 20}]
      (is (= {:table 10}
             (sql-tools.common/find-table-or-transform
              :h2 [public-orders other-orders] [] {:table "orders" :schema nil})))))
  (testing "...and returns nil when even the default-schema candidate is missing."
    (let [schema-a {:name "orders" :schema "schema_a" :id 10}
          schema-b {:name "orders" :schema "schema_b" :id 20}]
      (is (nil? (sql-tools.common/find-table-or-transform
                 :h2 [schema-a schema-b] [] {:table "orders" :schema nil}))))))

(deftest ^:parallel find-table-or-transform-no-match-test
  (testing "No table or transform with that name at all returns nil."
    (is (nil? (sql-tools.common/find-table-or-transform
               :h2 [orders-table] [] {:table "nonexistent" :schema nil})))))

(deftest ^:parallel find-table-or-transform-unqualified-transform-target-test
  (testing "The unqualified unique-name shortcut applies to transform targets too."
    (is (= {:transform 99}
           (sql-tools.common/find-table-or-transform
            :h2 [] [{:id 99 :target {:name "widgets" :schema "some_other_schema"}}]
            {:table "widgets" :schema nil})))))
