(ns ^:mb/driver-tests metabase-enterprise.agent-api.workspace-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase-enterprise.workspaces.test-util :as ws.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db :test-users)
  (fn [thunk] (mt/test-drivers (mt/normal-drivers-with-feature :transforms/table) (thunk))))

(ws.tu/ws-fixtures!)

;;; ---------------------------------------- Auth helpers ----------------------------------------

(defn- current-epoch-seconds []
  (int (/ (System/currentTimeMillis) 1000)))

(defn- sign-jwt [claims]
  (jwt/sign (merge {:iat (current-epoch-seconds)} claims) sso.test-setup/default-jwt-secret))

(defmacro ^:private with-agent-workspace-setup!
  "Sets up JWT auth and premium features needed for agent API + workspaces."
  [& body]
  `(sso.test-setup/with-jwt-default-setup!
     ;; Workspace creation produces a service-user API key. Clean it up before the User cleanup
     ;; in with-jwt-default-setup!, otherwise the FK constraint on api_key.user_id blocks deletion.
     (mt/with-model-cleanup [:model/ApiKey]
       (mt/with-additional-premium-features #{:agent-api :metabot-v3 :workspaces :transforms}
         ~@body))))

(defn- auth-headers
  ([] (auth-headers "crowberto@metabase.com"))
  ([email]
   {"authorization" (str "Bearer " (sign-jwt {:email email}))}))

(defn- agent-ws-client
  "Make an authenticated agent API workspace request."
  ([method expected-status endpoint]
   (agent-ws-client method expected-status endpoint nil))
  ([method expected-status endpoint body]
   (apply client/client method expected-status endpoint
          {:request-options {:headers (auth-headers)}}
          (when body [body]))))

;;; ---------------------------------------- Tests ----------------------------------------

(deftest agent-workspace-auth-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:name "Auth Test"}}]
      (let [ws-id (:workspace-id res)]
        (testing "Valid JWT accesses workspace endpoint"
          (is (=? {:id ws-id}
                  (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id)))))

        (testing "No JWT gets 401"
          (is (= {:error   "missing_authorization"
                  :message "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."}
                 (client/client :get 401 (str "agent/v1/workspace/" ws-id)))))))))

(deftest agent-workspace-get-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:name "GET Test"}}]
      (let [ws-id (:workspace-id res)]
        (testing "GET workspace returns workspace details"
          (is (=? {:id   ws-id
                   :name "GET Test"}
                  (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id)))))

        (testing "GET non-existent workspace returns 404"
          (is (= "Not found."
                 (agent-ws-client :get 404 "agent/v1/workspace/999999"))))))))

(deftest agent-workspace-table-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id (:workspace-id res)]
        (testing "GET tables returns inputs and outputs"
          (let [result (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/table"))]
            (is (contains? result :inputs))
            (is (contains? result :outputs))))))))

(deftest agent-workspace-log-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:name "Log Test"}}]
      (let [ws-id (:workspace-id res)]
        (testing "GET log returns workspace status and logs"
          (let [result (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/log"))]
            (is (= ws-id (:workspace_id result)))
            (is (contains? result :status))
            (is (sequential? (:logs result)))))))))

(deftest agent-workspace-transform-crud-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id  (:workspace-id res)
            ref-id (get-in res [:workspace-map :x1])]
        (testing "GET transforms listing"
          (let [result (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/transform"))]
            (is (sequential? (:transforms result)))
            (is (some #(= ref-id (:ref_id %)) (:transforms result)))))

        (testing "GET specific transform"
          (let [result (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/transform/" ref-id))]
            (is (= ref-id (:ref_id result)))))

        (testing "POST archive transform"
          (is (nil? (agent-ws-client :post 204 (str "agent/v1/workspace/" ws-id "/transform/" ref-id "/archive")))))

        (testing "POST unarchive transform"
          (is (nil? (agent-ws-client :post 204 (str "agent/v1/workspace/" ws-id "/transform/" ref-id "/unarchive")))))))))

(deftest agent-workspace-graph-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id (:workspace-id res)]
        (testing "GET graph returns nodes and edges"
          (let [result (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/graph"))]
            (is (contains? result :nodes))
            (is (contains? result :edges))))))))

(deftest agent-workspace-problem-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id (:workspace-id res)]
        (testing "GET problems returns a sequence"
          (is (sequential? (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/problem")))))))))

(deftest agent-workspace-pending-inputs-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id (:workspace-id res)]
        (testing "GET pending inputs"
          (let [result (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/input/pending"))]
            (is (contains? result :inputs))))))))

(deftest agent-workspace-archive-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:name "Archive Test"}}]
      (let [ws-id (:workspace-id res)]
        (testing "POST archive workspace"
          (let [result (agent-ws-client :post 200 (str "agent/v1/workspace/" ws-id "/archive"))]
            (is (= "archived" (:status result)))))))))

(deftest agent-workspace-run-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id (:workspace-id res)]
        (testing "POST run workspace returns execution result"
          (ws.tu/with-mocked-execution
            (let [result (agent-ws-client :post 200 (str "agent/v1/workspace/" ws-id "/run"))]
              (is (contains? result :succeeded))
              (is (contains? result :failed))
              (is (contains? result :not_run)))))))))

(deftest agent-workspace-external-transforms-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:global    {:x1 [:t1]}
                                 :workspace {:name "External Test"}}]
      (let [ws-id (:workspace-id res)]
        (testing "GET external transforms"
          (let [result (agent-ws-client :get 200 (str "agent/v1/workspace/" ws-id "/external/transform"))]
            (is (contains? result :transforms))
            (is (sequential? (:transforms result)))))))))

(deftest agent-workspace-execute-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id  (:workspace-id res)
            ref-id (get-in res [:workspace-map :x1])]
        (testing "POST transform run returns execution result"
          (ws.tu/with-mocked-execution
            (let [result (agent-ws-client :post 200 (str "agent/v1/workspace/" ws-id "/transform/" ref-id "/run"))]
              (is (contains? result :status)))))

        (testing "POST transform dry-run returns query result"
          (ws.tu/with-mocked-execution
            (let [result (agent-ws-client :post 200 (str "agent/v1/workspace/" ws-id "/transform/" ref-id "/dry-run"))]
              (is (contains? result :status)))))

        (testing "POST query returns query result"
          (ws.tu/with-mocked-execution
            (let [result (agent-ws-client :post 200 (str "agent/v1/workspace/" ws-id "/query") {:sql "SELECT 1"})]
              (is (contains? result :status)))))

        (testing "POST run on archived workspace returns 400"
          (agent-ws-client :post 200 (str "agent/v1/workspace/" ws-id "/archive"))
          (is (= "Cannot execute archived workspace"
                 (agent-ws-client :post 400 (str "agent/v1/workspace/" ws-id "/run")))))))))

(deftest agent-workspace-validate-target-test
  (with-agent-workspace-setup!
    (ws.tu/with-resources! [res {:workspace {:definitions {:x1 [:t1]}}}]
      (let [ws-id  (:workspace-id res)
            ref-id (get-in res [:workspace-map :x1])
            target (-> (t2/select-one [:model/WorkspaceTransform :target]
                                      :workspace_id ws-id :ref_id ref-id)
                       :target)]
        (testing "Validating a transform's own target with its ref-id returns 200 (no self-conflict)"
          (is (= "OK"
                 (agent-ws-client :post 200 (str "agent/v1/workspace/" ws-id "/transform/validate/target")
                                  {:transform-id ref-id
                                   :target       target}))))

        (testing "Validating a conflicting target without transform-id returns 403"
          (is (= "Another transform in this workspace already targets that table"
                 (agent-ws-client :post 403 (str "agent/v1/workspace/" ws-id "/transform/validate/target")
                                  {:target target}))))))))

(deftest agent-workspace-feature-gating-test
  (testing "Workspace endpoints require :agent-api premium feature"
    (sso.test-setup/with-jwt-default-setup!
      (mt/with-model-cleanup [:model/ApiKey]
        ;; Enable workspaces but NOT agent-api
        (mt/with-additional-premium-features #{:workspaces :transforms}
          (ws.tu/with-resources! [res {:workspace {:name "Gating Test"}}]
            (let [ws-id  (:workspace-id res)
                  result (client/client-full-response :get 402 (str "agent/v1/workspace/" ws-id)
                                                      {:request-options {:headers (auth-headers)}})]
              (testing "Returns 402 when :agent-api feature is not enabled"
                (is (= 402 (:status result)))))))))))
