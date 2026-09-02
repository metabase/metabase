(ns metabase.mcp.v2.redaction-test
  "Unit tests for the recipient filters [[metabase.mcp.v2.redaction/redact-notification]]
   applies. The wiring — that each tool actually calls it before projecting — is pinned by the
   `get_content` tests in `metabase.mcp.v2.tools.content-test`; these pin the rules themselves.
   The sandboxed-caller filter lives in `metabase-enterprise.mcp.v2.redaction-sandbox-test`, since
   in OSS `sandboxed-or-impersonated-user?` is always false."
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.common :as api]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.redaction :as redaction]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private same-tenant-recipient
  "A user recipient in the caller's tenant — the predefined test users all have a nil `tenant_id`."
  {:type :notification-recipient/user :user_id 100 :user {:id 100 :tenant_id nil}})

(def ^:private cross-tenant-recipient
  {:type :notification-recipient/user :user_id 200 :user {:id 200 :tenant_id 42}})

(def ^:private email-recipient
  "A raw email address: no `user_id`, so no tenant to compare against."
  {:type :notification-recipient/raw-value :details {:value "someone@example.com"}})

(defn- deactivated-recipient
  "A user recipient the `:recipients-detail` hydration could not attach a `:user` to — the shape it
   produces for a deactivated user, whose tenant must be looked up from the app DB."
  [user-id]
  {:type :notification-recipient/user :user_id user-id})

(defn- testing-notification
  "A hydrated-shaped notification carrying `handlers`. `:notification/testing` is outside the set
   `redact-notification` strips, so the payload-unreadable branch stays out of the way with no
   collection fixture at all and the per-recipient filters are the only thing that runs."
  [handlers]
  {:id 2 :payload_type :notification/testing :handlers handlers})

(defn- card-notification
  "A hydrated-shaped alert on `card-id` with one email handler carrying `recipients`. `:payload` is
   the shape the `:payload` batched hydration really produces for `:notification/card`, the only
   payload type it has a branch for. The tests bind a user who can read the card, so the
   payload-unreadable strip stays out of the way and the per-recipient filters are what's under
   test; the strip branch is driven on persisted rows below."
  [card-id recipients]
  {:id           1
   :payload_type :notification/card
   :payload      {:card_id card-id}
   :handlers     [{:id 10 :channel_type :channel/email :recipients recipients}]})

(defn- as-tenant-caller
  "Run `thunk` with the current user belonging to tenant `tenant-id`. The predefined test users are all
   tenantless, and the tenant filter only engages for a caller who has one."
  [tenant-id thunk]
  (let [me @api/*current-user*]
    (binding [api/*current-user* (delay (assoc me :tenant_id tenant-id))]
      (thunk))))

(defn- visible-user-ids
  [notification]
  (->> (redaction/redact-notification notification)
       :handlers
       first
       :recipients
       (mapv :user_id)))

(deftest redact-notification-hides-cross-tenant-recipients-test
  (testing "GHY-4219: a caller who belongs to a tenant sees only that tenant's user recipients, while raw
            email recipients — which have no tenant — always survive. Same rule as /api/pulse."
    (mt/with-temp [:model/Card {card-id :id} {}]
      (let [notification (card-notification card-id
                                            [same-tenant-recipient
                                             cross-tenant-recipient
                                             email-recipient])]
        (mt/with-test-user :rasta
          (testing "a tenantless caller sees every recipient, as before tenants existed"
            (is (= [100 200 nil] (visible-user-ids notification))))
          (testing "a tenant caller sees only its own tenant"
            (as-tenant-caller 42 #(is (= [200 nil] (visible-user-ids notification))))))
        (testing "a superuser sees every recipient"
          (mt/with-test-user :crowberto
            (is (= [100 200 nil] (visible-user-ids notification)))))))))

(deftest deactivated-recipient-tenant-is-looked-up-test
  ;; Tenants are enterprise-only: :model/Tenant is not on the OSS classpath, so guard the body out
  ;; of OSS builds entirely (with-premium-features only flips the flag, it does not load EE code).
  (mt/when-ee-evailable
   (testing "GHY-4219: the `:recipients-detail` hydration attaches `:user` nil for a deactivated
             user, so its tenant is looked up from the app DB rather than read off the recipient
             map — otherwise a deactivated recipient reads as tenantless and slips past (or is
             wrongly dropped by) the tenant filter."
     (mt/with-premium-features #{:tenants}
       (mt/with-temp [:model/Tenant {tenant-id :id}       {:name "MCP redaction T1" :slug "mcp-redaction-t1"}
                      :model/Tenant {other-tenant-id :id} {:name "MCP redaction T2" :slug "mcp-redaction-t2"}
                      :model/User   {caller-id :id}       {:tenant_id tenant-id}
                      :model/User   {same-id :id}         {:tenant_id tenant-id       :is_active false}
                      :model/User   {other-id :id}        {:tenant_id other-tenant-id :is_active false}]
         (let [notification (testing-notification
                             [{:id 10 :channel_type :channel/email
                               :recipients [(deactivated-recipient same-id)
                                            (deactivated-recipient other-id)
                                            email-recipient]}])]
           (mt/with-current-user caller-id
             (testing "a tenant caller keeps the same-tenant deactivated recipient and drops the other"
               (is (= [same-id nil] (visible-user-ids notification)))))
           (testing "a tenantless caller sees every recipient, as before tenants existed"
             (mt/with-test-user :rasta
               (is (= [same-id other-id nil] (visible-user-ids notification)))))))))))

(defn- email-handler
  [handler-id recipients]
  {:id handler-id :channel_type :channel/email :recipients recipients})

(defn- deactivated-recipients
  [user-ids]
  (mapv deactivated-recipient user-ids))

(defn- redaction-query-count
  "Queries `redact-notification` runs over a notification made of `handlers`."
  [handlers]
  (t2/with-call-count [call-count]
    (redaction/redact-notification (testing-notification handlers))
    (call-count)))

(deftest tenant-filter-batches-recipient-lookups-test
  (testing "GHY-4219: resolving the tenants of recipients with no hydrated `:user` costs one query
            for the whole notification, however many handlers and recipients hang off it — looking
            each recipient up inside the filter is an N+1. Counted against a same-shaped
            notification of raw email recipients, which needs no lookup, so the per-handler cost of
            the sandbox check drops out. `:notification/testing` keeps the payload-readable check
            out of the window entirely. The recipient ids need not resolve to real users: only the
            shape of the lookup is under test."
    (mt/with-test-user :rasta
      (as-tenant-caller
       42
       (fn []
         ;; The first redaction pays one-off caching the sandbox check does; leave it out of the
         ;; measured counts.
         (redaction-query-count [(email-handler 10 [email-recipient])])
         (testing "one handler: one query however many recipients need looking up"
           (is (= (inc (redaction-query-count [(email-handler 10 [email-recipient])]))
                  (redaction-query-count [(email-handler 10 (deactivated-recipients [1 2 3 4 5 6]))]))))
         (testing "handlers share the one lookup rather than each running their own"
           (is (= (inc (redaction-query-count [(email-handler 10 [email-recipient])
                                               (email-handler 11 [email-recipient])]))
                  (redaction-query-count [(email-handler 10 (deactivated-recipients [1 2 3]))
                                          (email-handler 11 (deactivated-recipients [4 5 6]))]))))))
      (testing "a tenantless caller does not run the tenant filter, so it needs no lookup at all"
        (is (= (redaction-query-count [(email-handler 10 [email-recipient])])
               (redaction-query-count [(email-handler 10 (deactivated-recipients [1 2 3 4 5 6]))])))))))

(defn- handlers-with-recipients
  "The hydrated-and-redacted handlers of the persisted notification `notification-id`, as the
   current user sees them."
  [notification-id]
  (-> (t2/select-one :model/Notification notification-id)
      redaction/hydrate-and-redact-notification
      :handlers))

(deftest unreadable-payload-strips-recipient-lists-test
  (testing "a caller who reaches an alert only as its creator — not through its card — loses the
            recipient lists entirely. Driven on a persisted row through
            `hydrate-and-redact-notification`, since the strip hinges on what hydration actually
            attaches to the row."
    ;; A new collection inherits its parent's grants, and the test fixtures give All Users root
    ;; perms — revoke those so the collection (and so the card) is unreadable to rasta.
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp [:model/Collection       {collection-id :id} {}
                     :model/Card             {card-id :id}       {:collection_id collection-id}
                     :model/NotificationCard {payload-id :id}    {:card_id card-id}
                     :model/Notification     {notif-id :id}      {:payload_type :notification/card
                                                                  :payload_id   payload-id
                                                                  :creator_id   (mt/user->id :rasta)}
                     :model/NotificationHandler {handler-id :id} {:notification_id notif-id
                                                                  :channel_type    :channel/email}
                     :model/NotificationRecipient _              {:notification_handler_id handler-id
                                                                  :type    :notification-recipient/user
                                                                  :user_id (mt/user->id :lucky)}]
        (mt/with-test-user :rasta
          (is (not-any? #(contains? % :recipients) (handlers-with-recipients notif-id))))
        (testing "a reader of the card keeps the (filtered) lists"
          (mt/with-test-user :crowberto
            (is (every? #(contains? % :recipients) (handlers-with-recipients notif-id)))))))))

(defn- migrate-to-dashboard-notification!
  "Repoint the payload-less notification `notification-id` to `:notification/dashboard` with raw
   SQL. The model lifecycle has no branch for the type — the insert schema rejects it and
   `create-notification!` cannot build one — so a migration is the only way such a row comes to
   exist, and raw SQL is the only way to stand one up here."
  [notification-id]
  (t2/query-one {:update :notification
                 :set    {:payload_type "notification/dashboard"}
                 :where  [:= :id notification-id]}))

(deftest dashboard-notification-recipient-lists-test
  (testing "a migrated dashboard subscription carries no payload at all — no payload table stands
            behind `:payload_id` and the `:payload` hydration has no branch for the type — so the
            recipient lists survive only for a superuser, who can read every dashboard. Reading
            the id off a `:payload` map hydration never populates stripped them for everybody."
    (mt/with-temp [:model/Notification        {notif-id :id}   {:payload_type :notification/card
                                                                :creator_id   (mt/user->id :rasta)}
                   :model/NotificationHandler {handler-id :id} {:notification_id notif-id
                                                                :channel_type    :channel/email}
                   :model/NotificationRecipient _              {:notification_handler_id handler-id
                                                                :type    :notification-recipient/user
                                                                :user_id (mt/user->id :lucky)}]
      (migrate-to-dashboard-notification! notif-id)
      (mt/with-test-user :crowberto
        (is (every? #(contains? % :recipients) (handlers-with-recipients notif-id))))
      (testing "a non-superuser — here the creator, who can read the notification itself — is stripped"
        (mt/with-test-user :rasta
          (is (not-any? #(contains? % :recipients) (handlers-with-recipients notif-id))))))))

(deftest filtered-to-empty-is-not-the-same-as-stripped-test
  (testing "GHY-4219: a handler whose recipients are all filtered away keeps the key with an empty
            list, while the payload-unreadable strip removes the key entirely. The projection
            reports the two differently, so a caller can tell \"nobody you may see\" from
            \"withheld\" — this pins that the split of redaction out of the projection preserves
            the distinction."
    (mt/with-temp [:model/Card {card-id :id} {}]
      (mt/with-test-user :rasta
        (testing "filtered to empty projects as an empty list"
          ;; A tenant caller, so the cross-tenant recipient is filtered rather than shown.
          (as-tenant-caller 99
                            (fn []
                              (let [handler (-> (card-notification card-id [cross-tenant-recipient])
                                                redaction/redact-notification
                                                projections/notification-row
                                                :handlers
                                                first)]
                                (is (contains? handler :recipients))
                                (is (= [] (:recipients handler)))))))
        (testing "stripped projects without the key at all"
          (let [handler (-> (card-notification card-id [same-tenant-recipient])
                            ;; What `redact-notification` does when the caller cannot read the
                            ;; payload; done by hand here so the assertion needs no extra fixture.
                            (update :handlers (partial mapv #(dissoc % :recipients)))
                            projections/notification-row
                            :handlers
                            first)]
            (is (not (contains? handler :recipients)))))))))
