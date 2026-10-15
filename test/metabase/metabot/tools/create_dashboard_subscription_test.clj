(ns metabase.metabot.tools.create-dashboard-subscription-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.tools.create-dashboard-subscription :as tools.create-dashboard-subscription]))

(deftest ^:parallel slackbot-create-dashboard-subscription-outside-slack-test
  (testing "a call from outside Slack goes back to the agent as output"
    (is (= {:output "This tool can only be used from a Slack channel"}
           (tools.create-dashboard-subscription/slackbot-create-dashboard-subscription-tool
            {:dashboard_id 1 :schedule {:frequency "daily" :hour 9}})))))
