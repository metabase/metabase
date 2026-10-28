(ns metabase.metabot.metadata-perms-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.test :as mt]))

(deftest row-restricted-table-ids-fails-closed-on-unresolvable-table-test
  (testing "a table ID that can't be resolved to a Table row is treated as row-restricted"
    (mt/with-test-user :rasta
      (is (= #{Integer/MAX_VALUE} (metabot.perms/row-restricted-table-ids #{Integer/MAX_VALUE}))))))
