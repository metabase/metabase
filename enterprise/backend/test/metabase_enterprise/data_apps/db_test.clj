(ns metabase-enterprise.data-apps.db-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest warning-queries-with-empty-ids-test
  (mt/with-temp [:model/PermissionsGroup group {}]
    (doseq [[group-ids database-ids table-ids] [[[] [1] [1]] [[(:id group)] [] [1]] [[(:id group)] [1] []]]]
      (testing (str "empty warning IDs " [group-ids database-ids table-ids])
        (t2/with-call-count [calls]
          (is (= [] (data-apps.db/permissions-for-warnings group-ids database-ids table-ids)))
          (is (zero? (calls))))))))
