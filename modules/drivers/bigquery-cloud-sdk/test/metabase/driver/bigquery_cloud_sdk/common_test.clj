(ns ^:mb/driver-tests metabase.driver.bigquery-cloud-sdk.common-test
  "Unit tests for BigQuery common utility functions, especially credential handling."
  (:require
   [clojure.test :refer :all]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.test.data.interface :as tx])
  (:import
   (com.google.auth.oauth2 GoogleCredentials ServiceAccountCredentials)))

(defn- adc-available?
  "Returns true if Application Default Credentials are available in the current environment."
  []
  (try
    (GoogleCredentials/getApplicationDefault)
    true
    (catch Exception _
      false)))

(set! *warn-on-reflection* true)

(def ^:private fake-credential-config-json
  "A minimal Workload Identity Federation credential configuration JSON for testing."
  (str "{"
       "\"type\": \"external_account\","
       "\"audience\": \"//iam.googleapis.com/projects/123456/locations/global/workloadIdentityPools/test-pool/providers/test-provider\","
       "\"subject_token_type\": \"urn:ietf:params:oauth:token-type:jwt\","
       "\"token_url\": \"https://sts.googleapis.com/v1/token\","
       "\"credential_source\": {\"file\": \"/var/run/secrets/tokens/gcp-token\"}"
       "}"))

(deftest ^:parallel use-application-default-credentials?-test
  (testing "returns true when both credentials are absent"
    (is (true? (bigquery.common/use-application-default-credentials? {})))
    (is (true? (bigquery.common/use-application-default-credentials? {:service-account-json nil
                                                                       :credential-config-json nil})))
    (is (true? (bigquery.common/use-application-default-credentials? {:service-account-json ""
                                                                       :credential-config-json ""}))))
  (testing "returns false when service-account-json is provided"
    (is (false? (bigquery.common/use-application-default-credentials? {:service-account-json "some-json"})))
    (is (false? (bigquery.common/use-application-default-credentials? {:service-account-json "some-json"
                                                                        :credential-config-json nil}))))
  (testing "returns false when credential-config-json is provided"
    (is (false? (bigquery.common/use-application-default-credentials? {:credential-config-json fake-credential-config-json})))
    (is (false? (bigquery.common/use-application-default-credentials? {:service-account-json nil
                                                                        :credential-config-json fake-credential-config-json}))))
  (testing "returns false when both are provided"
    (is (false? (bigquery.common/use-application-default-credentials? {:service-account-json "some-json"
                                                                        :credential-config-json fake-credential-config-json})))))

(deftest get-credentials-priority-test
  (testing "service-account-json takes priority over credential-config-json and ADC"
    (let [sa-called? (atom false)]
      (with-redefs [bigquery.common/service-account-json->service-account-credential
                    (fn [_]
                      (reset! sa-called? true)
                      ::mock-service-account-creds)]
        (let [creds (bigquery.common/get-credentials {:service-account-json "fake-sa-json"
                                                       :credential-config-json fake-credential-config-json})]
          (is @sa-called? "service-account-json->service-account-credential should be called")
          (is (= ::mock-service-account-creds creds))))))
  (testing "credential-config-json is used when service-account-json is empty"
    ;; Since the private function is hard to mock, we verify via error handling
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid credential configuration JSON"
         (bigquery.common/get-credentials {:service-account-json ""
                                            :credential-config-json "invalid json"}))))
  (testing "ADC path is taken when both credentials are empty"
    ;; Skip this test if ADC is available in the environment (e.g., GOOGLE_APPLICATION_CREDENTIALS is set
    ;; or gcloud auth application-default login was run), as the call would succeed instead of throwing.
    (when-not (adc-available?)
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Could not load Application Default Credentials"
           (bigquery.common/get-credentials {:service-account-json ""
                                              :credential-config-json ""}))))))

(deftest ^:parallel database-details->credential-project-id-test
  (testing "returns nil when service-account-json is empty (ADC case)"
    (is (nil? (bigquery.common/database-details->credential-project-id {})))
    (is (nil? (bigquery.common/database-details->credential-project-id {:service-account-json ""})))
    (is (nil? (bigquery.common/database-details->credential-project-id {:service-account-json nil}))))
  (testing "returns nil when using credential-config-json only (WIF case)"
    (is (nil? (bigquery.common/database-details->credential-project-id
               {:credential-config-json fake-credential-config-json})))
    (is (nil? (bigquery.common/database-details->credential-project-id
               {:service-account-json ""
                :credential-config-json fake-credential-config-json})))))

(deftest ^:mb/driver-tests service-account-json-credential-test
  ;; This test only runs when real BigQuery credentials are available
  (when-let [service-account-json (tx/db-test-env-var :bigquery-cloud-sdk :service-account-json)]
    (testing "parses valid service account JSON and extracts project-id"
      (let [creds (bigquery.common/service-account-json->service-account-credential service-account-json)]
        (is (instance? ServiceAccountCredentials creds))
        (is (string? (.getProjectId creds)))
        (is (not (empty? (.getProjectId creds))))))
    (testing "get-credentials returns ServiceAccountCredentials for service-account-json"
      (let [creds (bigquery.common/get-credentials {:service-account-json service-account-json})]
        (is (instance? ServiceAccountCredentials creds))))
    (testing "database-details->credential-project-id extracts project-id from service-account-json"
      (let [project-id (bigquery.common/database-details->credential-project-id
                        {:service-account-json service-account-json})]
        (is (string? project-id))
        (is (not (empty? project-id)))))))

(deftest service-account-json-error-handling-test
  (testing "throws exception for invalid JSON"
    (is (thrown? Exception
                 (bigquery.common/service-account-json->service-account-credential "not valid json"))))
  (testing "throws exception for empty string"
    (is (thrown? Exception
                 (bigquery.common/service-account-json->service-account-credential "")))))
