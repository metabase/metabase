(ns metabase.driver.sql.query-processor.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.util.honey-sql-2 :as h2x]))

(deftest ^:parallel nfc-field->parent-identifier-test
  (testing "It replaces the last identifier member"
    (let [nfc-identifier (h2x/identifier :field "boop" "beep" "boop -> deep")
          new-identifier (sql.qp.u/nfc-field->parent-identifier
                          nfc-identifier
                          {:nfc-path ["something" "boppity"]})]
      (is (= (h2x/identifier :field "boop" "beep" "something") new-identifier)))))
