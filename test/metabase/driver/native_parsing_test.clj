(ns ^:mb/driver-tests metabase.driver.native-parsing-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.test :as mt]))

(deftest ^:parallel can-get-deps-from-table-tags
  (mt/test-drivers (mt/normal-drivers-with-feature :parameters/table-reference)
    (testing "native-query-deps looks in table tags for dependencies"
      (let [mp (mt/metadata-provider)
            sql (mt/native-query-with-card-template-tag driver/*driver* "table")
            base-query (lib/native-query mp sql)
            template-tag (get (lib/template-tags base-query) "table")
            query (lib/with-template-tags base-query
                    {"table" (merge template-tag
                                    {:type :table
                                     :table-id (mt/id :orders)})})]
        ;; by not preprocessing the query, the query itself is unparseable and we need to rely on the table tag
        (is (= #{{:table (mt/id :orders)}}
               (driver/native-query-deps driver/*driver* query)))))))
