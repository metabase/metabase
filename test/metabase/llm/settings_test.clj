(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private per-provider-credential-settings
  "The settings [[metabase.llm.provider]] reads a connection out of when they are set by an environment variable."
  [:llm-anthropic-api-key :llm-anthropic-api-base-url
   :llm-openai-api-key :llm-openai-api-base-url
   :llm-openrouter-api-key :llm-openrouter-api-base-url
   :llm-mistral-api-key :llm-mistral-api-base-url
   :llm-zai-api-key :llm-zai-api-base-url
   :llm-azure-api-key :llm-azure-api-base-url
   :llm-bedrock-access-key-id :llm-bedrock-secret-access-key
   :llm-bedrock-session-token :llm-bedrock-region])

(deftest per-provider-credential-settings-are-read-only-test
  (testing (str "These configure a connection only from an environment variable, which is resolved on every read. A "
                "write lands in the app DB where nothing reads it, so it is rejected rather than silently accepted — "
                "connections are managed through the /api/llm/providers endpoints.")
    (doseq [setting-k per-provider-credential-settings]
      (testing setting-k
        (is (thrown-with-msg?
             UnsupportedOperationException
             #"read-only setting"
             (setting/set! setting-k "whatever")))))))

;;; ------------------------------------------- llm-anthropic-api-key Tests -------------------------------------------

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

;;; ------------------------------------------- llm-bedrock credential Setter Tests -------------------------------------------

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
