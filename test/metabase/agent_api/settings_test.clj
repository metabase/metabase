(ns metabase.agent-api.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.agent-api.settings :as agent-api.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(deftest agent-api-enabled-setting-is-removed-test
  (testing "agent-api-enabled?, the switch before 0.66, is removed"
    (is (not (setting/registered? :agent-api-enabled?)))
    (testing "an upgraded instance that still stores a value for it serves its settings, without that key"
      (mt/with-temporary-raw-setting-values [:agent-api-enabled? "true"]
        (is (not (contains? (mt/user-http-request :rasta :get 200 "session/properties")
                            :agent-api-enabled?)))
        (is (not-any? #(= "agent-api-enabled?" (:key %))
                      (mt/user-http-request :crowberto :get 200 "setting")))))))

(deftest deprecated-agent-api-off-by-default-test
  (testing "an instance that never set it has the deprecated Agent API off, and one that opted in keeps it on"
    (mt/with-temporary-setting-values [deprecated-agent-api-enabled? nil]
      (is (false? (agent-api.settings/deprecated-agent-api-enabled?))))
    (mt/with-temporary-setting-values [deprecated-agent-api-enabled? true]
      (is (true? (agent-api.settings/deprecated-agent-api-enabled?))))))

(deftest deprecated-agent-api-env-var-test
  (testing "the env var MB_DEPRECATED_AGENT_API_ENABLED sets the value"
    (mt/with-temp-env-var-value! [mb-deprecated-agent-api-enabled "true"]
      (is (true? (agent-api.settings/deprecated-agent-api-enabled?))))))

(deftest deprecated-agent-api-write-logs-deprecation-test
  (testing "a write of the setting logs that it is deprecated, so an admin who opts in finds the notice in the log"
    (mt/with-log-messages-for-level [messages [metabase.settings.models.setting :warn]]
      (mt/with-temporary-setting-values [deprecated-agent-api-enabled? true]
        (is (some #(re-find #"deprecated-agent-api-enabled\? is deprecated as of Metabase 0\.66\.0" (:message %))
                  (messages)))))))
