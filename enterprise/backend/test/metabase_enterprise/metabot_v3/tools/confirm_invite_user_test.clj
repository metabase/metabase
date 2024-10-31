(ns metabase-enterprise.metabot-v3.tools.confirm-invite-user-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.metabot-v3.tools.interface :as tools.interface]))

(deftest it-generates-a-reaction
  (is (= {:reactions
          [{:type :metabot.reaction/confirmed-api-call,
            :description "Invite a user with email 'email' to Metabase",
            :api-call {:method "POST", :endpoint "/api/user", :body {:email "email"}}}],
          :output "Confirmation required - awaiting user input."}
         (tools.interface/*invoke-tool* :metabot.tool/confirm-invite-user {:email "email"}))))
