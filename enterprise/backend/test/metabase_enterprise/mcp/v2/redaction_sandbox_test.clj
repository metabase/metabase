(ns metabase-enterprise.mcp.v2.redaction-sandbox-test
  "The sandboxed-caller branch of [[metabase.mcp.v2.redaction/redact-notification]]. In OSS
   `sandboxed-or-impersonated-user?` is always false, so the branch can only be driven where a sandbox
   exists; the other recipient rules are pinned in `metabase.mcp.v2.redaction-test`."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.test :as met]
   [metabase.mcp.v2.redaction :as redaction]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(defn- user-recipient
  [user-id]
  {:type :notification-recipient/user :user_id user-id :user {:id user-id :tenant_id nil}})

(deftest sandboxed-caller-sees-only-itself-among-user-recipients-test
  (testing "a sandboxed caller sees only itself among user recipients; raw-value recipients survive"
    (met/with-gtaps! {:gtaps {:venues {}}}
      (let [rasta-id     (mt/user->id :rasta)
            notification {:id           3
                          ;; outside the payload-strip set, so only the per-recipient filters run
                          :payload_type :notification/testing
                          :handlers     [{:id           10
                                          :channel_type :channel/email
                                          :recipients   [(user-recipient rasta-id)
                                                         (user-recipient (mt/user->id :lucky))
                                                         {:type    :notification-recipient/raw-value
                                                          :details {:value "someone@example.com"}}]}]}
            kept         (mt/with-test-user :rasta
                           (->> (redaction/redact-notification notification) :handlers first :recipients))]
        (is (= [rasta-id nil] (mapv :user_id kept))
            "the other user is hidden; the caller and the raw address remain")))))
