(ns metabase-enterprise.workspaces.provisioning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- stub-init [schema details]
  (fn [_driver _db _workspace]
    {:schema schema :database_details details}))

(defn- record-call [calls]
  (fn [& args] (swap! calls conj (vec args)) nil))

(defn- throwing [msg]
  (fn [& _] (throw (ex-info msg {}))))

(deftest provision-happy-path-test
  (testing "provision-workspace-database! writes credentials and marks the row :initialized"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id}
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {}
                    :output_schema    ""
                    :input_schemas    ["sales" "finance"]}]
      (let [grant-calls   (atom [])
            destroy-calls (atom [])]
        (with-redefs [driver/init-workspace-isolation!   (stub-init "mb_isolation_xyz" {:user "wsd_user" :password "pw"})
                      driver/grant-workspace-read-access! (record-call grant-calls)
                      driver/destroy-workspace-isolation! (record-call destroy-calls)]
          (let [returned (provisioning/provision-workspace-database! wsd-id)
                row     (t2/select-one :model/WorkspaceDatabase :id wsd-id)]
            (testing "row is updated in place"
              (is (= :initialized (:status row)))
              (is (= "mb_isolation_xyz" (:output_schema row)))
              (is (= {:user "wsd_user" :password "pw"} (:database_details row))))
            (testing "return value matches the updated row"
              (is (= (:id row) (:id returned)))
              (is (= :initialized (:status returned)))
              (is (= "mb_isolation_xyz" (:output_schema returned))))
            (testing "grant was called once with maps containing :schema for each input schema"
              (is (= 1 (count @grant-calls)))
              (let [[_driver _db _ws tables] (first @grant-calls)]
                (is (= #{{:schema "sales"} {:schema "finance"}} (set tables)))))
            (testing "destroy was not called"
              (is (empty? @destroy-calls)))))))))

(deftest provision-rolls-back-when-grant-fails-test
  (testing "If grant fails, destroy-workspace-isolation! is invoked and the row stays uninitialized"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id}
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {}
                    :output_schema    ""
                    :input_schemas    ["public"]}]
      (let [destroy-calls (atom [])]
        (with-redefs [driver/init-workspace-isolation!    (stub-init "mb_isolation_doomed" {:user "u" :password "p"})
                      driver/grant-workspace-read-access! (throwing "grant exploded")
                      driver/destroy-workspace-isolation! (record-call destroy-calls)]
          (is (thrown-with-msg? Exception #"grant exploded"
                                (provisioning/provision-workspace-database! wsd-id)))
          (testing "destroy ran as compensation with the details returned by init"
            (is (= 1 (count @destroy-calls)))
            (let [[_driver _db ws] (first @destroy-calls)]
              (is (= "mb_isolation_doomed" (:schema ws)))
              (is (= {:user "u" :password "p"} (:database_details ws)))))
          (testing "row remains uninitialized with no stored credentials"
            (let [row (t2/select-one :model/WorkspaceDatabase :id wsd-id)]
              (is (= :uninitialized (:status row)))
              (is (= "" (:output_schema row)))
              (is (= {} (:database_details row))))))))))

(deftest provision-refuses-if-already-initialized-test
  (testing "Calling provision on an already-initialized row throws and doesn't invoke driver fns"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id}
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {:user "prev"}
                    :output_schema    "already"
                    :input_schemas    ["public"]
                    :status           :initialized}]
      (let [init-calls (atom [])]
        (with-redefs [driver/init-workspace-isolation!    (record-call init-calls)
                      driver/grant-workspace-read-access! (record-call init-calls)
                      driver/destroy-workspace-isolation! (record-call init-calls)]
          (is (thrown? Exception (provisioning/provision-workspace-database! wsd-id)))
          (is (empty? @init-calls)))))))

(deftest initialize-workspace-databases-runs-every-uninitialized-row-test
  (testing "initialize-workspace-databases! provisions every :uninitialized row and skips :initialized ones"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {uninit-id :id}
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["a"]
                    :status :uninitialized}
                   :model/WorkspaceDatabase {already-id :id}
                   {:workspace_id ws-id :database_id db2-id
                    :database_details {:user "x"} :output_schema "done" :input_schemas ["b"]
                    :status :initialized}]
      (let [calls (atom [])]
        (with-redefs [provisioning/provision-workspace-database!
                      (fn [id] (swap! calls conj id) nil)]
          (provisioning/initialize-workspace-databases! ws-id)
          (is (= [uninit-id] @calls))
          (is (not (some #{already-id} @calls))))))))

(deftest initialize-workspace-databases-isolates-failures-test
  (testing "A failing provision doesn't stop subsequent rows from being processed"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-a :id}
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["a"]
                    :status :uninitialized}
                   :model/WorkspaceDatabase {wsd-b :id}
                   {:workspace_id ws-id :database_id db2-id
                    :database_details {} :output_schema "" :input_schemas ["b"]
                    :status :uninitialized}]
      (let [attempted (atom [])]
        (with-redefs [provisioning/provision-workspace-database!
                      (fn [id]
                        (swap! attempted conj id)
                        (when (= id wsd-a) (throw (ex-info "boom" {:id id})))
                        nil)]
          (provisioning/initialize-workspace-databases! ws-id)
          (is (= #{wsd-a wsd-b} (set @attempted))))))))
