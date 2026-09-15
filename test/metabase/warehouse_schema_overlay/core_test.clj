(ns metabase.warehouse-schema-overlay.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.schema]))

(comment metabase.warehouse-schema.schema/keep-me)

(deftest ^:parallel table-columns-match-the-table-schema-test
  (testing "the spelled-out column list keeps up with the Table schema it cannot require"
    (is (= (into #{:id :unique_table_helper} (mu/map-schema-keys :metabase.warehouse-schema.schema/table.update))
           warehouse-schema-overlay/table-columns))))

(deftest ^:parallel field-columns-match-the-field-schema-test
  (testing "the spelled-out column list keeps up with the Field schema it cannot require"
    (is (= (into #{:id :unique_field_helper} (mu/map-schema-keys :metabase.warehouse-schema.schema/field.update))
           warehouse-schema-overlay/field-columns))))
