(ns metabase.lib.schema-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [malli.core :as mc]
   [malli.error :as me]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.util-test :as lib.schema.util-test]))

(deftest ^:parallel disallow-duplicate-uuids-test
  (testing "sanity check: make sure query is valid with different UUIDs"
    (is (not (mc/explain ::lib.schema/query lib.schema.util-test/query-with-no-duplicate-uuids))))
  (testing "should not validate if UUIDs are duplicated"
    (is (mc/explain ::lib.schema/query lib.schema.util-test/query-with-duplicate-uuids))
    (is (= ["Duplicate :lib/uuid \"00000000-0000-0000-0000-000000000001\""]
           (me/humanize (mc/explain ::lib.schema/query lib.schema.util-test/query-with-duplicate-uuids))))))
