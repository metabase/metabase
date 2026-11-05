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

(defn- do-with-workspace-database!
  "Calls `(f wsd-id token)` with a new `workspace_database` row in `status`, whose lock `token` holds."
  [status f]
  (let [token (ws.status/new-lock-token)]
    (mt/with-temp [:model/WorkspaceProvisioningConnection _ {:database_id (mt/id), :details {}}
                   :model/Workspace                       {ws-id :id}  {:name "status test"}
                   :model/WorkspaceDatabase               {wsd-id :id} {:workspace_id     ws-id
                                                                        :database_id      (mt/id)
                                                                        :isolation_id     "statuste"
                                                                        :database_details {:user "u", :password "p"}
                                                                        :status           status
                                                                        :lock_token       token}]
      (f wsd-id token))))

(defn- age-minutes!
  "Move the `updated_at` of the row of `table` back by `minutes`, through the table rather than the model, whose
  before-update hook would reset it."
  [table id minutes]
  (let [updated-at (t2/select-one-fn :updated_at table :id id)]
    (t2/query-one {:update table
                   :set    {:updated_at (.minusMinutes ^OffsetDateTime updated-at minutes)}
                   :where  [:= :id id]})))

(defn- reads-as [kind id]
  (let [row (if (= kind :database)
              (ws.db/workspace-database-without-details id (ws.status/staleness :database))
              (ws.db/workspace-schema id (ws.status/staleness :schema)))]
    (ws.status/effective-status (:status row) (:stale row))))

(defn- attempt
  "`:ok` when `f` returns a lock token, else the status code and status of the error it throws."
  [f]
  (try
    (when (string? (f)) :ok)
    (catch clojure.lang.ExceptionInfo e
      (select-keys (ex-data e) [:status-code :status]))))

(deftest stale-in-flight-reads-as-failed-test
  (do-with-workspace-database! :provisioning
    (fn [wsd-id _token]
      (testing "an in-flight row reads as itself until it is 10 minutes old, by the app DB's clock"
        (age-minutes! :workspace_database wsd-id 9)
        (is (= :provisioning (reads-as :database wsd-id)))
        (age-minutes! :workspace_database wsd-id 2)
        (is (= :failed (reads-as :database wsd-id))))))
  (testing "a settled row never goes stale"
    (do-with-workspace-database! :provisioned
      (fn [wsd-id _token]
        (age-minutes! :workspace_database wsd-id 600)
        (is (= :provisioned (reads-as :database wsd-id)))))))

(deftest take-lock-test
  (testing "taking the lock from the expected status changes it and returns a token"
    (do-with-workspace-database! :provisioned
      (fn [wsd-id _token]
        (is (= :ok (attempt #(ws.status/take-lock! :database wsd-id #{:provisioned} :deprovisioning))))
        (is (= :deprovisioning (reads-as :database wsd-id))))))
  (testing "from another status: a 409 naming the status, and no change"
    (do-with-workspace-database! :deprovisioning
      (fn [wsd-id _token]
        (is (= {:status-code 409, :status :deprovisioning}
               (attempt #(ws.status/take-lock! :database wsd-id #{:provisioned} :deprovisioning))))
        (testing "a fresh in-flight row is not failed"
          (is (= {:status-code 409, :status :deprovisioning}
                 (attempt #(ws.status/take-lock! :database wsd-id #{:failed} :deprovisioning)))))
        (testing "11 minutes later a take from failed takes it over"
          (age-minutes! :workspace_database wsd-id 11)
          (is (= :ok (attempt #(ws.status/take-lock! :database wsd-id #{:failed} :deprovisioning))))))))
  (testing "an unknown row is a 404"
    (is (= {:status-code 404} (attempt #(ws.status/take-lock! :database Integer/MAX_VALUE #{:failed} :deprovisioning))))))

(deftest concurrent-takes-test
  (testing "of concurrent takes from the same status exactly one succeeds; the rest get a 409"
    (do-with-workspace-database! :provisioned
      (fn [wsd-id _token]
        (let [start   (promise)
              results (doall (for [_ (range 8)]
                               (future
                                 @start
                                 (attempt #(ws.status/take-lock! :database wsd-id #{:provisioned} :deprovisioning)))))]
          (deliver start true)
          (is (= {:ok 1, {:status-code 409, :status :deprovisioning} 7} (frequencies (map deref results)))))))))

(deftest stalled-request-loses-its-lock-test
  (testing "a request that stalled past the stale limit and was taken over cannot change the row any more"
    (do-with-workspace-database! :provisioned
      (fn [wsd-id _token]
        (let [token-a (ws.status/take-lock! :database wsd-id #{:provisioned} :deprovisioning)
              _       (age-minutes! :workspace_database wsd-id 11)
              token-b (ws.status/take-lock! :database wsd-id #{:failed} :deprovisioning)]
          (is (= {:status-code 409, :status :deprovisioning}
                 (attempt #(ws.status/change-status! :database wsd-id token-a #{:deprovisioning} :failed))))
          (is (= {:status-code 409} (attempt #(ws.status/refresh-lock! :database wsd-id token-a))))
          (testing "the request that took it over still can"
            (is (nil? (ws.status/refresh-lock! :database wsd-id token-b)))
            (is (= :ok (attempt #(ws.status/change-status! :database wsd-id token-b #{:deprovisioning} :failed))))
            (is (= :failed (reads-as :database wsd-id)))))))))

(deftest change-status-test
  (do-with-workspace-database! :provisioning
    (fn [wsd-id token]
      (testing "the inserting request holds the lock and each change returns the next token"
        (let [next-token (ws.status/change-status! :database wsd-id token #{:provisioning} :provisioned)]
          (is (= :provisioned (reads-as :database wsd-id)))
          (testing "an old token no longer works"
            (is (= {:status-code 409, :status :provisioned}
                   (attempt #(ws.status/change-status! :database wsd-id token #{:provisioned} :deprovisioning)))))
          (testing "nor does the right token from the wrong status"
            (is (= {:status-code 409, :status :provisioned}
                   (attempt #(ws.status/change-status! :database wsd-id next-token #{:provisioning} :failed)))))
          (is (= :ok (attempt #(ws.status/change-status! :database wsd-id next-token #{:provisioned} :failed)))))))))

(deftest refresh-lock-keeps-a-long-request-test
  (do-with-workspace-database! :deprovisioning
    (fn [wsd-id token]
      (age-minutes! :workspace_database wsd-id 11)
      (ws.status/refresh-lock! :database wsd-id token)
      (is (= :deprovisioning (reads-as :database wsd-id)))
      (is (= {:status-code 409, :status :deprovisioning}
             (attempt #(ws.status/take-lock! :database wsd-id #{:failed} :deprovisioning)))))))

(deftest schema-lock-test
  (do-with-workspace-database! :provisioned
    (fn [wsd-id _token]
      (let [schema (ws.db/insert-workspace-schema! {:workspace_database_id wsd-id
                                                    :main_schema           "sales"
                                                    :scratch_namespace     "mb__isolation_statuste_s1_sales"
                                                    :status                :adding
                                                    :lock_token            (ws.status/new-lock-token)})
            id     (:id schema)]
        (testing "a fresh adding row reads as adding and is not taken over"
          (is (= :adding (reads-as :schema id)))
          (is (= {:status-code 409, :status :adding} (attempt #(ws.status/take-lock! :schema id #{:failed} :removing)))))
        (testing "11 minutes later it reads as failed and is taken over; the stalled inserter loses its lock"
          (age-minutes! :workspace_schema id 11)
          (is (= :failed (reads-as :schema id)))
          (let [token (ws.status/take-lock! :schema id #{:failed} :removing)]
            (is (= {:status-code 409, :status :removing}
                   (attempt #(ws.status/change-status! :schema id (:lock_token schema) #{:adding} :active))))
            (is (= :ok (attempt #(ws.status/change-status! :schema id token #{:removing} :failed))))))
        (testing "a failed row never goes stale"
          (age-minutes! :workspace_schema id 600)
          (is (= :failed (reads-as :schema id))))))))
