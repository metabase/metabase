(ns metabase.warehouse-schema-overlay.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.malli :as mu]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [metabase.warehouse-schema.schema]))

(comment metabase.warehouse-schema.schema/keep-me)

(deftest ^:parallel field-columns-match-the-field-schema-test
  (testing "the spelled-out column list keeps up with the Field schema it cannot require"
    (is (= (set (mu/map-schema-keys :metabase.warehouse-schema.schema/field))
           warehouse-schema-overlay/field-columns))))
