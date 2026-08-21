(ns metabase.mcp.v2.redaction-test
  "Unit tests for the recipient filters [[metabase.mcp.v2.redaction/redact-notification]]
   applies. The wiring — that each tool actually calls it before projecting — is pinned by the
   `get_content` tests in `metabase.mcp.v2.tools.content-test`; these pin the rules themselves,
   which need no fixtures beyond a bound current user. The sandboxed-caller filter lives in
   `metabase-enterprise.mcp.v2.redaction-sandbox-test`, since in OSS
   `sandboxed-or-impersonated-user?` is always false."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.redaction :as redaction]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private same-tenant-recipient
  "A user recipient in the caller's tenant — the predefined test users all have a nil `tenant_id`."
  {:type :notification-recipient/user :user_id 100 :user {:id 100 :tenant_id nil}})

(def ^:private cross-tenant-recipient
  {:type :notification-recipient/user :user_id 200 :user {:id 200 :tenant_id 42}})

(def ^:private email-recipient
  "A raw email address: no `user_id`, so no tenant to compare against."
  {:type :notification-recipient/raw-value :details {:value "someone@example.com"}})

(defn- dashboard-notification
  "A hydrated-shaped notification with one email handler carrying `recipients`. `payload_type` is
   `:notification/dashboard` so the strip-everything branch — which needs a card read — never
   fires and the per-recipient filters are what's under test."
  [recipients]
  {:id           1
   :payload_type :notification/dashboard
   :handlers     [{:id 10 :channel_type :channel/email :recipients recipients}]})

(defn- visible-user-ids
  [notification]
  (->> (redaction/redact-notification notification)
       :handlers
       first
       :recipients
       (mapv :user_id)))

(deftest redact-notification-hides-cross-tenant-recipients-test
  (testing "GHY-4219: a non-superuser never sees recipients from another tenant, while raw email
            recipients — which have no tenant — always survive"
    (let [notification (dashboard-notification [same-tenant-recipient
                                                cross-tenant-recipient
                                                email-recipient])]
      (mt/with-test-user :rasta
        (is (= [100 nil] (visible-user-ids notification))))
      (testing "a superuser sees every recipient"
        (mt/with-test-user :crowberto
          (is (= [100 200 nil] (visible-user-ids notification))))))))

(deftest filtered-to-empty-is-not-the-same-as-stripped-test
  (testing "GHY-4219: a handler whose recipients are all filtered away keeps the key with an empty
            list, while the payload-unreadable strip removes the key entirely. The projection
            reports the two differently, so a caller can tell \"nobody you may see\" from
            \"withheld\" — this pins that the split of redaction out of the projection preserves
            the distinction."
    (mt/with-test-user :rasta
      (testing "filtered to empty projects as an empty list"
        (let [handler (-> (dashboard-notification [cross-tenant-recipient])
                          redaction/redact-notification
                          projections/notification-row
                          :handlers
                          first)]
          (is (contains? handler :recipients))
          (is (= [] (:recipients handler)))))
      (testing "stripped projects without the key at all"
        (let [handler (-> (dashboard-notification [same-tenant-recipient])
                          ;; What `redact-notification` does when the caller cannot read the
                          ;; payload; done by hand here so the assertion needs no card fixture.
                          (update :handlers (partial mapv #(dissoc % :recipients)))
                          projections/notification-row
                          :handlers
                          first)]
          (is (not (contains? handler :recipients))))))))
