(ns metabase-enterprise.mcp.v2.redaction-sandbox-test
  "The sandboxed-caller half of [[metabase.mcp.v2.redaction/redact-notification]]'s recipient
   filter. Lives in enterprise because sandboxing does: in OSS
   `metabase.permissions.core/sandboxed-or-impersonated-user?` is always false, so the branch is
   unreachable there. The tenant filter and the wiring are covered in
   `metabase.mcp.v2.redaction-test` and `metabase.mcp.v2.tools.content-test`."
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.test :as met]
   [metabase.mcp.v2.redaction :as redaction]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest redact-notification-sandboxed-caller-sees-only-themselves-test
  (testing "GHY-4219: a sandboxed caller sees only themselves among a handler's user recipients,
            so an alert cannot be used to enumerate the other Metabase users it delivers to. Raw
            email recipients carry no user and are preserved."
    (met/with-gtaps! {:gtaps {:venues {}}}
      ;; `with-gtaps!` binds :rasta as the current user.
      (let [notification {:id           1
                          ;; :notification/dashboard keeps the strip-everything branch out of the
                          ;; way — the per-recipient filter is what's under test.
                          :payload_type :notification/dashboard
                          :handlers     [{:id           10
                                          :channel_type :channel/email
                                          :recipients   [{:type    :notification-recipient/user
                                                          :user_id (mt/user->id :rasta)}
                                                         {:type    :notification-recipient/user
                                                          :user_id (mt/user->id :crowberto)}
                                                         {:type    :notification-recipient/raw-value
                                                          :details {:value "someone@example.com"}}]}]}]
        (is (= [(mt/user->id :rasta) nil]
               (->> (redaction/redact-notification notification)
                    :handlers
                    first
                    :recipients
                    (mapv :user_id)))
            "crowberto is another Metabase user and must not appear")))))
