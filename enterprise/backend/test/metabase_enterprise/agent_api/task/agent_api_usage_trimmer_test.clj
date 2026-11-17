(ns metabase-enterprise.agent-api.task.agent-api-usage-trimmer-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.agent-api.task.agent-api-usage-trimmer :as agent-api-usage-trimmer]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

;; NOTE: these tests deliberately do NOT wrap in `mt/with-premium-features #{:audit-app}` — Agent API
;; usage is collected on every EE instance, so its trimmer must run regardless of the audit-app feature.

(deftest trims-rows-older-than-custom-retention-test
  (testing "with retention set to 30 days, call rows older than 30 days are deleted"
    (mt/with-temp
      [:model/AgentApiCallLog {recent :id}   {:operation "GET /api/agent/v1/ping" :created_at (t/offset-date-time)}
       :model/AgentApiCallLog {boundary :id} {:operation "GET /api/agent/v1/ping" :created_at (t/minus (t/offset-date-time) (t/days 31))}
       :model/AgentApiCallLog {old :id}      {:operation "GET /api/agent/v1/ping" :created_at (t/minus (t/offset-date-time) (t/days 200))}]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 30]
        (#'agent-api-usage-trimmer/trim-old-agent-api-usage-data!)
        (is (= #{recent}
               (t2/select-fn-set :id :model/AgentApiCallLog {:where [:in :id [recent boundary old]]}))
            "call rows older than the cutoff are deleted, recent kept")))))

(deftest skips-deletion-when-retention-is-infinite-test
  (testing "when retention is set to 0 (infinite), no rows are deleted"
    (mt/with-temp
      [:model/AgentApiCallLog {recent :id} {:operation "GET /api/agent/v1/ping" :created_at (t/offset-date-time)}
       :model/AgentApiCallLog {old :id}    {:operation "GET /api/agent/v1/ping" :created_at (t/minus (t/offset-date-time) (t/years 5))}]
      (mt/with-temp-env-var-value! [mb-ai-usage-max-retention-days 0]
        (#'agent-api-usage-trimmer/trim-old-agent-api-usage-data!)
        (is (= #{recent old}
               (t2/select-fn-set :id :model/AgentApiCallLog {:where [:in :id [recent old]]})))))))
