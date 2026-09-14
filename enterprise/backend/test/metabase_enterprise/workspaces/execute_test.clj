(ns metabase-enterprise.workspaces.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.impl :as ws.impl]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.execute :as transforms.execute]))

(defn- transform [target-type]
  {:id     1
   :source {:type :query :query {:database (mt/id)}}
   :target {:type target-type :schema "PUBLIC" :name "ws_execute_test"}})

(deftest a-failed-probe-discards-the-remapping-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temporary-setting-values [workspaces-enabled true]
      (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
        (mt/with-dynamic-fn-redefs [table-index/select-applicable-for-transform (fn [_] (throw (ex-info "probe" {})))]
          (is (thrown-with-msg? Exception #"probe" (transforms.execute/execute! (transform :table))))
          (is (empty? (ws.impl/table-remappings (mt/id)))))))))

(deftest leaving-the-workspace-forces-a-full-incremental-run-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
      (mt/with-temporary-setting-values [workspaces-enabled false]
        (ws.impl/remap-table! (mt/id) "PUBLIC" "ws_execute_test")
        (is (true? (:full-incremental-run? (#'transforms.execute/remap-target (transform :table-incremental)))))
        (is (empty? (ws.impl/table-remappings (mt/id))))
        (is (not (contains? (#'transforms.execute/remap-target (transform :table-incremental))
                            :full-incremental-run?)))))))

(deftest deleting-the-target-drops-the-workspace-table-too-test
  (mt/with-premium-features #{:workspaces}
    (mt/with-temp-vals-in-db :model/Database (mt/id) {:settings {:workspaces-schema "PUBLIC"}}
      (let [workspace (ws.impl/remap-table! (mt/id) "PUBLIC" "ws_execute_test")
            dropped   (atom [])]
        (mt/with-dynamic-fn-redefs [transforms-base.u/delete-target-table!
                                    (fn [t] (swap! dropped conj (select-keys (:target t) [:schema :name])))]
          (transforms.execute/delete-target-table! (transform :table)))
        (is (= [workspace {:schema "PUBLIC" :name "ws_execute_test"}] @dropped))
        (is (empty? (ws.impl/table-remappings (mt/id))))))))
