(ns metabase-enterprise.workspaces.settings-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.settings :as ws.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest has-remappings-enabled-false-when-no-rows-test
  (testing "has-remappings-enabled is false when no TableRemapping rows exist"
    (mt/with-empty-h2-app-db!
      (is (false? (ws.settings/has-remappings-enabled))))))

(deftest has-remappings-enabled-true-when-row-exists-test
  (testing "has-remappings-enabled is true when at least one TableRemapping row exists"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database         {db-id :id} {}
                     :model/TableRemapping   _ {:database_id     db-id
                                                :from_schema     "public"
                                                :from_table_name "orders"
                                                :to_schema       "ws_alice"
                                                :to_table_name   "public__orders"}]
        (is (true? (ws.settings/has-remappings-enabled)))))))

(deftest has-remappings-enabled-flips-to-false-after-delete-test
  (testing "has-remappings-enabled flips back to false when the last row is deleted"
    (mt/with-empty-h2-app-db!
      (mt/with-temp [:model/Database {db-id :id} {}]
        (let [{remap-id :id} (t2/insert-returning-instance!
                              :model/TableRemapping
                              {:database_id     db-id
                               :from_schema     "public"
                               :from_table_name "orders"
                               :to_schema       "ws_alice"
                               :to_table_name   "public__orders"})]
          (is (true? (ws.settings/has-remappings-enabled)))
          (t2/delete! :model/TableRemapping :id remap-id)
          (is (false? (ws.settings/has-remappings-enabled))))))))

(deftest has-remappings-enabled-true-via-workspace-config-test
  (testing "has-remappings-enabled is true when workspace-config-present? is set, even with no remappings"
    (mt/with-empty-h2-app-db!
      ;; No TableRemapping rows exist; the canonical signal alone should flip the setting on.
      (let [original @ws.settings/workspace-config-present?]
        (try
          (reset! ws.settings/workspace-config-present? true)
          (is (true? (ws.settings/has-remappings-enabled))
              "config-file signal alone is sufficient — true even with zero TableRemapping rows")
          (finally
            (reset! ws.settings/workspace-config-present? original)))))))
