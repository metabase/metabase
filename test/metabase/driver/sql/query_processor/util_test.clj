(ns metabase.driver.sql.query-processor.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql.query-processor.util :as sql.qp.u]
   [metabase.util.honeysql-extensions :as hx]))

(deftest ^:parallel nfc-field->parent-identifier-test
  (testing "It replaces the last identifier member"
    (let [nfc-identifier (hx/identifier :field "boop" "beep" "boop -> deep")
          new-identifier (sql.qp.u/nfc-field->parent-identifier
                          nfc-identifier
                          {:nfc_path ["something" "boppity"]})]
      (is (= (hx/identifier :field "boop" "beep" "something") new-identifier)))))
