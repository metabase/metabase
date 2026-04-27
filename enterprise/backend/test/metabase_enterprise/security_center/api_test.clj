(ns metabase-enterprise.security-center.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.security-center.fetch :as fetch]
   [metabase-enterprise.security-center.matching :as matching]
   [metabase-enterprise.security-center.notification :as notification]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
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
  (testing "GET /api/ee/security-center"
    (testing "requires premium feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Security Center"
         (mt/user-http-request :crowberto :get 402 "ee/security-center"))))
    (mt/with-premium-features #{:admin-security-center}
      (with-test-advisories!
        (testing "superuser can list advisories"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/security-center")]
            (is (contains? response :last_checked_at))
            (is (= 3 (count (:advisories response))))
            (is (= "SC-0000-001" (-> response :advisories first :advisory_id)))))
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :get 403 "ee/security-center"))))))

(deftest trial-subscription-gate-test
  (testing "Security Center is not available on trial subscriptions"
    (mt/with-premium-features #{:admin-security-center}
      (with-redefs [token-check/is-trial? (constantly true)]
        (testing "GET /api/ee/security-center returns 402 for trial"
          (is (=? {:message  "Security Center is not available on this instance."
                   :status   "error-premium-feature-not-available"}
                  (mt/user-http-request :crowberto :get 402 "ee/security-center"))))
        (testing "POST acknowledge returns 402 for trial"
          (is (=? {:message  "Security Center is not available on this instance."
                   :status   "error-premium-feature-not-available"}
                  (mt/user-http-request :crowberto :post 402
                                        "ee/security-center/SC-0000-001/acknowledge"))))))))

(deftest acknowledge-advisory-test
  (testing "POST /api/ee/security-center/:id/acknowledge"
    (mt/with-premium-features #{:admin-security-center :audit-app}
      (with-test-advisories!
        (testing "superuser can acknowledge"
          (is (=? {:advisory_id     "SC-0000-001"
                   :acknowledged_at some?
                   :acknowledged_by some?}
                  (mt/user-http-request :crowberto :post 200
                                        "ee/security-center/SC-0000-001/acknowledge")))
          (testing "creates an audit log entry"
            (is (=? {:topic   :security-advisory-acknowledge
                     :user_id (mt/user->id :crowberto)}
                    (t2/select-one [:model/AuditLog :topic :user_id]
                                   :topic :security-advisory-acknowledge
                                   {:order-by [[:id :desc]]})))))
        (testing "cannot acknowledge twice"
          (mt/user-http-request :crowberto :post 409
                                "ee/security-center/SC-0000-001/acknowledge"))
        (testing "404 for unknown advisory"
          (mt/user-http-request :crowberto :post 404
                                "ee/security-center/SC-0000-999/acknowledge"))
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :post 403
                                "ee/security-center/SC-0000-001/acknowledge"))))))

(deftest acknowledge-advisories-test
  (testing "POST /api/ee/security-center/acknowledge"
    (mt/with-premium-features #{:admin-security-center :audit-app}
      (testing "superuser can acknowledge multiple advisories"
        (with-test-advisories!
          (let [response (mt/user-http-request :crowberto :post 200
                                               "ee/security-center/acknowledge"
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
                                "ee/security-center/SC-0000-001/acknowledge")
          ;; Bulk acknowledge including the already-acknowledged one
          (let [response (mt/user-http-request :crowberto :post 200
                                               "ee/security-center/acknowledge"
                                               {:advisory_ids ["SC-0000-001" "SC-0000-002"]})]
            (is (= 1 (count response)))
            (is (= "SC-0000-002" (-> response first :advisory_id))))))
      (testing "returns empty array when all are already acknowledged"
        (with-test-advisories!
          (mt/user-http-request :crowberto :post 200
                                "ee/security-center/SC-0000-001/acknowledge")
          (let [response (mt/user-http-request :crowberto :post 200
                                               "ee/security-center/acknowledge"
                                               {:advisory_ids ["SC-0000-001"]})]
            (is (= [] response)))))
      (testing "returns 400 for empty advisory_ids"
        (mt/user-http-request :crowberto :post 400
                              "ee/security-center/acknowledge"
                              {:advisory_ids []}))
      (testing "non-superuser gets 403"
        (mt/user-http-request :rasta :post 403
                              "ee/security-center/acknowledge"
                              {:advisory_ids ["SC-0000-001"]})))))

(deftest sync-endpoint-test
  (testing "POST /api/ee/security-center/sync"
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
            (is (= {:status "started"} (mt/user-http-request :crowberto :post 200 "ee/security-center/sync")))
            @started
            (is (= {:status "already-in-progress"} (mt/user-http-request :crowberto :post 200 "ee/security-center/sync")))
            (deliver finish true)
            (is (= 1 @call-count) "sync should only run once despite two API calls"))))
      (testing "non-superuser gets 403"
        (mt/user-http-request :rasta :post 403 "ee/security-center/sync")))))

(deftest test-notification-test
  (testing "POST /api/ee/security-center/test-notification"
    (testing "requires premium feature"
      (mt/with-premium-features #{}
        (mt/assert-has-premium-feature-error
         "Security Center"
         (mt/user-http-request :crowberto :post 402 "ee/security-center/test-notification"))))
    (mt/with-premium-features #{:admin-security-center}
      (testing "non-superuser gets 403"
        (mt/user-http-request :rasta :post 403 "ee/security-center/test-notification"))
      (testing "superuser can send test notification"
        (with-redefs [notification/send-test-notification! (constantly nil)]
          (is (= {:success true}
                 (mt/user-http-request :crowberto :post 200 "ee/security-center/test-notification")))))
      (testing "returns 400 when no channels are configured"
        (with-redefs [notification/send-test-notification!
                      (fn [] (throw (ex-info "No notification channels are configured."
                                             {:status-code 400})))]
          (mt/user-http-request :crowberto :post 400 "ee/security-center/test-notification"))))))
