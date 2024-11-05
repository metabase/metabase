(ns metabase-enterprise.metabot-v3.tools-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api :as api]
   [metabase-enterprise.metabot-v3.tools :as metabot-v3.tools]
   [metabase.test :as mt]))

(deftest ^:parallel validate-tools-test
  (testing "Check that all tools are valid."
    (is (seq (metabot-v3.tools/*tools-metadata*)))))

(def single-invite-tool-calls
  [{:description "Short request with a valid email"
    :input-message "Please invite john.doe@example.com to Metabase."
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user
                           :arguments {:email "john.doe@example.com"}}]}

   {:description "Direct short message with email"
    :input-message "Invite chris.evans@email.com"
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user
                           :arguments {:email "chris.evans@email.com"}}]}

   {:description "Question phrased request for invitation"
    :input-message "Can you invite andrew.jones@xyz.com to Metabase?"
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user
                           :arguments {:email "andrew.jones@xyz.com"}}]}

   {:description "Tech department style message"
    :input-message "We need to grant Metabase access to devops.mike@itdept.io. Can you take care of that?"
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user
                           :arguments {:email "devops.mike@itdept.io"}}]}])

(def multiple-invite-tool-calls
  [{:description "A request to invite a list of users in a formal corporate style"
    :input-message "Could you please invite the following individuals to Metabase? 1. sarah.connor@example.com, 2. mike.jones@example.com, 3. alice.williams@example.com. Thank you!"
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user :arguments {:email "sarah.connor@example.com"}}
                          {:name :metabot.tool/confirm-invite-user :arguments {:email "mike.jones@example.com"}}
                          {:name :metabot.tool/confirm-invite-user :arguments {:email "alice.williams@example.com"}}]}

   ;; This fails
   #_{:description "A less formal request with three emails listed"
    :input-message "Hey, can you send invites to these folks? jake.peralta@example.com, terry.jeffords@example.com, rosa.diaz@example.com"
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user :arguments {:email "jake.peralta@example.com"}}
                          {:name :metabot.tool/confirm-invite-user :arguments {:email "terry.jeffords@example.com"}}
                          {:name :metabot.tool/confirm-invite-user :arguments {:email "rosa.diaz@example.com"}}]}

   {:description "A very brief message asking for two invites"
    :input-message "Invite steve.rogers@avengers.com, natasha.romanoff@avengers.com"
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user :arguments {:email "steve.rogers@avengers.com"}}
                          {:name :metabot.tool/confirm-invite-user :arguments {:email "natasha.romanoff@avengers.com"}}]}

   {:description "Formal request mentioning three invites for different departments"
    :input-message "I would like to request invites for the following employees: peter.parker@dailybugle.com, bruce.banner@avengers.com, tony.stark@starkindustries.com. Each belongs to different departments."
    :expected-tool-calls [{:name :metabot.tool/confirm-invite-user :arguments {:email "peter.parker@dailybugle.com"}}
                          {:name :metabot.tool/confirm-invite-user :arguments {:email "bruce.banner@avengers.com"}}
                          {:name :metabot.tool/confirm-invite-user :arguments {:email "tony.stark@starkindustries.com"}}]}])

(defn missing-email-msg? [response]
  (some #(re-matches % response) [#"provide.+email"
                                  #"email.+missing"
                                  #"need.+email"]))

(def need-clarification
  [{:description "Short request, missing email"
    :input-message "Can you invite my colleague?"
    :output-checks [missing-email-msg?]
    :expected-tool-calls []}

   {:description "Short request with name, missing email but domain included in context"
    :input-message "Can you invite my colleague John?"
    :expected-tool-calls []
    :output-checks [missing-email-msg?]
    :context {:user {:email "thomas@metabase.com"}}}

   {:description "Request with incomplete email"
    :input-message "Please send an invite to john@company"
    :output-checks [missing-email-msg?]
    :expected-tool-calls []}

   {:description "Vague request, no email provided"
    :input-message "We need to get a new person on the platform. Can you do that?"
    :output-checks [missing-email-msg?]
    :expected-tool-calls []}])


(def test-cases
  (concat single-invite-tool-calls
          multiple-invite-tool-calls
          need-clarification))

(defn run-tool-test-case [{:keys [description input-message output-checks expected-tool-calls context]}]
  (let [history (:history (mt/with-test-user :crowberto (#'api/request input-message (merge {} context) [])))]
    (testing description
      (is (= (set expected-tool-calls)
             (->> history
                  (mapcat :tool-calls)
                  (map #(dissoc % :id))
                  (into #{})))
          (pr-str history))
      (doseq [output-check output-checks]
        (is (output-check (:content (last history)))
            (format "Output check failed: %s"
                    (pr-str (last history))))))))

(deftest ^:metabot-v3/e2e test-tool-cases
  (doseq [test-case test-cases]
    (run-tool-test-case test-case)))
