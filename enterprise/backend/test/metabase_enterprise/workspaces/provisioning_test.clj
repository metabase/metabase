(ns metabase-enterprise.workspaces.provisioning-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.workspaces.models.workspace]
   [metabase-enterprise.workspaces.provisioning :as provisioning]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(comment metabase-enterprise.workspaces.models.workspace/keep-me)

(defn- stub-init [schema details]
  (fn [_driver _db _workspace]
    {:schema schema :database_details details}))

(defn- record-call [calls]
  (fn [& args] (swap! calls conj (vec args)) nil))

(defn- throwing [msg]
  (fn [& _] (throw (ex-info msg {}))))

(deftest provision-happy-path-test
  (testing "provision-workspace-database! writes credentials and marks the row :provisioned"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id}
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {}
                    :output_schema    ""
                    :input_schemas    ["sales" "finance"]
                    :status           :provisioning}]
      (let [grant-calls   (atom [])
            destroy-calls (atom [])]
        (with-redefs [driver/init-workspace-isolation!   (stub-init "mb_isolation_xyz" {:user "wsd_user" :password "pw"})
                      driver/grant-workspace-read-access! (record-call grant-calls)
                      driver/destroy-workspace-isolation! (record-call destroy-calls)]
          (let [returned (provisioning/provision-workspace-database! wsd-id)
                row     (t2/select-one :model/WorkspaceDatabase :id wsd-id)]
            (testing "row is updated in place"
              (is (= :provisioned (:status row)))
              (is (= "mb_isolation_xyz" (:output_schema row)))
              (is (= {:user "wsd_user" :password "pw"} (:database_details row))))
            (testing "return value matches the updated row"
              (is (= (:id row) (:id returned)))
              (is (= :provisioned (:status returned)))
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
                    :input_schemas    ["public"]
                    :status           :provisioning}]
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
              (is (= :unprovisioned (:status row)))
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
                    :status           :provisioned}]
      (let [init-calls (atom [])]
        (with-redefs [driver/init-workspace-isolation!    (record-call init-calls)
                      driver/grant-workspace-read-access! (record-call init-calls)
                      driver/destroy-workspace-isolation! (record-call init-calls)]
          (is (thrown? Exception (provisioning/provision-workspace-database! wsd-id)))
          (is (empty? @init-calls)))))))

(deftest provision-workspace-databases-runs-every-provisioning-row-test
  (testing "provision-workspace-databases! provisions every :provisioning row and skips :provisioned ones"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {pending-id :id}
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["a"]
                    :status :provisioning}
                   :model/WorkspaceDatabase {already-id :id}
                   {:workspace_id ws-id :database_id db2-id
                    :database_details {:user "x"} :output_schema "done" :input_schemas ["b"]
                    :status :provisioned}]
      (let [calls (atom [])]
        (with-redefs [provisioning/provision-workspace-database!
                      (fn [id] (swap! calls conj id) nil)]
          (provisioning/provision-workspace-databases! ws-id)
          (is (= [pending-id] @calls))
          (is (not (some #{already-id} @calls))))))))

(deftest provision-workspace-databases-isolates-failures-test
  (testing "A failing provision doesn't stop subsequent rows from being processed"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-a :id}
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["a"]
                    :status :provisioning}
                   :model/WorkspaceDatabase {wsd-b :id}
                   {:workspace_id ws-id :database_id db2-id
                    :database_details {} :output_schema "" :input_schemas ["b"]
                    :status :provisioning}]
      (let [attempted (atom [])]
        (with-redefs [provisioning/provision-workspace-database!
                      (fn [id]
                        (swap! attempted conj id)
                        (when (= id wsd-a) (throw (ex-info "boom" {:id id})))
                        nil)]
          (provisioning/provision-workspace-databases! ws-id)
          (is (= #{wsd-a wsd-b} (set @attempted))))))))

(deftest unprovision-happy-path-test
  (testing "unprovision-workspace-database! calls destroy-workspace-isolation! and resets the row"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id}
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {:user "wsd_u" :password "wsd_p"}
                    :output_schema    "mb_isolation_xyz"
                    :input_schemas    ["public"]
                    :status           :unprovisioning}]
      (let [destroy-calls (atom [])]
        (with-redefs [driver/destroy-workspace-isolation! (record-call destroy-calls)]
          (let [returned (provisioning/unprovision-workspace-database! wsd-id)
                row     (t2/select-one :model/WorkspaceDatabase :id wsd-id)]
            (testing "destroy was invoked once with the reconstructed workspace-with-details"
              (is (= 1 (count @destroy-calls)))
              (let [[_driver _db ws] (first @destroy-calls)]
                (is (= "mb_isolation_xyz" (:schema ws)))
                (is (= {:user "wsd_u" :password "wsd_p"} (:database_details ws)))))
            (testing "row was reset to :unprovisioned with empty credentials + schema"
              (is (= :unprovisioned (:status row)))
              (is (= "" (:output_schema row)))
              (is (= {} (:database_details row))))
            (testing "returned row mirrors the updated state"
              (is (= :unprovisioned (:status returned)))
              (is (= "" (:output_schema returned)))
              (is (= {} (:database_details returned))))))))))

(deftest unprovision-refuses-if-uninitialized-test
  (testing "unprovision-workspace-database! throws on a row that is not :provisioned, and doesn't invoke the driver"
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-id :id}
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {} :output_schema "" :input_schemas ["public"]
                    :status :unprovisioned}]
      (let [destroy-calls (atom [])]
        (with-redefs [driver/destroy-workspace-isolation! (record-call destroy-calls)]
          (is (thrown? Exception (provisioning/unprovision-workspace-database! wsd-id)))
          (is (empty? @destroy-calls)))))))

(deftest unprovision-workspace-databases-runs-every-unprovisioning-row-test
  (testing "unprovision-workspace-databases! calls the per-row fn only for :unprovisioning rows"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {pending-id :id}
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {:user "x"} :output_schema "done" :input_schemas ["a"]
                    :status :unprovisioning}
                   :model/WorkspaceDatabase {uninit-id :id}
                   {:workspace_id ws-id :database_id db2-id
                    :database_details {} :output_schema "" :input_schemas ["b"]
                    :status :unprovisioned}]
      (let [calls (atom [])]
        (with-redefs [provisioning/unprovision-workspace-database!
                      (fn [id] (swap! calls conj id) nil)]
          (provisioning/unprovision-workspace-databases! ws-id)
          (is (= [pending-id] @calls))
          (is (not (some #{uninit-id} @calls))))))))

(deftest unprovision-workspace-databases-isolates-failures-test
  (testing "A failing unprovision does not block subsequent rows"
    (mt/with-temp [:model/Database {db2-id :id} {:engine :h2 :details {}}
                   :model/Workspace {ws-id :id} {:name "WS"}
                   :model/WorkspaceDatabase {wsd-a :id}
                   {:workspace_id ws-id :database_id (mt/id)
                    :database_details {:user "a"} :output_schema "sa" :input_schemas ["a"]
                    :status :unprovisioning}
                   :model/WorkspaceDatabase {wsd-b :id}
                   {:workspace_id ws-id :database_id db2-id
                    :database_details {:user "b"} :output_schema "sb" :input_schemas ["b"]
                    :status :unprovisioning}]
      (let [attempted (atom [])]
        (with-redefs [provisioning/unprovision-workspace-database!
                      (fn [id]
                        (swap! attempted conj id)
                        (when (= id wsd-a) (throw (ex-info "boom" {:id id})))
                        nil)]
          (provisioning/unprovision-workspace-databases! ws-id)
          (is (= #{wsd-a wsd-b} (set @attempted))))))))

(deftest provision-serializes-concurrent-callers-test
  (testing "two callers racing to provision the same row serialize — the second sees :provisioned and refuses"
    ;; Without serialization, both callers read `:status :unprovisioned`, both enter the
    ;; warehouse-side work, and the app-db ends up with whichever `t2/update!` commits
    ;; last — while the warehouse has whatever state the last caller's ops left behind.
    ;; On Postgres specifically, the winner's password is silently overwritten by the
    ;; loser's ALTER USER (TOCTOU on `user-exists?`), and if the winner's
    ;; `grant-workspace-read-access!` fails and it calls `destroy-workspace-isolation!`,
    ;; the loser's in-flight schema/user disappears out from under it. We close all of
    ;; those by making provisioning hold a cluster-lock keyed on the workspace-database id.
    (mt/with-temp [:model/Workspace {ws-id :id} {:name "concurrency-ws"}
                   :model/WorkspaceDatabase {wsd-id :id}
                   {:workspace_id     ws-id
                    :database_id      (mt/id)
                    :database_details {}
                    :output_schema    ""
                    :input_schemas    ["public"]
                    :status           :provisioning}]
      (let [first-call-in-flight (CountDownLatch. 1)
            first-call-release   (CountDownLatch. 1)
            init-count           (atom 0)]
        (with-redefs [driver/init-workspace-isolation!
                      (fn [_driver _db _workspace]
                        (let [n (swap! init-count inc)]
                          (when (= n 1)
                            ;; First caller: signal that we've entered the critical section
                            ;; and wait for the test to release us. This lets the second
                            ;; caller attempt to acquire the lock while we still hold it.
                            (.countDown first-call-in-flight)
                            (.await first-call-release))
                          {:schema (str "ws_race_" n)
                           :database_details {:user (str "u" n) :password (str "p" n)}}))
                      driver/grant-workspace-read-access! (fn [& _] nil)
                      driver/destroy-workspace-isolation! (fn [& _] nil)]
          (let [t1 (future (try (provisioning/provision-workspace-database! wsd-id)
                                (catch Throwable t t)))
                ;; Wait until t1 has entered init-workspace-isolation! (past the lock, past the status check).
                _  (is (.await first-call-in-flight 5 TimeUnit/SECONDS)
                       "t1 should have entered init within 5s; if it didn't, something deadlocked earlier")
                ;; Launch the second caller — it must block trying to acquire the same lock.
                t2 (future (try (provisioning/provision-workspace-database! wsd-id)
                                (catch Throwable t t)))
                ;; Give t2 a moment to hit the lock-acquire path. 200ms is a
                ;; compromise: long enough that t2 has definitely tried to acquire,
                ;; short enough that the test doesn't drag.
                _  (Thread/sleep 200)
                ;; t1 should still be blocked in init, and init should have run once.
                _  (is (= 1 @init-count)
                       "before releasing t1, init must have been called exactly once — t2 should be blocked on the lock")
                ;; Release t1. It'll finish, commit, release the lock, and t2 will proceed.
                _  (.countDown first-call-release)
                r1 (deref t1 10000 ::timeout)
                r2 (deref t2 10000 ::timeout)]
            (is (not= ::timeout r1) "t1 must complete within 10s of being released")
            (is (not= ::timeout r2) "t2 must complete within 10s of t1 releasing the lock")
            (let [successes (filter map? [r1 r2])
                  failures  (filter #(instance? Throwable %) [r1 r2])]
              (is (= 1 (count successes))
                  "exactly one caller must succeed")
              (is (= 1 (count failures))
                  "exactly one caller must fail")
              (when-let [s (first successes)]
                (is (= :provisioned (:status s))
                    "the winner's returned row must reflect the :provisioned state"))
              (when-let [f (first failures)]
                (is (re-find #"must be :provisioning" (str (ex-message f)))
                    "the loser's error must cite the state precondition — not a lock timeout or unrelated failure")))
            (is (= 1 @init-count)
                "init-workspace-isolation! ran exactly once — the loser's status check (re-done under the lock) caught the state change and aborted before touching the warehouse")))))))
