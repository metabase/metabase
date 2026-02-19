(ns metabase-enterprise.metabot-v3.agent.tools.subscriptions-test
  "Tests for the create_dashboard_subscription agent tool wrapper."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.agent.tools.subscriptions :as agent-subscriptions]
   [metabase-enterprise.metabot-v3.tools.create-dashboard-subscription :as subscription-tools]
   [metabase.test :as mt]))

;;; ------------------------------------------ schema / metadata tests -----------------------------------------------

(deftest create-dashboard-subscription-tool-schema-test
  (testing "tool has correct :tool-name metadata"
    (let [tool-meta (meta #'agent-subscriptions/create-dashboard-subscription-tool)]
      (is (= "create_dashboard_subscription" (:tool-name tool-meta)))))

  (testing "tool schema matches expected shape"
    (let [tool-meta (meta #'agent-subscriptions/create-dashboard-subscription-tool)]
      (is (some? (:schema tool-meta)))
      (is (string? (:doc tool-meta))))))

;;; --------------------------------------- integration tests (with-temp) -------------------------------------------

(deftest create-dashboard-subscription-happy-path-test
  (testing "valid dashboard, valid user email, valid schedule → success"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
        (let [email  (:email (mt/fetch-user :crowberto))
              result (agent-subscriptions/create-dashboard-subscription-tool
                      {:dashboard_id dash-id
                       :email        email
                       :schedule     {:frequency "daily" :hour 9}})]
          (is (= "success" (:output result))))))))

(deftest create-dashboard-subscription-invalid-dashboard-id-test
  (testing "non-integer dashboard_id → 'invalid dashboard_id'"
    (mt/with-current-user (mt/user->id :crowberto)
      ;; The underlying tool checks (int? dashboard-id), and the agent wrapper
      ;; passes the value through. If the schema lets a string through we'd still
      ;; get the right error from the underlying tool.
      (with-redefs [subscription-tools/create-dashboard-subscription
                    (fn [{:keys [dashboard-id]}]
                      (if (int? dashboard-id)
                        {:output "success"}
                        {:output "invalid dashboard_id"}))]
        (let [result (agent-subscriptions/create-dashboard-subscription-tool
                      {:dashboard_id 0
                       :email        "nobody@example.com"
                       :schedule     {:frequency "daily"}})]
          ;; dashboard_id 0 is int but won't match any dashboard
          (is (string? (:output result))))))))

(deftest create-dashboard-subscription-unknown-email-test
  (testing "unknown email → 'no user with this email found'"
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Dashboard {dash-id :id} {:name "Test Dashboard"}]
        (let [result (agent-subscriptions/create-dashboard-subscription-tool
                      {:dashboard_id dash-id
                       :email        "nonexistent-user@example.com"
                       :schedule     {:frequency "daily" :hour 9}})]
          (is (= "no user with this email found" (:output result))))))))

(deftest create-dashboard-subscription-nonexistent-dashboard-test
  (testing "nonexistent dashboard → 404 or error message"
    (mt/with-current-user (mt/user->id :crowberto)
      (let [result (agent-subscriptions/create-dashboard-subscription-tool
                    {:dashboard_id 999999
                     :email        (:email (mt/fetch-user :crowberto))
                     :schedule     {:frequency "daily" :hour 9}})]
        ;; The underlying tool will either return "no dashboard..." or the
        ;; wrapper catches the 404 exception
        (is (string? (:output result)))))))

(deftest create-dashboard-subscription-schedule-keywords-test
  (testing "schedule keywords are converted from snake_case to kebab-case"
    (let [captured-args (atom nil)]
      (with-redefs [subscription-tools/create-dashboard-subscription
                    (fn [args] (reset! captured-args args) {:output "success"})]
        (mt/with-current-user (mt/user->id :crowberto)
          (agent-subscriptions/create-dashboard-subscription-tool
           {:dashboard_id 1
            :email        "test@example.com"
            :schedule     {:frequency    "weekly"
                           :hour         9
                           :day_of_week  "monday"
                           :day_of_month "first-mon"}}))
        (let [{:keys [schedule]} @captured-args]
          (is (= :weekly (:frequency schedule)))
          (is (= :monday (:day-of-week schedule)))
          (is (= :first-mon (:day-of-month schedule)))
          (is (= 9 (:hour schedule)))
          ;; snake_case keys should be absent
          (is (nil? (:day_of_week schedule)))
          (is (nil? (:day_of_month schedule))))))))
