(ns metabase.embedding-hub.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.test :as mt]))

(def ^:private edition-features
  ;; A community build can never carry a token, and faking one here would make the checklist
  ;; query the enterprise models that build does not ship.
  (if config/ee-available? #{:embedding} #{}))

(deftest has-user-created-models-test
  (testing "has-user-created-models? correctly handles multiple sample collections (metabase#64627)"
    (mt/with-premium-features edition-features
      (mt/with-temp [:model/Collection sample-collection-1 {:name "Sample Collection 1" :is_sample true}
                     :model/Collection sample-collection-2 {:name "Sample Collection 2" :is_sample true}
                     :model/Card user-model {:name "User Model"
                                             :type "model"
                                             :archived false
                                             :collection_id nil
                                             :dataset_query {:database (mt/id)
                                                             :type :query
                                                             :query {:source-table (mt/id :venues)}}}
                     :model/Card _sample-model-1 {:name "Sample Model 1"
                                                  :type "model"
                                                  :archived false
                                                  :collection_id (:id sample-collection-1)
                                                  :dataset_query {:database (mt/id)
                                                                  :type :query
                                                                  :query {:source-table (mt/id :venues)}}}
                     :model/Card _sample-model-2 {:name "Sample Model 2"
                                                  :type "model"
                                                  :archived false
                                                  :collection_id (:id sample-collection-2)
                                                  :dataset_query {:database (mt/id)
                                                                  :type :query
                                                                  :query {:source-table (mt/id :venues)}}}]
        (testing "returns true when there is a model not in any sample collection"
          (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
            (is (true? (get-in response [:checklist :create-models]))
                "Should detect the user model with nil collection_id")))
        (testing "returns false when all models are in sample collections"
          ;; Temporarily archive the user model so only sample collection models remain active
          (mt/with-temp-vals-in-db :model/Card (:id user-model) {:archived true}
            (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
              (is (false? (get-in response [:checklist :create-models]))
                  "Should exclude models in both sample collections"))))))))

(deftest checklist-access-test
  (mt/id) ;; force the app-db's own database row to exist so add-data resolves deterministically
  (testing "served without a licence -- unlicensed admins see the guide, and its upsell is aimed at them"
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Card _ {:enable_embedding true}]
        (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
          (testing "completion is real rather than all-false"
            (is (true? (get-in response [:checklist :create-test-embed]))))
          (testing "steps reading a paid feature report false rather than erroring"
            (is (false? (get-in response [:checklist :configure-row-column-security])))
            (is (false? (get-in response [:checklist :sso-configured]))))))))
  (testing "non-admins are rejected -- the response reports instance setup state"
    (doseq [features [#{} #{:embedding}]]
      (mt/with-premium-features features
        (mt/user-http-request :rasta :get 403 "/embedding-hub/checklist")))))

(deftest community-build-checklist-test
  (when-not config/ee-available?
    (mt/id) ;; force the app-db's own database row to exist so add-data resolves deterministically
    (testing "a community build answers rather than failing on models it does not ship"
      (let [response (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")]
        (testing "every enterprise-backed step reports false"
          (doseq [step [:configure-row-column-security
                        :sso-configured
                        :create-tenants
                        :setup-data-segregation-strategy
                        :data-permissions-and-enable-tenants]]
            (is (false? (get-in response [:checklist step]))
                (str (name step) " should be false without enterprise code"))))
        (testing "no data isolation strategy is active"
          (is (nil? (:data-isolation-strategy response))))))))

(deftest create-custom-theme-checklist-test
  (mt/with-premium-features edition-features
    (let [ck (fn [] (get-in (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")
                            [:checklist :create-custom-theme]))]
      (testing "false when no themes exist"
        (is (false? (ck))))
      (testing "a seeded theme does not count as the admin's own"
        (mt/with-temp [:model/EmbeddingTheme _ {:name "Light" :settings {} :is_default true}]
          (is (false? (ck)))))
      (testing "a theme the admin created does"
        (mt/with-temp [:model/EmbeddingTheme _ {:name "Brand" :settings {} :is_default false}]
          (is (true? (ck))))))))

(deftest configure-ai-checklist-test
  (mt/with-premium-features edition-features
    (let [ck (fn [] (get-in (mt/user-http-request :crowberto :get 200 "/embedding-hub/checklist")
                            [:checklist :configure-ai]))]
      (testing "false without provider credentials"
        (is (false? (ck))))
      ;; The default provider is anthropic, so its key is what makes
      ;; `llm-metabot-configured?` -- a computed setting -- report true.
      (testing "true once the provider is configured"
        (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
          (is (true? (ck)))))
      (testing "false when embedded Metabot is off, even with credentials"
        (mt/with-temporary-setting-values [llm-anthropic-api-key    "sk-ant-test"
                                           embedded-metabot-enabled? false]
          (is (false? (ck)))))
      (testing "false when AI features are off entirely"
        (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"
                                           ai-features-enabled?  false]
          (is (false? (ck))))))))
