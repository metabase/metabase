(ns metabase-enterprise.cloud-proxy.api-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase-enterprise.harbormaster.client :as hm.client]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def mock-responses
  {"mb-plan-trial-up-available"
   {:available  true
    :plan-alias "pro-cloud"}

   "mb-plan-trial-up"
   {:status "ok"}

   "mb-plan-change-plan-preview"
   {:amount-due-now      0
    :next-payment-amount 57500
    :next-payment-date   "2026-02-10T12:00:00Z"
    :warnings            nil}

   "mb-plan-change-plan"
   {:instance-status "active"}

   "get-plan"
   {:description           "Metabase Pro Cloud"
    :trial-days            14
    :token-features        ["no-upsell" "whitelabel"]
    :name                  "Metabase Pro Cloud"
    :per-user-price        "$12.00"
    :billing-period-months 1
    :hosting-features      ["custom-domain"]
    :product               "prod_K79Voj2md354w8"
    :alias                 "pro-cloud"
    :can-purchase          true
    :id                    16
    :users-included        10
    :price                 "$575.00"}

   "list-plans"
   [{:id 1 :name "Starter"}
    {:id 2 :name "Pro"}]

   "list-addons"
   [{:id 1 :name "AI Addon"}]})

(defn- mock-hm-call [operation-id _body]
  (get mock-responses operation-id {:operation-id operation-id}))

(deftest hosted-only-test
  (testing "endpoint requires hosted instance"
    (mt/with-premium-features #{} ; not hosted
      (is (= "This endpoint is only available for hosted instances"
             (mt/user-http-request :crowberto :post 400 "ee/cloud-proxy/mb-plan-trial-up-available"))))))

(deftest invalid-operation-test
  (testing "endpoint rejects invalid operation-id"
    (mt/with-premium-features #{:hosting}
      (is (= "Invalid operation-id"
             (mt/user-http-request :crowberto :post 400 "ee/cloud-proxy/invalid-operation"))))))

(deftest superuser-operations-test
  (testing "superuser operations require superuser"
    (mt/with-premium-features #{:hosting}
      (with-redefs [hm.client/call mock-hm-call]
        (doseq [op ["mb-plan-trial-up" "mb-plan-trial-up-available"
                    "mb-plan-change-plan" "mb-plan-change-plan-preview"]]
          (testing (str "operation " op " requires superuser")
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 (str "ee/cloud-proxy/" op)))))))))

  (testing "superuser can access superuser operations"
    (mt/with-premium-features #{:hosting}
      (with-redefs [hm.client/call mock-hm-call]
        (doseq [op ["mb-plan-trial-up" "mb-plan-trial-up-available"
                    "mb-plan-change-plan" "mb-plan-change-plan-preview"]]
          (testing (str "superuser can access " op)
            (is (map? (mt/user-http-request :crowberto :post 200 (str "ee/cloud-proxy/" op))))))))))

(deftest request-key-conversion-test
  (testing "request body keys are converted to kebab-case for harbormaster"
    (mt/with-premium-features #{:hosting}
      (let [received-body (atom nil)]
        (with-redefs [hm.client/call (fn [_op body]
                                       (reset! received-body body)
                                       {:status "ok"})]
          (mt/user-http-request :crowberto :post 200 "ee/cloud-proxy/mb-plan-change-plan-preview"
                                {:new_plan_alias  "pro-cloud"
                                 :force_end_trial true})
          (is (= {:new-plan-alias  "pro-cloud"
                  :force-end-trial true}
                 @received-body)))))))

(deftest response-key-conversion-test
  (testing "response keys are converted to snake_case for frontend"
    (mt/with-premium-features #{:hosting}
      (with-redefs [hm.client/call mock-hm-call]
        (let [resp (mt/user-http-request :crowberto :post 200 "ee/cloud-proxy/mb-plan-trial-up-available")]
          (is (contains? resp :plan_alias))
          (is (not (contains? resp :plan-alias))))

        (let [resp (mt/user-http-request :crowberto :post 200 "ee/cloud-proxy/mb-plan-change-plan-preview")]
          (is (contains? resp :amount_due_now))
          (is (contains? resp :next_payment_date))
          (is (not (contains? resp :amount-due-now))))

        (let [resp (mt/user-http-request :crowberto :post 200 "ee/cloud-proxy/get-plan")]
          (is (contains? resp :per_user_price))
          (is (contains? resp :billing_period_months))
          (is (contains? resp :users_included))
          (is (not (contains? resp :per-user-price))))))))
