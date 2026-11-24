(ns ^:mb/driver-tests metabase.driver.bigquery-cloud-sdk.common-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.bigquery-cloud-sdk.common :as bigquery.common]
   [metabase.test :as mt])
  (:import
   (com.google.auth.oauth2 AccessToken #_ExternalAccountCredentials GoogleCredentials)))

(set! *warn-on-reflection* true)

;; (def ^:private wif-config
;;   "What `gcloud iam workload-identity-pools create-cred-config` writes for a Kubernetes projected service account
;;   token, as decoded JSON."
;;   {"type"                              "external_account"
;;    "audience"                          (str "//iam.googleapis.com/projects/123456/locations/global/"
;;                                             "workloadIdentityPools/metabase/providers/aks")
;;    "subject_token_type"                "urn:ietf:params:oauth:token-type:jwt"
;;    "token_url"                         "https://sts.googleapis.com/v1/token"
;;    "service_account_impersonation_url" (str "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/"
;;                                             "metabase@my-project.iam.gserviceaccount.com:generateAccessToken")
;;    "credential_source"                 {"file" "/var/run/secrets/tokens/gcp-token"}})

;; credential-config disabled for now until we can confirm it works
;; (deftest ^:parallel credential-config-json->credentials-test
;;   (testing "a Workload Identity Federation configuration becomes external account credentials"
;;     (let [creds (bigquery.common/credential-config-json->credentials (json/encode wif-config))]
;;       (is (instance? ExternalAccountCredentials creds))
;;       (is (= "https://sts.googleapis.com/v1/token"
;;              (.getTokenUrl ^ExternalAccountCredentials creds)))))
;;   (testing "a file that is not JSON"
;;     (is (thrown-with-msg?
;;          clojure.lang.ExceptionInfo
;;          #"not valid JSON"
;;          (bigquery.common/credential-config-json->credentials "{not json"))))
;;   (testing "JSON that is not a credential configuration"
;;     (is (thrown-with-msg?
;;          clojure.lang.ExceptionInfo
;;          #"Could not read the credential configuration file"
;;          (bigquery.common/credential-config-json->credentials "{\"type\": \"something_else\"}"))))
;;   (testing "an executable credential source is refused before the Google library ever sees it"
;;     (is (thrown-with-msg?
;;          clojure.lang.ExceptionInfo
;;          #"executable credential source"
;;          (bigquery.common/credential-config-json->credentials
;;           (json/encode (assoc wif-config "credential_source" {"executable" {"command" "/bin/echo token"}})))))))

(deftest database-details->credentials-test
  ;; (testing "a credential configuration file is used when :auth-mode says so"
  ;;   (is (instance? ExternalAccountCredentials
  ;;                  (bigquery.common/database-details->credentials {:auth-mode "credential-config"
  ;;                                                                  :credential-config-json (json/encode wif-config)}))))
  (testing "the server's Application Default Credentials are used when :auth-mode says so"
    (let [adc (GoogleCredentials/create (AccessToken. "token" nil))]
      (mt/with-dynamic-fn-redefs [bigquery.common/application-default-credentials (constantly adc)]
        (is (identical? adc (bigquery.common/database-details->credentials {:auth-mode "application-default"})))))))

;; (deftest credential-project-id-test
;;   (testing "credentials that carry no project of their own fall back to the server's default project"
;;     (mt/with-temp-system-property! ["GOOGLE_CLOUD_PROJECT" "env-project"]
;;       (is (= "env-project"
;;              (bigquery.common/database-details->credential-project-id
;;               {:auth-mode "credential-config"
;;                :credential-config-json (json/encode wif-config)})))
;;       (is (= "env-project"
;;              (bigquery.common/database-details->credential-project-id
;;               {:auth-mode "credential-config"}))))))

(deftest project-id-fallbacks-test
  (mt/with-dynamic-fn-redefs [bigquery.common/database-details->credential-project-id
                              (fn [{:keys [service-account-json]}]
                                (when service-account-json "creds-project"))]
    (testing "data project: :project-id, then :billing-project-id, then the credentials' project"
      (is (= "data" (bigquery.common/get-project-id {:project-id           "data"
                                                     :billing-project-id   "billing"
                                                     :service-account-json "{}"})))
      (is (= "billing" (bigquery.common/get-project-id {:billing-project-id   "billing"
                                                        :service-account-json "{}"})))
      (is (= "creds-project" (bigquery.common/get-project-id {:service-account-json "{}"}))))
    (testing "billing project: :billing-project-id, then the credentials' project, then the data project"
      (is (= "billing" (bigquery.common/get-billing-project-id {:project-id           "data"
                                                                :billing-project-id   "billing"
                                                                :service-account-json "{}"})))
      (is (= "creds-project" (bigquery.common/get-billing-project-id {:project-id           "data"
                                                                      :service-account-json "{}"})))
      (is (= "data" (bigquery.common/get-billing-project-id {:project-id "data"}))))
    (testing "blank values count as unset"
      (is (= "data" (bigquery.common/get-billing-project-id {:project-id "data", :billing-project-id ""}))))))
