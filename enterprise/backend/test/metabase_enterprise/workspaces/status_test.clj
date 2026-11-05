(ns metabase-enterprise.workspaces.status-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase-enterprise.workspaces.status :as ws.status]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(deftest database-status-test
  (let [now (OffsetDateTime/now)
        ago (fn [minutes] (.minusMinutes now minutes))]
    (testing "an in-flight status reads as failed once it is older than 10 minutes"
      (doseq [status [:provisioning :deprovisioning]]
        (is (= status (ws.status/database-status status (ago 9) now)))
        (is (= :failed (ws.status/database-status status (ago 11) now)))))
    (testing "a settled status never goes stale"
      (doseq [status [:provisioned :failed]]
        (is (= status (ws.status/database-status status (ago 600) now)))))))

(defn- do-with-workspace-database!
  "Calls `(f wsd-id)` with a new `workspace_database` row in `status`."
  [status f]
  (mt/with-temp [:model/Workspace         {ws-id :id}  {:name "status test"}
                 :model/WorkspaceDatabase {wsd-id :id} {:workspace_id     ws-id
                                                        :database_id      (mt/id)
                                                        :isolation_id     "statuste"
                                                        :database_details {:user "u", :password "p"}
                                                        :status           status}]
    (f wsd-id)))

(defn- status-of [wsd-id]
  (t2/select-one-fn :status :model/WorkspaceDatabase :id wsd-id))

(defn- age-minutes!
  "Move the `updated_at` of the row back by `minutes`, through the table rather than the model, whose before-update
  hook would reset it."
  [wsd-id minutes]
  (let [updated-at (t2/select-one-fn :updated_at :model/WorkspaceDatabase :id wsd-id)]
    (t2/query-one {:update :workspace_database
                   :set    {:updated_at (.minusMinutes ^OffsetDateTime updated-at minutes)}
                   :where  [:= :id wsd-id]})))

(deftest transition-database-status-test
  (testing "a transition from the expected status changes it"
    (do-with-workspace-database! :provisioning
      (fn [wsd-id]
        (ws.status/transition-database-status! wsd-id #{:provisioning} :provisioned)
        (is (= :provisioned (status-of wsd-id))))))
  (testing "a transition from another status is a 409 naming the status, and changes nothing"
    (do-with-workspace-database! :deprovisioning
      (fn [wsd-id]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"is deprovisioning, not provisioned"
                              (ws.status/transition-database-status! wsd-id #{:provisioned} :deprovisioning)))
        (is (= {:status-code 409, :status :deprovisioning}
               (try (ws.status/transition-database-status! wsd-id #{:provisioned} :deprovisioning)
                    (catch clojure.lang.ExceptionInfo e (select-keys (ex-data e) [:status-code :status])))))
        (is (= :deprovisioning (status-of wsd-id))))))
  (testing "an unknown row is a 404"
    (is (= 404 (try (ws.status/transition-database-status! Integer/MAX_VALUE #{:failed} :deprovisioning)
                    (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))))

(deftest stale-in-flight-reads-as-failed-test
  (do-with-workspace-database! :provisioning
    (fn [wsd-id]
      (testing "a fresh in-flight row is not failed, so a retry from failed is a 409"
        (is (= 409 (try (ws.status/transition-database-status! wsd-id #{:failed} :deprovisioning)
                        (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e)))))))
      (age-minutes! wsd-id 11)
      (testing "11 minutes later it reads as failed"
        (let [{:keys [status updated_at]} (ws.db/workspace-database-without-details wsd-id)]
          (is (= :failed (ws.status/database-status status updated_at (OffsetDateTime/now))))))
      (testing "and a transition from failed takes it over"
        (ws.status/transition-database-status! wsd-id #{:failed} :deprovisioning)
        (is (= :deprovisioning (status-of wsd-id))))
      (testing "but not a transition from its stored in-flight status alone when that is not expected"
        (age-minutes! wsd-id 11)
        (is (= 409 (try (ws.status/transition-database-status! wsd-id #{:provisioned} :deprovisioning)
                        (catch clojure.lang.ExceptionInfo e (:status-code (ex-data e))))))))))

(deftest concurrent-transitions-test
  (testing "of concurrent transitions from the same status exactly one succeeds; the rest get a 409"
    (do-with-workspace-database! :provisioned
      (fn [wsd-id]
        (let [start   (promise)
              results (doall (for [_ (range 8)]
                               (future
                                 @start
                                 (try
                                   (ws.status/transition-database-status! wsd-id #{:provisioned} :deprovisioning)
                                   :ok
                                   (catch clojure.lang.ExceptionInfo e
                                     (:status-code (ex-data e)))))))]
          (deliver start true)
          (is (= {:ok 1, 409 7} (frequencies (map deref results))))
          (is (= :deprovisioning (status-of wsd-id))))))))
