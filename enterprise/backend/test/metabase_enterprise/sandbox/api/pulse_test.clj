(ns metabase-enterprise.sandbox.api.pulse-test
  "Tests that would logically be included in `metabase.api.pulse-test` but are separate as they are enterprise only."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.test :as met]
   [metabase.integrations.slack]
   [metabase.test :as mt]))

(comment metabase.integrations.slack/keep-me) ; so the Setting exists

(deftest segmented-users-pulse-test
  (testing "GET /api/pulse/form_input"
    (testing (str "Non-segmented users are able to send pulses to any slack channel that the configured instance can "
                  "see. A segmented user should not be able to send messages to those channels. This tests that a "
                  "segmented user doesn't see any slack channels.")
      (met/with-gtaps! {:gtaps {:venues {}}}
        (mt/with-temporary-setting-values [slack-token nil]
          (is (= nil
                 (-> (mt/user-http-request :rasta :get 200 "pulse/form_input")
                     (get-in [:channels :slack])))))))))
