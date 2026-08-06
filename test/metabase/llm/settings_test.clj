(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------- llm-anthropic-api-key Setter Tests -------------------------------------------

(deftest llm-anthropic-api-key-setter-test
  (testing "accepts valid sk-ant- key and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
      (mt/discard-setting-changes [llm-anthropic-api-key]
        (llm.settings/llm-anthropic-api-key! "  sk-ant-abc123  ")
        (is (= "sk-ant-abc123" (llm.settings/llm-anthropic-api-key))))))
  (testing "rejects keys without sk-ant- prefix"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid Anthropic API key format"
         (llm.settings/llm-anthropic-api-key! "invalid-key"))))
  (testing "empty/nil clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key nil]
      (mt/discard-setting-changes [llm-anthropic-api-key]
        (llm.settings/llm-anthropic-api-key! "sk-ant-abc123")
        (llm.settings/llm-anthropic-api-key! "")
        (is (nil? (llm.settings/llm-anthropic-api-key)))))))

;;; ------------------------------------------- llm-anthropic-api-key-configured? Tests -------------------------------------------

(deftest llm-anthropic-api-key-configured?-test
  (testing "returns false when no API key is set"
    (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (is (false? (llm.settings/llm-anthropic-api-key-configured?)))))
  (testing "returns true when API key is set"
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
      (is (true? (llm.settings/llm-anthropic-api-key-configured?))))))

;;; ------------------------------------------- llm-google-project-id Setter Tests -------------------------------------------

(deftest llm-google-project-id-setter-accepts-valid-id-test
  (testing "accepts a project ID and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-google-project-id nil]
      (mt/discard-setting-changes [llm-google-project-id]
        (llm.settings/llm-google-project-id! "  my-project-123  ")
        (is (= "my-project-123" (llm.settings/llm-google-project-id)))))))

(deftest llm-google-project-id-setter-accepts-length-boundaries-test
  (testing "accepts the shortest and longest project IDs Google allows"
    (mt/with-temp-env-var-value! [mb-llm-google-project-id nil]
      (mt/discard-setting-changes [llm-google-project-id]
        (doseq [project-id ["abc123" (apply str "a" (repeat 29 "b"))]]
          (llm.settings/llm-google-project-id! project-id)
          (is (= project-id (llm.settings/llm-google-project-id))))))))

(deftest llm-google-project-id-setter-rejects-malformed-id-test
  (testing "rejects a value that is not a project ID"
    (doseq [project-id ["My Project"                                    ; spaces and uppercase
                        "MY-PROJECT"                                    ; uppercase
                        "1234567890"                                    ; the project number
                        "abc"                                           ; shorter than 6 characters
                        (apply str "a" (repeat 30 "b"))                 ; longer than 30 characters
                        "-my-project"                                   ; does not start with a letter
                        "my-project-"                                   ; ends with a hyphen
                        "my_project"                                    ; underscores are not allowed
                        "projects/my-project"                           ; the resource name
                        "https://console.cloud.google.com/my-project"]] ; a pasted URL
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"is not a valid Google Cloud project ID"
           (llm.settings/llm-google-project-id! project-id))))))

(deftest llm-google-project-id-setter-rejected-value-not-stored-test
  (testing "a rejected value leaves the stored project ID alone"
    (mt/with-temp-env-var-value! [mb-llm-google-project-id nil]
      (mt/discard-setting-changes [llm-google-project-id]
        (llm.settings/llm-google-project-id! "my-project-123")
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"\"My Project\" is not a valid Google Cloud project ID"
             (llm.settings/llm-google-project-id! "My Project")))
        (is (= "my-project-123" (llm.settings/llm-google-project-id)))))))

(deftest llm-google-project-id-setter-clears-on-blank-test
  (testing "a whitespace-only value clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-google-project-id nil]
      (mt/discard-setting-changes [llm-google-project-id]
        (llm.settings/llm-google-project-id! "my-project-123")
        (llm.settings/llm-google-project-id! "   ")
        (is (nil? (llm.settings/llm-google-project-id)))))))

;;; ------------------------------------------- llm-google-location Setter Tests -------------------------------------------

(deftest llm-google-location-setter-accepts-served-locations-test
  (testing "accepts the location spellings the platform serves, and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-google-location nil]
      (mt/discard-setting-changes [llm-google-location]
        (doseq [location ["global" "us" "eu" "us-central1" "europe-west4" "asia-northeast1"]]
          (llm.settings/llm-google-location! (str "  " location "  "))
          (is (= location (llm.settings/llm-google-location))))))))

(deftest llm-google-location-setter-rejects-malformed-location-test
  (testing "rejects a value that cannot be a request host"
    (doseq [location ["us central1"                                     ; a space
                      "us\tcentral1"                                    ; a tab
                      "us\ncentral1"                                    ; a newline
                      "US-CENTRAL1"                                     ; uppercase
                      "us-central1/"                                    ; a slash
                      "us_central1"                                     ; an underscore
                      "locations/us-central1"                           ; the resource name
                      "https://us-central1-aiplatform.googleapis.com"]] ; a pasted URL
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"is not a valid Google Cloud location"
           (llm.settings/llm-google-location! location))))))

(deftest llm-google-location-setter-rejects-malformed-dns-label-test
  (testing "rejects a value that is not a well-formed DNS label"
    (doseq [location ["-us-central1"                      ; a leading hyphen
                      "us-central1-"                      ; a trailing hyphen
                      "-"                                 ; a lone hyphen
                      "us--central1"                      ; consecutive hyphens
                      "1us-central"]]                     ; a leading digit
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"is not a valid Google Cloud location"
           (llm.settings/llm-google-location! location))))))

(deftest llm-google-location-setter-rejects-overlong-location-test
  (testing "rejects a value too long to be a DNS label once the -aiplatform suffix is added"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"is not a valid Google Cloud location"
         (llm.settings/llm-google-location! (apply str (repeat 53 "a")))))))

(deftest llm-google-location-setter-rejected-value-not-stored-test
  (testing "a rejected value leaves the stored location alone"
    (mt/with-temp-env-var-value! [mb-llm-google-location nil]
      (mt/discard-setting-changes [llm-google-location]
        (llm.settings/llm-google-location! "us-central1")
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"\"us central1\" is not a valid Google Cloud location"
             (llm.settings/llm-google-location! "us central1")))
        (is (= "us-central1" (llm.settings/llm-google-location)))))))

(deftest llm-google-location-setter-clears-on-blank-test
  (testing "a whitespace-only value clears the setting, falling back to the global location"
    (mt/with-temp-env-var-value! [mb-llm-google-location nil]
      (mt/discard-setting-changes [llm-google-location]
        (llm.settings/llm-google-location! "us-central1")
        (llm.settings/llm-google-location! "   ")
        (is (nil? (llm.settings/llm-google-location)))))))

;;; ------------------------------------------- llm-google-api-base-url Setter Tests -------------------------------------------

(deftest llm-google-api-base-url-setter-test
  (testing "trims whitespace and trailing slashes"
    (mt/with-temp-env-var-value! [mb-llm-google-api-base-url nil]
      (mt/discard-setting-changes [llm-google-api-base-url]
        (llm.settings/llm-google-api-base-url! "  https://proxy.example.com/aiplatform/  ")
        (is (= "https://proxy.example.com/aiplatform" (llm.settings/llm-google-api-base-url))))))
  (testing "blank restores the default global host"
    (mt/with-temp-env-var-value! [mb-llm-google-api-base-url nil]
      (mt/discard-setting-changes [llm-google-api-base-url]
        (llm.settings/llm-google-api-base-url! "https://proxy.example.com/aiplatform")
        (llm.settings/llm-google-api-base-url! "   ")
        (is (= "https://aiplatform.googleapis.com" (llm.settings/llm-google-api-base-url)))))))

;;; ------------------------------------------- llm-bedrock-configured? Tests -------------------------------------------

(deftest llm-bedrock-configured?-test
  (testing "returns false when neither credential is set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id nil
                                       llm-bedrock-secret-access-key nil]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns false when only the access key id is set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key nil]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns false when only the secret access key is set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id nil
                                       llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns false when a credential is blank rather than absent"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id "   "
                                       llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (is (false? (llm.settings/llm-bedrock-configured?)))))
  (testing "returns true when both credentials are set"
    (mt/with-temporary-setting-values [llm-bedrock-access-key-id "AKIAIOSFODNN7EXAMPLE"
                                       llm-bedrock-secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"]
      (is (true? (llm.settings/llm-bedrock-configured?))))))

;;; ------------------------------------------- llm-bedrock credential Setter Tests -------------------------------------------

(deftest llm-bedrock-access-key-id-setter-accepts-valid-key-test
  (testing "accepts a valid access key ID and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-access-key-id nil]
      (mt/discard-setting-changes [llm-bedrock-access-key-id]
        (llm.settings/llm-bedrock-access-key-id! "  AKIAIOSFODNN7EXAMPLE  ")
        (is (= "AKIAIOSFODNN7EXAMPLE" (llm.settings/llm-bedrock-access-key-id)))))))

(deftest llm-bedrock-access-key-id-setter-clears-on-empty-test
  (testing "empty/nil clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-access-key-id nil]
      (mt/discard-setting-changes [llm-bedrock-access-key-id]
        (llm.settings/llm-bedrock-access-key-id! "AKIAIOSFODNN7EXAMPLE")
        (llm.settings/llm-bedrock-access-key-id! "")
        (is (nil? (llm.settings/llm-bedrock-access-key-id)))))))

(deftest llm-bedrock-secret-access-key-setter-accepts-valid-key-test
  (testing "accepts a secret access key and trims surrounding whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-secret-access-key nil]
      (mt/discard-setting-changes [llm-bedrock-secret-access-key]
        (llm.settings/llm-bedrock-secret-access-key! "  wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY  ")
        (is (= "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest llm-bedrock-secret-access-key-setter-clears-on-blank-test
  (testing "a whitespace-only value clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-secret-access-key nil]
      (mt/discard-setting-changes [llm-bedrock-secret-access-key]
        (llm.settings/llm-bedrock-secret-access-key! "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY")
        (llm.settings/llm-bedrock-secret-access-key! "   ")
        (is (nil? (llm.settings/llm-bedrock-secret-access-key)))))))

(deftest llm-bedrock-session-token-setter-accepts-valid-token-test
  (testing "accepts a session token and trims surrounding whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-session-token nil]
      (mt/discard-setting-changes [llm-bedrock-session-token]
        (llm.settings/llm-bedrock-session-token! "  AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT+FvwqnKwRcOIfrRh3c/LTo6UDdyJwOOvEVPvLXCrrrUtdnniCEXAMPLE=  ")
        (is (= "AQoEXAMPLEH4aoAH0gNCAPyJxz4BlCFFxWNE1OPTgk5TthT+FvwqnKwRcOIfrRh3c/LTo6UDdyJwOOvEVPvLXCrrrUtdnniCEXAMPLE="
               (llm.settings/llm-bedrock-session-token)))))))

;;; ------------------------------------------- llm-bedrock-region Setter Tests -------------------------------------------

(deftest llm-bedrock-region-setter-accepts-known-region-test
  (testing "accepts a known AWS region and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-region nil]
      (mt/discard-setting-changes [llm-bedrock-region]
        (llm.settings/llm-bedrock-region! "  us-west-2  ")
        (is (= "us-west-2" (llm.settings/llm-bedrock-region)))))))

(deftest llm-bedrock-region-setter-rejects-unknown-region-test
  (testing "rejects a region not in the AWS SDK's known set"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid AWS region \"evil\.example/\?x=\""
         (llm.settings/llm-bedrock-region! "evil.example/?x=")))))

(deftest llm-bedrock-region-setter-clears-on-empty-test
  (testing "empty/nil clears the setting, falling back to the default"
    (mt/with-temp-env-var-value! [mb-llm-bedrock-region nil]
      (mt/discard-setting-changes [llm-bedrock-region]
        (llm.settings/llm-bedrock-region! "us-west-2")
        (llm.settings/llm-bedrock-region! "")
        (is (= "us-east-1" (llm.settings/llm-bedrock-region)))))))

;;; ------------------------------------------- llm-azure setting Setter Tests -------------------------------------------

(deftest llm-azure-api-key-setter-test
  (testing "accepts an unprefixed Azure data-plane key and trims whitespace"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-key nil]
      (mt/discard-setting-changes [llm-azure-api-key]
        (llm.settings/llm-azure-api-key! "  2QyICJz8sExampleDataPlaneKey  ")
        (is (= "2QyICJz8sExampleDataPlaneKey" (llm.settings/llm-azure-api-key))))))
  (testing "empty/nil clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-key nil]
      (mt/discard-setting-changes [llm-azure-api-key]
        (llm.settings/llm-azure-api-key! "2QyICJz8sExampleDataPlaneKey")
        (llm.settings/llm-azure-api-key! "")
        (is (nil? (llm.settings/llm-azure-api-key)))))))

(deftest llm-azure-api-base-url-setter-test
  (testing "trims whitespace and trailing slashes"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-base-url nil]
      (mt/discard-setting-changes [llm-azure-api-base-url]
        (llm.settings/llm-azure-api-base-url! "  https://my-resource.services.ai.azure.com/openai///  ")
        (is (= "https://my-resource.services.ai.azure.com/openai"
               (llm.settings/llm-azure-api-base-url))))))
  (testing "is otherwise persisted exactly as entered, with no silent rewriting"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-base-url nil]
      (mt/discard-setting-changes [llm-azure-api-base-url]
        (llm.settings/llm-azure-api-base-url! "https://my-resource.services.ai.azure.com/api/projects/my-project")
        (is (= "https://my-resource.services.ai.azure.com/api/projects/my-project"
               (llm.settings/llm-azure-api-base-url))))))
  (testing "blank clears the setting"
    (mt/with-temp-env-var-value! [mb-llm-azure-api-base-url nil]
      (mt/discard-setting-changes [llm-azure-api-base-url]
        (llm.settings/llm-azure-api-base-url! "https://my-resource.services.ai.azure.com/openai")
        (llm.settings/llm-azure-api-base-url! "   ")
        (is (nil? (llm.settings/llm-azure-api-base-url)))))))

(deftest ^:parallel normalize-llm-base-url-test
  (is (= "https://x.example/openai" (llm.settings/normalize-llm-base-url "  https://x.example/openai/  ")))
  (is (= "https://x.example" (llm.settings/normalize-llm-base-url "https://x.example///")))
  (is (nil? (llm.settings/normalize-llm-base-url "   ")))
  (is (nil? (llm.settings/normalize-llm-base-url nil)))
  (is (nil? (llm.settings/normalize-llm-base-url "///"))))

;;; ------------------------------------------- Chat Completions base-URL Setter Tests -------------------------------------------

;;; Adapters build request URLs as `(str base-url path)`, so a pasted trailing slash would produce `//models`.

(deftest llm-zai-api-base-url-setter-test
  (testing "trims whitespace and trailing slashes"
    (mt/with-temp-env-var-value! [mb-llm-zai-api-base-url nil]
      (mt/discard-setting-changes [llm-zai-api-base-url]
        (llm.settings/llm-zai-api-base-url! "  https://api.z.ai/api/paas/v4/  ")
        (is (= "https://api.z.ai/api/paas/v4" (llm.settings/llm-zai-api-base-url))))))
  (testing "blank restores the default"
    (mt/with-temp-env-var-value! [mb-llm-zai-api-base-url nil]
      (mt/discard-setting-changes [llm-zai-api-base-url]
        (llm.settings/llm-zai-api-base-url! "https://self-hosted.example/v4")
        (llm.settings/llm-zai-api-base-url! "   ")
        (is (= "https://api.z.ai/api/paas/v4" (llm.settings/llm-zai-api-base-url)))))))

(deftest llm-mistral-api-base-url-setter-test
  (testing "trims whitespace and trailing slashes"
    (mt/with-temp-env-var-value! [mb-llm-mistral-api-base-url nil]
      (mt/discard-setting-changes [llm-mistral-api-base-url]
        (llm.settings/llm-mistral-api-base-url! "  https://api.mistral.ai/v1/  ")
        (is (= "https://api.mistral.ai/v1" (llm.settings/llm-mistral-api-base-url))))))
  (testing "blank restores the default"
    (mt/with-temp-env-var-value! [mb-llm-mistral-api-base-url nil]
      (mt/discard-setting-changes [llm-mistral-api-base-url]
        (llm.settings/llm-mistral-api-base-url! "https://self-hosted.example/v1")
        (llm.settings/llm-mistral-api-base-url! "   ")
        (is (= "https://api.mistral.ai/v1" (llm.settings/llm-mistral-api-base-url)))))))

(deftest llm-moonshot-api-base-url-setter-test
  (testing "trims whitespace and trailing slashes"
    (mt/with-temp-env-var-value! [mb-llm-moonshot-api-base-url nil]
      (mt/discard-setting-changes [llm-moonshot-api-base-url]
        (llm.settings/llm-moonshot-api-base-url! "  https://api.moonshot.ai/v1/  ")
        (is (= "https://api.moonshot.ai/v1" (llm.settings/llm-moonshot-api-base-url))))))
  (testing "blank restores the default"
    (mt/with-temp-env-var-value! [mb-llm-moonshot-api-base-url nil]
      (mt/discard-setting-changes [llm-moonshot-api-base-url]
        ;; The `.cn` platform is the reason this setting is repointable at all.
        (llm.settings/llm-moonshot-api-base-url! "https://api.moonshot.cn/v1")
        (llm.settings/llm-moonshot-api-base-url! "   ")
        (is (= "https://api.moonshot.ai/v1" (llm.settings/llm-moonshot-api-base-url)))))))

;;; ------------------------------------------- llm-proxy-base-url Feature Guard Tests -------------------------------------------

(deftest llm-proxy-base-url-feature-guard-test
  (testing "can be set and read when :metabase-ai-managed feature is enabled"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example"]
        (is (= "https://proxy.example" (llm.settings/llm-proxy-base-url)))
        (testing "returns default (nil) when :metabase-ai-managed feature is not enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/llm-proxy-base-url))))))))
  (testing "can be set and read when :metabot-v3 feature is enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [llm-proxy-base-url "https://proxy.example"]
        (is (= "https://proxy.example" (llm.settings/llm-proxy-base-url)))
        (testing "returns default (nil) when neither managed-ai feature is enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/llm-proxy-base-url))))))))
  (testing "cannot be set when neither managed-ai feature is enabled"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting llm-proxy-base-url is not enabled"
           (llm.settings/llm-proxy-base-url! "https://proxy.example"))))))

(deftest ai-service-base-url-feature-guard-test
  (testing "can be set and read when :metabase-ai-managed feature is enabled"
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [ai-service-base-url "https://ai-service.example"]
        (is (= "https://ai-service.example" (llm.settings/ai-service-base-url)))
        (testing "returns default (nil) when :metabase-ai-managed feature is not enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/ai-service-base-url))))))))
  (testing "can be set and read when :metabot-v3 feature is enabled"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [ai-service-base-url "https://ai-service.example"]
        (is (= "https://ai-service.example" (llm.settings/ai-service-base-url)))
        (testing "returns default (nil) when neither managed-ai feature is enabled, even if a value is set"
          (mt/with-premium-features #{}
            (is (nil? (llm.settings/ai-service-base-url))))))))
  (testing "cannot be set when neither managed-ai feature is enabled"
    (mt/with-premium-features #{}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting ai-service-base-url is not enabled"
           (llm.settings/ai-service-base-url! "https://ai-service.example"))))))

;;; ------------------------------------------- assert-llm-host-allowed! Tests -------------------------------------------

(deftest assert-llm-host-allowed!-test
  (testing "is a no-op outside of e2e mode, even for a real provider URL"
    (with-redefs [config/is-e2e? false]
      (is (nil? (llm.settings/assert-llm-host-allowed! "https://api.anthropic.com")))))
  (testing "in e2e mode"
    (with-redefs [config/is-e2e? true]
      (testing "allows localhost / loopback URLs (the e2e mock LLM server)"
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://localhost:6123")))
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://127.0.0.1:6123")))
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://LOCALHOST:6123/v1/messages"))))
      (testing "allows IPv6 loopback URLs"
        ;; `java.net.URL.getHost` returns IPv6 hosts wrapped in brackets, so the
        ;; whitelist's `[::1]` entry is the one a URL can actually hit; the bare
        ;; `::1` entry is belt-and-braces for hosts arriving without brackets.
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://[::1]:6123")))
        (is (nil? (llm.settings/assert-llm-host-allowed! "http://[::1]:6123/v1/messages")))
        (is (contains? @#'llm.settings/loopback-hosts "::1")
            "the bracket-less IPv6 loopback form stays whitelisted"))
      (testing "throws for any non-localhost URL so we never hit a real provider"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"non-localhost"
             (llm.settings/assert-llm-host-allowed! "https://api.anthropic.com")))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"non-localhost"
             (llm.settings/assert-llm-host-allowed! "http://host.docker.internal:6123"))))
      (testing "fails closed with the friendly message for malformed URLs instead of throwing raw"
        (doseq [url ["not-a-url" "example.com/v1"]]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Refusing to send an LLM request"
               (llm.settings/assert-llm-host-allowed! url))
              url)
          (is (= {:status-code 400 :llm-url url}
                 (try (llm.settings/assert-llm-host-allowed! url)
                      (catch clojure.lang.ExceptionInfo e (ex-data e)))))))
      (testing "is a no-op for blank / nil URLs (lets normal not-configured handling run)"
        (is (nil? (llm.settings/assert-llm-host-allowed! nil)))
        (is (nil? (llm.settings/assert-llm-host-allowed! "")))))))

;;; ------------------------------------------- Settings Defaults Tests -------------------------------------------

(deftest llm-max-tokens-test
  (testing "default value is 4096"
    (mt/with-temporary-setting-values [llm-max-tokens nil]
      (is (= 4096 (llm.settings/llm-max-tokens)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-max-tokens 8192]
      (is (= 8192 (llm.settings/llm-max-tokens))))))

(deftest llm-request-timeout-ms-test
  (testing "default value is 120000 (120 seconds)"
    (mt/with-temporary-setting-values [llm-request-timeout-ms nil]
      (is (= 120000 (llm.settings/llm-request-timeout-ms)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-request-timeout-ms 30000]
      (is (= 30000 (llm.settings/llm-request-timeout-ms))))))

(deftest llm-connection-timeout-ms-test
  (testing "default value is 10000 (10 seconds)"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms nil]
      (is (= 10000 (llm.settings/llm-connection-timeout-ms)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-connection-timeout-ms 3000]
      (is (= 3000 (llm.settings/llm-connection-timeout-ms))))))

(deftest llm-rate-limit-per-user-test
  (testing "default value is 20 requests per minute"
    (mt/with-temporary-setting-values [llm-rate-limit-per-user nil]
      (is (= 20 (llm.settings/llm-rate-limit-per-user)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-rate-limit-per-user 50]
      (is (= 50 (llm.settings/llm-rate-limit-per-user))))))

(deftest llm-rate-limit-per-ip-test
  (testing "default value is 100 requests per minute"
    (mt/with-temporary-setting-values [llm-rate-limit-per-ip nil]
      (is (= 100 (llm.settings/llm-rate-limit-per-ip)))))
  (testing "can be overridden"
    (mt/with-temporary-setting-values [llm-rate-limit-per-ip 200]
      (is (= 200 (llm.settings/llm-rate-limit-per-ip))))))
