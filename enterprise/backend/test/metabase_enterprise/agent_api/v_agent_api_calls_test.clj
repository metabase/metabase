(ns metabase-enterprise.agent-api.v-agent-api-calls-test
  "Tests for the `v_agent_api_calls` SQL view. Client identity is stored on each call row, and the
  view derives `client_display_name` / `user_display_name` from it and LEFT JOINs core_user + tenant."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- query-view
  "Query v_agent_api_calls, returning only rows for the given call ids."
  [call-ids]
  (t2/query {:select [:*]
             :from   [:v_agent_api_calls]
             :where  [:in :call_id call-ids]}))

(defn- find-row [rows call-id]
  (some #(when (= (:call_id %) call-id) %) rows))

(deftest joins-and-derived-columns-test
  (testing "the view derives display columns from the identity stored on each call row"
    (mt/with-temp
      [:model/User            {user-id :id} {:first_name "Ada" :last_name "Lovelace"}
       :model/AgentApiCallLog {cli-id :id} {:user_id user-id
                                            :operation "POST /api/agent/v1/query" :status "success"
                                            :duration_ms 42 :client_name "metabase-cli"
                                            :created_at (t/offset-date-time)}
       :model/AgentApiCallLog {other-id :id} {:user_id user-id
                                              :operation "GET /api/agent/v1/ping" :status "error"
                                              :duration_ms 7 :client_name "other"
                                              :error_message "bad params"
                                              :created_at (t/offset-date-time)}]
      (let [rows  (query-view [cli-id other-id])
            cli   (find-row rows cli-id)
            other (find-row rows other-id)]
        (is (=? {:operation           "POST /api/agent/v1/query"
                 :status              "success"
                 :client_name         "metabase-cli"
                 :client_display_name "Metabase CLI"
                 :user_display_name   "Ada Lovelace"}
                cli))
        (is (=? {:status              "error"
                 :client_name         "other"
                 :client_display_name "Other"
                 :error_message       "bad params"}
                other))))))

(deftest unknown-client-and-user-test
  (testing "a call with no client and no user still appears, with null display columns"
    (mt/with-temp
      [:model/AgentApiCallLog {orphan-id :id} {:user_id nil
                                               :operation "GET /api/agent/v1/ping" :status "success"
                                               :duration_ms 5 :created_at (t/offset-date-time)}]
      (let [row (find-row (query-view [orphan-id]) orphan-id)]
        (is (some? row) "the row is not dropped")
        (is (=? {:operation "GET /api/agent/v1/ping" :client_name nil
                 :client_display_name nil :user_display_name nil}
                row))))))
