(ns metabase-enterprise.security-center.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private test-advisories
  "Default test advisories covering different severities and match statuses."
  [{:advisory_id       "SC-TEST-001"
    :severity          "critical"
    :title             "Test Critical Advisory"
    :description       "Critical vulnerability in serialization."
    :remediation       "Upgrade to fix."
    :affected_versions [{"min" "1.50.0" "fixed" "1.58.0"}]
    :match_status      "active"
    :published_at      #t "2026-03-24T00:00:00Z"}
   {:advisory_id       "SC-TEST-002"
    :severity          "high"
    :title             "Test High Advisory"
    :description       "SQL injection in Redshift driver."
    :remediation       "Upgrade to fix."
    :affected_versions [{"min" "1.54.0" "fixed" "1.58.8"}]
    :match_status      "resolved"
    :published_at      #t "2026-03-20T00:00:00Z"}
   {:advisory_id       "SC-TEST-003"
    :severity          "medium"
    :title             "Test Medium Advisory"
    :description       "GeoJSON SSRF."
    :remediation       "Upgrade to fix."
    :affected_versions [{"min" "1.50.0" "fixed" "1.58.7"}]
    :match_status      "not_affected"
    :published_at      #t "2026-03-15T00:00:00Z"}])

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
            (is (= "SC-TEST-001" (-> response :advisories first :advisory_id)))))
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :get 403 "ee/security-center"))))))

(deftest acknowledge-advisory-test
  (testing "POST /api/ee/security-center/:id/acknowledge"
    (mt/with-premium-features #{:admin-security-center :audit-app}
      (with-test-advisories!
        (testing "superuser can acknowledge"
          (is (=? {:advisory_id     "SC-TEST-001"
                   :acknowledged_at some?
                   :acknowledged_by some?}
                  (mt/user-http-request :crowberto :post 200
                                        "ee/security-center/SC-TEST-001/acknowledge")))
          (testing "creates an audit log entry"
            (is (=? {:topic   :security-advisory-acknowledge
                     :user_id (mt/user->id :crowberto)}
                    (t2/select-one [:model/AuditLog :topic :user_id]
                                   :topic :security-advisory-acknowledge
                                   {:order-by [[:id :desc]]})))))
        (testing "cannot acknowledge twice"
          (mt/user-http-request :crowberto :post 409
                                "ee/security-center/SC-TEST-001/acknowledge"))
        (testing "404 for unknown advisory"
          (mt/user-http-request :crowberto :post 404
                                "ee/security-center/SC-FAKE/acknowledge"))
        (testing "non-superuser gets 403"
          (mt/user-http-request :rasta :post 403
                                "ee/security-center/SC-TEST-001/acknowledge"))))))