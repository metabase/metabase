(ns metabase-enterprise.workspaces.impl-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.test :as mt]
   [metabase.workspaces.core :as workspaces]))

(defn- ws-schema-set!
  "Run `thunk` with the test database's workspace schema set to PUBLIC."
  [thunk]
  (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
    (thunk)))

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
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws", :creator_id (mt/user->id :crowberto)}]
      (testing "records a remapping into the database's workspace schema"
        (ws-schema-set!
         (fn []
           (try
             (let [ws-table (ws.impl/remap-table! ws-id (mt/id) nil "orders")]
               (is (= "PUBLIC" (:schema ws-table)))
               (is (string? (:name ws-table)))
               (is (not= "orders" (:name ws-table)) "the workspace table gets a fresh generated name")
               (is (= 1 (count (ws.impl/table-remappings ws-id (mt/id)))))
               (testing "calling it again for the same canonical table reuses the same workspace table"
                 (let [ws-table-2 (ws.impl/remap-table! ws-id (mt/id) nil "orders")]
                   (is (= ws-table ws-table-2))
                   (is (= 1 (count (ws.impl/table-remappings ws-id (mt/id))))
                       "no second row was created"))))
             (finally
               (ws.impl/unmap-table! ws-id (mt/id) nil "orders"))))))
      (testing "throws when the database has no workspaces-schema set"
        (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema nil}}
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"(?i)workspace schema"
               (ws.impl/remap-table! ws-id (mt/id) nil "orders"))))))))

(deftest two-workspaces-remap-the-same-table-test
  (testing "the same canonical table is remapped independently in each workspace"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp [:model/Workspace {ws-1 :id} {:name "ws-1", :creator_id (mt/user->id :crowberto)}
                     :model/Workspace {ws-2 :id} {:name "ws-2", :creator_id (mt/user->id :crowberto)}]
        (ws-schema-set!
         (fn []
           (try
             (let [table-1 (ws.impl/remap-table! ws-1 (mt/id) nil "orders")
                   table-2 (ws.impl/remap-table! ws-2 (mt/id) nil "orders")]
               (testing "each workspace gets its own physical table"
                 (is (not= (:name table-1) (:name table-2))))
               (testing "each workspace sees only its own remapping"
                 (is (= 1 (count (ws.impl/table-remappings ws-1 (mt/id)))))
                 (is (= 1 (count (ws.impl/table-remappings ws-2 (mt/id))))))
               (testing "lookups resolve per workspace, not per database"
                 (is (= table-1 (ws.impl/workspace-table ws-1 (mt/id) nil "orders")))
                 (is (= table-2 (ws.impl/workspace-table ws-2 (mt/id) nil "orders"))))
               (testing "unmapping one leaves the other intact"
                 (is (true? (ws.impl/unmap-table! ws-1 (mt/id) nil "orders")))
                 (is (empty? (ws.impl/table-remappings ws-1 (mt/id))))
                 (is (= 1 (count (ws.impl/table-remappings ws-2 (mt/id)))))
                 (is (= table-2 (ws.impl/workspace-table ws-2 (mt/id) nil "orders")))))
             (finally
               (ws.impl/unmap-table! ws-1 (mt/id) nil "orders")
               (ws.impl/unmap-table! ws-2 (mt/id) nil "orders")))))))))

(deftest remappings-cache-does-not-leak-between-workspaces-test
  (testing "a warm cache entry for one workspace is not served to another"
    ;; The memoized read keys on workspace id as well as db id. Keyed on db id alone, the second
    ;; workspace's read would hit the first's entry and return rows naming a table it does not own --
    ;; plausible-looking data that is wrong, rather than an error.
    (mt/with-premium-features #{:workspaces}
      (mt/with-temporary-setting-values [workspaces-enabled true]
        (mt/with-temp [:model/Workspace {ws-1 :id} {:name "ws-1", :creator_id (mt/user->id :crowberto)}
                       :model/Workspace {ws-2 :id} {:name "ws-2", :creator_id (mt/user->id :crowberto)}]
          (ws-schema-set!
           (fn []
             (try
               (let [table-1 (ws.impl/remap-table! ws-1 (mt/id) nil "orders")]
                 ;; warm ws-1's entry first, so a db-id-only key would already be populated
                 (is (= 1 (count (ws.impl/remappings-for-db ws-1 (mt/id)))))
                 (testing "ws-2 has no remappings even with ws-1's entry warm"
                   (is (nil? (ws.impl/remappings-for-db ws-2 (mt/id)))))
                 (let [table-2 (ws.impl/remap-table! ws-2 (mt/id) nil "orders")]
                   (testing "each workspace reads back its own row"
                     (is (= [(:name table-1)]
                            (mapv :to_table (ws.impl/remappings-for-db ws-1 (mt/id)))))
                     (is (= [(:name table-2)]
                            (mapv :to_table (ws.impl/remappings-for-db ws-2 (mt/id))))))))
               (finally
                 (ws.impl/unmap-table! ws-1 (mt/id) nil "orders")
                 (ws.impl/unmap-table! ws-2 (mt/id) nil "orders"))))))))))

(deftest unmap-table!-test
  (testing "deletes the remapping"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws", :creator_id (mt/user->id :crowberto)}]
        (ws-schema-set!
         (fn []
           (ws.impl/remap-table! ws-id (mt/id) nil "orders")
           (is (= 1 (count (ws.impl/table-remappings ws-id (mt/id)))))
           (is (true? (ws.impl/unmap-table! ws-id (mt/id) nil "orders")))
           (is (empty? (ws.impl/table-remappings ws-id (mt/id))))
           (is (false? (ws.impl/unmap-table! ws-id (mt/id) nil "orders")))))))))

(deftest workspace-table+canonical-table-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws", :creator_id (mt/user->id :crowberto)}]
      (ws-schema-set!
       (fn []
         (try
           (let [{:keys [schema name] :as ws-table} (ws.impl/remap-table! ws-id (mt/id) nil "orders")]
             (testing "workspace-table maps the canonical table to its workspace table"
               (is (= ws-table (ws.impl/workspace-table ws-id (mt/id) nil "orders"))))
             (testing "canonical-table maps the workspace table back to the canonical table"
               (is (= {:schema nil, :name "orders"} (ws.impl/canonical-table ws-id (mt/id) schema name))))
             (testing "both fall through to the input when there is no remapping"
               (is (= {:schema nil, :name "unmapped"} (ws.impl/workspace-table ws-id (mt/id) nil "unmapped")))
               (is (= {:schema "other", :name "unmapped"} (ws.impl/canonical-table ws-id (mt/id) "other" "unmapped")))))
           (finally
             (ws.impl/unmap-table! ws-id (mt/id) nil "orders"))))))))

(deftest remappings-for-db-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws", :creator_id (mt/user->id :crowberto)}]
      (ws-schema-set!
       (fn []
         (try
           (ws.impl/remap-table! ws-id (mt/id) nil "orders")
           (testing "nil while workspaces-enabled is false"
             (mt/with-temporary-setting-values [workspaces-enabled false]
               (is (nil? (ws.impl/remappings-for-db ws-id (mt/id))))))
           (testing "the remapping rows while workspaces-enabled is true"
             (mt/with-temporary-setting-values [workspaces-enabled true]
               (is (= 1 (count (ws.impl/remappings-for-db ws-id (mt/id)))))))
           (finally
             (ws.impl/unmap-table! ws-id (mt/id) nil "orders"))))))))

(deftest current-workspace-binding-test
  (testing "with-workspace sets the workspace the hooks read"
    (is (nil? (workspaces/current-workspace-id)) "unbound by default")
    (workspaces/with-workspace 42
      (is (= 42 (workspaces/current-workspace-id)))
      (testing "nested binding wins"
        (workspaces/with-workspace 7
          (is (= 7 (workspaces/current-workspace-id)))))
      (is (= 42 (workspaces/current-workspace-id)) "restored after the inner binding"))
    (is (nil? (workspaces/current-workspace-id)) "restored after the outer binding"))
  (testing "current-workspace-id-or-throw refuses an absent workspace"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"(?i)no workspace"
         (workspaces/current-workspace-id-or-throw)))
    (workspaces/with-workspace 42
      (is (= 42 (workspaces/current-workspace-id-or-throw))))))
