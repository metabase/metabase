(ns metabase-enterprise.security-center.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.health-checks :as health-checks]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.notification :as notification]
   [metabase-enterprise.security-center.settings :as settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.i18n :refer [deferred-tru]]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-advisories
  "Default test advisories covering different severities and match statuses."
  [{:advisory_id       "SC-0000-001"
    :severity          "critical"
    :title             "Test Critical Advisory"
    :description       "Critical vulnerability in serialization."
    :remediation       "Upgrade to fix."
    :affected_versions [{"min" "1.50.0" "fixed" "1.58.0"}]
    :match_status      "active"
    :published_at      #t "2026-03-24T00:00:00Z"
    :updated_at        #t "2026-03-24T00:00:00Z"}
   {:advisory_id       "SC-0000-002"
    :severity          "high"
    :title             "Test High Advisory"
    :description       "SQL injection in Redshift driver."
    :remediation       "Upgrade to fix."
    :affected_versions [{"min" "1.54.0" "fixed" "1.58.8"}]
    :match_status      "resolved"
    :published_at      #t "2026-03-20T00:00:00Z"
    :updated_at        #t "2026-03-20T00:00:00Z"}
   {:advisory_id       "SC-0000-003"
    :severity          "medium"
    :title             "Test Medium Advisory"
    :description       "GeoJSON SSRF."
    :remediation       "Upgrade to fix."
    :affected_versions [{"min" "1.50.0" "fixed" "1.58.7"}]
    :match_status      "not_affected"
    :published_at      #t "2026-03-15T00:00:00Z"
    :updated_at        #t "2026-03-15T00:00:00Z"}])

(defmacro with-test-advisories!
  "Create temporary SecurityAdvisories from [[test-advisories]] and execute `body`."
  [& body]
  (let [temps (mapcat (fn [advisory]
                        [:model/SecurityAdvisory '_ advisory])
                      test-advisories)]
    `(mt/with-temp [~@temps]
       ~@body)))

(deftest list-advisories-test
  (testing "GET /api/ee/security-center/advisories"
    (testing "requires premium feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Security Center"
         (mt/user-http-request :crowberto :get 402 "ee/security-center/advisories"))))
    (mt/with-premium-features #{:admin-security-center}
      (with-test-advisories!
        (testing "superuser can list advisories"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/security-center/advisories")]
            (is (contains? response :last_checked_at))
            (is (= 3 (count (:advisories response))))
            (is (= "SC-0000-001" (-> response :advisories first :advisory_id)))))
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :get 403 "ee/security-center/advisories"))))))

(deftest list-advisories-returns-download-jar-urls-test
  (testing "GET /api/ee/security-center/advisories returns download_jar_urls"
    (mt/with-premium-features #{:admin-security-center}
      (mt/with-temp [:model/SecurityAdvisory _
                     {:advisory_id       "SC-DL-001"
                      :severity          "high"
                      :title             "Advisory with download link"
                      :description       "Test"
                      :remediation       "Upgrade"
                      :affected_versions [{"min" "1.58.0" "fixed" "1.58.11"}]
                      :download_jar_urls [{"version" "1.58.11"
                                           "url" "https://downloads.example.com/metabase.jar"}]
                      :match_status      "active"
                      :published_at      #t "2026-03-24T00:00:00Z"
                      :updated_at        #t "2026-03-24T00:00:00Z"}]
        (let [response  (mt/user-http-request :crowberto :get 200 "ee/security-center/advisories")
              advisory  (->> response :advisories (some #(when (= "SC-DL-001" (:advisory_id %)) %)))]
          (is (= [{:min "1.58.0" :fixed "1.58.11"}]
                 (:affected_versions advisory)))
          (is (= [{:version "1.58.11" :url "https://downloads.example.com/metabase.jar"}]
                 (:download_jar_urls advisory))))))))

(deftest trial-subscription-gate-test
  (testing "Security Center is not available on trial subscriptions"
    (mt/with-premium-features #{:admin-security-center}
      (mt/with-dynamic-fn-redefs [token-check/is-trial? (constantly true)]
        (testing "GET /api/ee/security-center/advisories returns 402 for trial"
          (is (=? {:message  "Security Center is not available on this instance."
                   :status   "error-premium-feature-not-available"}
                  (mt/user-http-request :crowberto :get 402 "ee/security-center/advisories"))))
        (testing "POST acknowledge returns 402 for trial"
          (is (=? {:message  "Security Center is not available on this instance."
                   :status   "error-premium-feature-not-available"}
                  (mt/user-http-request :crowberto :post 402
                                        "ee/security-center/advisories/SC-0000-001/acknowledge"))))))))

(deftest acknowledge-advisory-test
  (testing "POST /api/ee/security-center/advisories/:id/acknowledge"
    (mt/with-premium-features #{:admin-security-center :audit-app}
      (with-test-advisories!
        (testing "superuser can acknowledge"
          (is (=? {:advisory_id     "SC-0000-001"
                   :acknowledged_at some?
                   :acknowledged_by some?}
                  (mt/user-http-request :crowberto :post 200
                                        "ee/security-center/advisories/SC-0000-001/acknowledge")))
          (testing "creates an audit log entry"
            (is (=? {:topic   :security-advisory-acknowledge
                     :user_id (mt/user->id :crowberto)}
                    (t2/select-one [:model/AuditLog :topic :user_id]
                                   :topic :security-advisory-acknowledge
                                   {:order-by [[:id :desc]]})))))
        (testing "cannot acknowledge twice"
          (mt/user-http-request :crowberto :post 409
                                "ee/security-center/advisories/SC-0000-001/acknowledge"))
        (testing "404 for unknown advisory"
          (mt/user-http-request :crowberto :post 404
                                "ee/security-center/advisories/SC-0000-999/acknowledge"))
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :post 403
                                "ee/security-center/advisories/SC-0000-001/acknowledge"))))))

(deftest acknowledge-advisories-test
  (testing "POST /api/ee/security-center/advisories/acknowledge"
    (mt/with-premium-features #{:admin-security-center :audit-app}
      (testing "superuser can acknowledge multiple advisories"
        (with-test-advisories!
          (let [response (mt/user-http-request :crowberto :post 200
                                               "ee/security-center/advisories/acknowledge"
                                               {:advisory_ids ["SC-0000-001" "SC-0000-002"]})]
            (is (= 2 (count response)))
            (is (every? :acknowledged_at response))
            (is (every? :acknowledged_by response))
            (is (= #{"SC-0000-001" "SC-0000-002"}
                   (set (map :advisory_id response)))))))
      (testing "skips already-acknowledged advisories"
        (with-test-advisories!
          ;; Acknowledge one first
          (mt/user-http-request :crowberto :post 200
                                "ee/security-center/advisories/SC-0000-001/acknowledge")
          ;; Bulk acknowledge including the already-acknowledged one
          (let [response (mt/user-http-request :crowberto :post 200
                                               "ee/security-center/advisories/acknowledge"
                                               {:advisory_ids ["SC-0000-001" "SC-0000-002"]})]
            (is (= 1 (count response)))
            (is (= "SC-0000-002" (-> response first :advisory_id))))))
      (testing "returns empty array when all are already acknowledged"
        (with-test-advisories!
          (mt/user-http-request :crowberto :post 200
                                "ee/security-center/advisories/SC-0000-001/acknowledge")
          (let [response (mt/user-http-request :crowberto :post 200
                                               "ee/security-center/advisories/acknowledge"
                                               {:advisory_ids ["SC-0000-001"]})]
            (is (= [] response)))))
      (testing "returns 400 for empty advisory_ids"
        (mt/user-http-request :crowberto :post 400
                              "ee/security-center/advisories/acknowledge"
                              {:advisory_ids []}))
      (testing "non-superuser gets 403"
        (mt/user-http-request :rasta :post 403
                              "ee/security-center/advisories/acknowledge"
                              {:advisory_ids ["SC-0000-001"]})))))

(deftest sync-endpoint-test
  (testing "POST /api/ee/security-center/advisories/sync"
    (mt/with-premium-features #{:admin-security-center}
      (testing "calling twice only runs sync once"
        (let [call-count (atom 0)
              started    (promise)
              finish     (promise)]
          (with-redefs [premium-features/security-center-enabled? (constantly true)
                        fetch/sync-advisories!
                        (fn []
                          (swap! call-count inc)
                          (deliver started true)
                          @finish)
                        matching/evaluate-all-advisories! (constantly nil)]
            (is (= {:status "started"} (mt/user-http-request :crowberto :post 200 "ee/security-center/advisories/sync")))
            @started
            (is (= {:status "already-in-progress"} (mt/user-http-request :crowberto :post 200 "ee/security-center/advisories/sync")))
            (deliver finish true)
            (is (= 1 @call-count) "sync should only run once despite two API calls"))))
      (testing "non-superuser gets 403"
        (mt/user-http-request :rasta :post 403 "ee/security-center/advisories/sync")))))

(deftest test-notification-test
  (testing "POST /api/ee/security-center/advisories/test-notification"
    (testing "requires premium feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Security Center"
         (mt/user-http-request :crowberto :post 402 "ee/security-center/advisories/test-notification"))))
    (mt/with-premium-features #{:admin-security-center}
      (testing "non-superuser gets 403"
        (mt/user-http-request :rasta :post 403 "ee/security-center/advisories/test-notification"))
      (testing "superuser can send test notification with no body — falls back to saved settings"
        (mt/with-dynamic-fn-redefs [notification/send-test-notification! (constantly nil)]
          (is (= {:success true}
                 (mt/user-http-request :crowberto :post 200 "ee/security-center/advisories/test-notification")))))
      (testing "returns 400 when no channels are configured"
        (mt/with-dynamic-fn-redefs [notification/send-test-notification!
                                    (fn [_] (throw (ex-info "No notification channels are configured."
                                                            {:status-code 400})))]
          (mt/user-http-request :crowberto :post 400 "ee/security-center/advisories/test-notification"))))))

(deftest test-notification-uses-body-test
  (testing "POST /api/ee/security-center/advisories/test-notification forwards the request body so the test reflects unsaved form state"
    (mt/with-premium-features #{:admin-security-center}
      (testing "body values are passed through to send-test-notification!"
        (let [captured (atom nil)]
          (mt/with-dynamic-fn-redefs [notification/send-test-notification! #(reset! captured %)]
            (mt/user-http-request :crowberto :post 200 "ee/security-center/advisories/test-notification"
                                  {:email_recipients [{:type "notification-recipient/raw-value"
                                                       :details {:value "form@example.com"}}
                                                      {:type "notification-recipient/user"
                                                       :user_id (str (mt/user->id :crowberto))}]
                                   :slack_channel    "#form-channel"})
            (is (= [{:type    :notification-recipient/raw-value
                     :details {:value "form@example.com"}}
                    {:type :notification-recipient/user
                     :user_id (mt/user->id :crowberto)}]
                   (:email-recipients @captured)))
            (is (= "#form-channel" (:slack-channel @captured))))))
      (testing "body distinguishes explicit nil slack_channel (disable) from missing key (fall back to setting)"
        (let [captured (atom nil)]
          (mt/with-dynamic-fn-redefs [notification/send-test-notification! #(reset! captured %)
                                      settings/security-center-slack-channel (constantly "#saved-channel")]
            (mt/user-http-request :crowberto :post 200 "ee/security-center/advisories/test-notification"
                                  {:email_recipients [{:type "notification-recipient/group"
                                                       :permissions_group_id 2}]
                                   :slack_channel    nil})
            (is (nil? (:slack-channel @captured)) "explicit nil disables Slack for the test"))
          (mt/with-dynamic-fn-redefs [notification/send-test-notification! #(reset! captured %)
                                      settings/security-center-slack-channel (constantly "#saved-channel")]
            (mt/user-http-request :crowberto :post 200 "ee/security-center/advisories/test-notification"
                                  {:email_recipients [{:type "notification-recipient/group"
                                                       :permissions_group_id 2}]})
            (is (= "#saved-channel" (:slack-channel @captured)) "missing key falls back to saved setting"))))
      (testing "missing email_recipients falls back to saved setting"
        (let [captured       (atom nil)
              saved-emails   [{:type :notification-recipient/raw-value :details {:value "saved@example.com"}}]]
          (mt/with-dynamic-fn-redefs [notification/send-test-notification!         #(reset! captured %)
                                      settings/security-center-email-recipients     (constantly saved-emails)
                                      settings/security-center-slack-channel        (constantly nil)]
            (mt/user-http-request :crowberto :post 200 "ee/security-center/advisories/test-notification" {})
            (is (= saved-emails (:email-recipients @captured)))))))))

;;; Health checks

(defn- fake-health-check
  "A registry entry for the tests, with `overrides` on top. Passes with one item unless told otherwise."
  [& {:as overrides}]
  (merge {:id                :https-redirect
          :severity          :medium
          :title             (deferred-tru "Requests are redirected to HTTPS")
          :description       (deferred-tru "Plain HTTP exposes sessions.")
          :remediation       (deferred-tru "Turn on the redirect in Admin settings.")
          :docs-page         "configuring-metabase/settings"
          :requires-restart? false
          :applicable?       (constantly true)
          :run               (constantly [{:status :pass, :message "Redirect to HTTPS is on"}])}
         overrides))

(def ^:private fake-health-checks
  "Three checks: one that passes, one that does not apply, and one that throws."
  {:https-redirect     (fake-health-check)
   :sso-login          (fake-health-check :id :sso-login, :applicable? (constantly false))
   :session-secret-key (fake-health-check :id                :session-secret-key
                                          :severity          :high
                                          :docs-anchor       "mb_session_secret_key"
                                          :requires-restart? true
                                          :run               #(throw (ex-info "the setting is unreadable" {})))})

(def ^:private passing-health-check
  "What the API returns for the passing check of [[fake-health-checks]]."
  {:id               "https-redirect"
   :severity         "medium"
   :title            "Requests are redirected to HTTPS"
   :description      "Plain HTTP exposes sessions."
   :remediation      "Turn on the redirect in Admin settings."
   :docs             {:page "configuring-metabase/settings"}
   :requires_restart false
   :status           "pass"
   :checked_at       string?
   :items            [{:status "pass", :message "Redirect to HTTPS is on"}]})

(def ^:private throwing-health-check
  "What the API returns for the throwing check of [[fake-health-checks]]: unknown, with the error's message."
  {:id               "session-secret-key"
   :severity         "high"
   :docs             {:page "configuring-metabase/settings", :anchor "mb_session_secret_key"}
   :requires_restart true
   :status           "unknown"
   :checked_at       string?
   :items            [{:status "unknown", :message "Couldn't run this check. Check the server logs for the underlying error."}]})

(deftest list-health-checks-test
  (testing "GET /api/ee/security-center/health-checks"
    (testing "requires premium feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Security Center"
         (mt/user-http-request :crowberto :get 402 "ee/security-center/health-checks"))))
    (mt/with-premium-features #{:admin-security-center}
      (with-redefs [health-checks/checks fake-health-checks]
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :get 403 "ee/security-center/health-checks"))
        (testing "returns the checks that apply, with their results"
          (let [{:keys [checks]} (mt/user-http-request :crowberto :get 200 "ee/security-center/health-checks")]
            (is (= ["https-redirect" "session-secret-key"] (map :id checks))
                "the check that does not apply is left out")
            (is (=? passing-health-check (first checks)))
            (testing "a check that throws is unknown with a message, and the other checks are unaffected"
              (is (=? throwing-health-check (second checks))))))
        (testing "sets the health-checks gauge"
          (mt/with-prometheus-system! [_ system]
            (mt/user-http-request :crowberto :get 200 "ee/security-center/health-checks")
            (is (= 1.0 (mt/metric-value system :metabase-security-center/health-checks
                                        {:check_id "https-redirect", :severity "medium", :status "pass"})))
            (is (= 1.0 (mt/metric-value system :metabase-security-center/health-checks
                                        {:check_id "session-secret-key", :severity "high", :status "unknown"})))))))))

(deftest recheck-health-checks-test
  (testing "POST /api/ee/security-center/health-checks/recheck"
    (testing "requires premium feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Security Center"
         (mt/user-http-request :crowberto :post 402 "ee/security-center/health-checks/recheck"))))
    (mt/with-premium-features #{:admin-security-center}
      (with-redefs [health-checks/checks fake-health-checks]
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :post 403 "ee/security-center/health-checks/recheck"))
        (testing "runs every check that applies again and returns them"
          (let [{:keys [checks]} (mt/user-http-request :crowberto :post 200 "ee/security-center/health-checks/recheck")]
            (is (=? [passing-health-check throwing-health-check] checks))))))))
