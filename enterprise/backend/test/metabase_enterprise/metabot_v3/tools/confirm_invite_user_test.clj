(ns metabase-enterprise.metabot-v3.tools.confirm-invite-user-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.metabot-v3.tools.interface :as tools.interface]))

(deftest it-generates-a-reaction
  (is (= {:reactions
          [{:type :metabot.reaction/confirmation,
            :description "Invite a user with email 'email' to Metabase?",
            :options
            {:yes
             [{:type :metabot.reaction/api-call, :api-call {:method "POST", :url "/api/user", :body {:email "email"}}}
              {:type :metabot.reaction/writeback,
               :message
               "<system message>The user confirmed the operation and the specified user has been invited to Metabase.</system message>"}],
             :no
             [{:type :metabot.reaction/writeback,
               :message "<system message>The user refused the operation. Ask if they need anything else.</system message>"}]}}],
          :output "Confirmation required - awaiting user input."}
         (tools.interface/*invoke-tool* :metabot.tool/confirm-invite-user {:email "email"}))))
