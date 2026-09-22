(ns metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]
   [metabase.workspaces.core :as workspaces]))

(defn- transform [target-type]
  {:id     1
   :source {:type :query :query {:database (mt/id)}}
   :target {:type target-type :schema "PUBLIC" :name "ws_execute_test"}})

(deftest a-failed-probe-discards-the-remapping-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws", :creator_id (mt/user->id :crowberto)}]
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
        (mt/with-dynamic-fn-redefs [table-index/select-applicable-for-transform (fn [_] (throw (ex-info "probe" {})))]
          (workspaces/with-workspace ws-id
            (is (thrown-with-msg? Exception #"probe" (transforms.execute/execute! (transform :table))))
            (is (empty? (ws.impl/table-remappings ws-id (mt/id))))))))))

(deftest leaving-a-workspace-is-explicit-test
  (testing "a run outside a workspace leaves the remapping alone and writes to its configured target"
    ;; This used to unmap implicitly, back when an instance-wide setting decided whether workspaces were on: with
    ;; the flag off this code could still find the remapping and delete it. A workspace is now the caller's, so a
    ;; run outside every workspace has none to unmap from. Leaving is explicit -- unmap, or delete the workspace.
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws", :creator_id (mt/user->id :crowberto)}]
        (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
          (workspaces/with-workspace ws-id
            (ws.impl/remap-table! ws-id (mt/id) "PUBLIC" "ws_execute_test")
            (is (= 1 (count (ws.impl/table-remappings ws-id (mt/id))))))
          (testing "outside the workspace the target is the configured one, untouched"
            (is (= {:type :table-incremental :schema "PUBLIC" :name "ws_execute_test"}
                   (:target (#'transforms.execute/remap-target (transform :table-incremental)))))
            (is (not (contains? (#'transforms.execute/remap-target (transform :table-incremental))
                                :full-incremental-run?))
                "and no full-run flag: nothing moved, so nothing needs rebuilding"))
          (testing "the remapping survives, because only an explicit unmap removes it"
            (workspaces/with-workspace ws-id
              (is (= 1 (count (ws.impl/table-remappings ws-id (mt/id)))))
              (is (true? (ws.impl/unmap-table! ws-id (mt/id) "PUBLIC" "ws_execute_test")))
              (is (empty? (ws.impl/table-remappings ws-id (mt/id)))))))))))

(deftest deleting-the-target-drops-the-workspace-table-too-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "ws", :creator_id (mt/user->id :crowberto)}]
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
        (workspaces/with-workspace ws-id
          (let [workspace (ws.impl/remap-table! ws-id (mt/id) "PUBLIC" "ws_execute_test")
                dropped   (atom [])]
            (mt/with-dynamic-fn-redefs [transforms-base.u/delete-target-table!
                                        (fn [t] (swap! dropped conj (select-keys (:target t) [:schema :name])))]
              (transforms.execute/delete-target-table! (transform :table)))
            (is (= [workspace {:schema "PUBLIC" :name "ws_execute_test"}] @dropped))
            (is (empty? (ws.impl/table-remappings ws-id (mt/id))))))))))

(deftest remap-table!-outside-a-workspace-throws-test
  (testing "recording a remapping with no workspace bound refuses: there is no workspace to own the row"
    ;; A transform run outside a workspace writes to its configured target, which is the documented behaviour --
    ;; `remap-target` takes the unmap branch and never asks for a remapping. Reaching `remap-table!` without a
    ;; workspace means a caller bypassed that, and materializing into the canonical table is worth refusing.
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"(?i)no workspace"
             (workspaces/remap-table! (mt/id) "PUBLIC" "ws_execute_test")))))))

(deftest a-run-outside-a-workspace-keeps-its-configured-target-test
  (testing "with no workspace bound the transform writes where it is configured to"
    (mt/with-premium-features #{:workspaces}
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
        (is (= {:type :table :schema "PUBLIC" :name "ws_execute_test"}
               (:target (#'transforms.execute/remap-target (transform :table)))))))))
