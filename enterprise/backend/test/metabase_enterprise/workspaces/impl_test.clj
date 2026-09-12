(ns metabase-enterprise.workspaces.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]))

(deftest enabled?-test
  (testing "workspaces-enabled is gated on the :workspaces token feature"
    (mt/with-temporary-setting-values [workspaces-enabled true]
      (testing "off without the token feature, even though the setting is on"
        (mt/with-premium-features #{}
          (is (false? (workspaces/enabled?)))))
      (testing "on with both the setting and the token feature"
        (mt/with-premium-features #{:workspaces}
          (is (true? (workspaces/enabled?))))))))

(deftest remap-table!-test
  (mt/with-premium-features #{:workspaces}
    (testing "records a remapping into the database's workspace schema"
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
        (try
          (let [ws-table (ws.impl/remap-table! (mt/id) nil "orders")]
            (is (= "PUBLIC" (:schema ws-table)))
            (is (string? (:name ws-table)))
            (is (not= "orders" (:name ws-table)) "the workspace table gets a fresh generated name")
            (is (= 1 (count (ws.impl/table-remappings (mt/id)))))
            (testing "calling it again for the same canonical table reuses the same workspace table"
              (let [ws-table-2 (ws.impl/remap-table! (mt/id) nil "orders")]
                (is (= ws-table ws-table-2))
                (is (= 1 (count (ws.impl/table-remappings (mt/id))))
                    "no second row was created"))))
          (finally
            (ws.impl/unmap-table! (mt/id) nil "orders")))))
    (testing "throws when the database has no workspaces-schema set"
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema nil}}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"(?i)workspace schema"
             (ws.impl/remap-table! (mt/id) nil "orders")))))))

(deftest unmap-table!-test
  (testing "deletes the remapping"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
        (ws.impl/remap-table! (mt/id) nil "orders")
        (is (= 1 (count (ws.impl/table-remappings (mt/id)))))
        (ws.impl/unmap-table! (mt/id) nil "orders")
        (is (empty? (ws.impl/table-remappings (mt/id))))))))

(deftest workspace-table+canonical-table-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
      (try
        (let [{:keys [schema name] :as ws-table} (ws.impl/remap-table! (mt/id) nil "orders")]
          (testing "workspace-table maps the canonical table to its workspace table"
            (is (= ws-table (ws.impl/workspace-table (mt/id) nil "orders"))))
          (testing "canonical-table maps the workspace table back to the canonical table"
            (is (= {:schema nil, :name "orders"} (ws.impl/canonical-table (mt/id) schema name))))
          (testing "both fall through to the input when there is no remapping"
            (is (= {:schema nil, :name "unmapped"} (ws.impl/workspace-table (mt/id) nil "unmapped")))
            (is (= {:schema "other", :name "unmapped"} (ws.impl/canonical-table (mt/id) "other" "unmapped")))))
        (finally
          (ws.impl/unmap-table! (mt/id) nil "orders"))))))

(deftest remappings-for-db-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
      (try
        (ws.impl/remap-table! (mt/id) nil "orders")
        (testing "nil while workspaces-enabled is false"
          (mt/with-temporary-setting-values [workspaces-enabled false]
            (is (nil? (ws.impl/remappings-for-db (mt/id))))))
        (testing "the remapping rows while workspaces-enabled is true"
          (mt/with-temporary-setting-values [workspaces-enabled true]
            (is (= 1 (count (ws.impl/remappings-for-db (mt/id)))))))
        (finally
          (ws.impl/unmap-table! (mt/id) nil "orders"))))))
