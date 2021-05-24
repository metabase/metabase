(ns metabase-enterprise.sandbox.models.permissions.delete-sandboxes-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.sandbox.models.permissions.delete-sandboxes :as ee.delete-sandboxes]
            [metabase.models :refer [Table]]
            [metabase.test :as mt]))

(deftest sandbox-delete-condition-test
  (mt/with-temp Table [table {:db_id  (mt/id)
                              :name   "Another Table"
                              :schema "FAKE_SCHEMA"}]
    (testing "full DB perms"
      ;; GRANT full DB perms = delete all sandboxes for Tables in that DB.
      ;; REVOKE all DBs perms = delete all sandboxes for Tables in that DB.
      (doseq [action [:grant :revoke]]
        (testing action
          (is (= [:= :table.db_id (mt/id)]
                 (#'ee.delete-sandboxes/sandbox-delete-condition (format "/db/%d/" (mt/id)) action))))))
    (testing "full schema perms"
      ;; GRANT full schema perms = delete all sandboxes for Tables with that schema.
      ;; REVOKE all schema perms = delete all sandboxes for Tables with that schema.
      (doseq [action [:grant :revoke]]
        (testing action
          (is (= [:and
                  [:= :table.db_id (mt/id)]
                  [:= :table.schema "PUBLIC"]]
                 (#'ee.delete-sandboxes/sandbox-delete-condition (format "/db/%d/schema/PUBLIC/" (mt/id)) action))))))
    (testing "full table perms"
      ;; GRANT full table perms = delete all sandboxes for that Table.
      ;; REVOKE all table perms = delete all sandboxes for that Table.
      (doseq [action [:grant :revoke]]
        (testing action
          (is (= [:= :table.id (mt/id :venues)]
                 (#'ee.delete-sandboxes/sandbox-delete-condition
                  (format "/db/%d/schema/PUBLIC/table/%d/" (mt/id) (mt/id :venues))
                  action))))))
    (testing "table read perms"
      ;; changing READ perms shouldn't affect anything.
      (doseq [action [:grant :revoke]]
        (testing action
          (is (= nil
                 (#'ee.delete-sandboxes/sandbox-delete-condition
                  (format "/db/%d/schema/PUBLIC/table/%d/read/" (mt/id) (mt/id :venues))
                  action))))))
    (testing "table query perms"
      ;; GRANT query perms => remove sandbox for that Table
      (testing :grant
        (is (= [:= :table.id (mt/id :venues)]
               (#'ee.delete-sandboxes/sandbox-delete-condition
                (format "/db/%d/schema/PUBLIC/table/%d/query/" (mt/id) (mt/id :venues))
                :grant))))
      ;; REVOKE query perms => shouldn't affect anything
      (testing :revoke
        (is (= nil
               (#'ee.delete-sandboxes/sandbox-delete-condition
                (format "/db/%d/schema/PUBLIC/table/%d/query/" (mt/id) (mt/id :venues))
                :revoke)))))
    (testing "table segmented query perms"
      ;; GRANT segmented perms = don't touch GTAPs.
      (testing :grant
        (is (= nil
               (#'ee.delete-sandboxes/sandbox-delete-condition
                (format "/db/%d/schema/PUBLIC/table/%d/query/segmented/" (mt/id) (mt/id :venues))
                :grant))))
      ;; REVOKE segmented perms = delete associated GTAPs.
      (testing :revoke
        (is (= [:= :table.id (mt/id :venues)]
               (#'ee.delete-sandboxes/sandbox-delete-condition
                (format "/db/%d/schema/PUBLIC/table/%d/query/segmented/" (mt/id) (mt/id :venues))
                :revoke)))))))
