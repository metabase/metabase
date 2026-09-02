(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest per-provider-settings-write-through-to-the-connection-test
  (testing (str "The per-provider credential settings are a view over the connection list, so config.yml "
                "provisioning — which just calls setting/set! — keeps working now that the value lives there")
    (mt/with-temporary-setting-values [llm-providers []]
      (setting/set! :llm-anthropic-api-key "sk-ant-config-yml")
      (is (= [{:key    "anthropic"
               :type   "anthropic"
               :name   "Anthropic"
               :config {:api-key "sk-ant-config-yml"}}]
             (vec (llm.settings/llm-providers))))
      (testing "and the getter reads the value back off the connection"
        (is (= "sk-ant-config-yml" (llm.settings/llm-anthropic-api-key))))
      (testing "a second setting for the same provider lands on the same connection"
        (setting/set! :llm-anthropic-api-base-url "https://self-hosted.example")
        (is (= {:api-key "sk-ant-config-yml" :base-url "https://self-hosted.example"}
               (:config (first (llm.settings/llm-providers))))))
      (testing "a blank write clears the field"
        (setting/set! :llm-anthropic-api-base-url "  ")
        (is (= {:api-key "sk-ant-config-yml"}
               (:config (first (llm.settings/llm-providers)))))))))

(deftest per-provider-settings-keep-their-validation-test
  (testing "the registry's field validation runs on writes, the way the settings' old setters validated"
    (mt/with-temporary-setting-values [llm-providers []]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"must start with 'sk-ant-'"
           (setting/set! :llm-anthropic-api-key "not-an-anthropic-key")))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid Region"
           (setting/set! :llm-bedrock-region "mars-north-1")))
      (is (= [] (vec (llm.settings/llm-providers)))))))

(deftest per-provider-settings-read-defaults-and-env-test
  (testing "with no connection, a setting still resolves its registry default"
    (mt/with-temporary-setting-values [llm-providers []]
      (is (= "https://api.anthropic.com" (llm.settings/llm-anthropic-api-base-url)))))
  (testing "an environment value shadows the stored connection's field"
    (mt/with-temporary-setting-values [llm-providers [{:key    "anthropic"
                                                       :type   "anthropic"
                                                       :name   "Anthropic"
                                                       :config {:api-key "sk-ant-stored"}}]]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-key "sk-ant-env"]
        (is (= "sk-ant-env" (llm.settings/llm-anthropic-api-key)))
        (testing "while fields the environment does not supply keep resolving from the connection"
          (is (= "https://api.anthropic.com" (llm.settings/llm-anthropic-api-base-url)))))))
  (testing "an environment value resolves even when no connection exists at all"
    (mt/with-temporary-setting-values [llm-providers []]
      (mt/with-temp-env-var-value! [mb-llm-anthropic-api-base-url "https://env-only.example"]
        (is (= "https://env-only.example" (llm.settings/llm-anthropic-api-base-url)))))))

;;; ------------------------------------------- llm-anthropic-api-key Tests -------------------------------------------

(deftest llm-anthropic-api-key-configured?-test
  (testing "returns false when no API key is set"
    (mt/with-dynamic-fn-redefs [llm.settings/llm-anthropic-api-key (constantly nil)]
      (is (false? (llm.settings/llm-anthropic-api-key-configured?)))))
  (testing "returns true when API key is set"
    (mt/with-temporary-setting-values [llm-anthropic-api-key "sk-ant-test"]
      (is (true? (llm.settings/llm-anthropic-api-key-configured?))))))

;;; ------------------------------------------- Google credential validation -------------------------------------------

(deftest valid-google-project-id?-test
  (testing "accepts a project ID, trimmed of nothing it does not carry"
    (doseq [project-id ["my-project-123" "abcdef" (apply str (repeat 30 "a"))]]
      (testing project-id
        (is (true? (llm.settings/valid-google-project-id? project-id))))))
  (testing "rejects anything that is not one"
    (doseq [project-id [""
                        "My Project"                              ; the project name
                        "123456789012"                            ; the project number
                        "-leading-hyphen"
                        "trailing-hyphen-"
                        "abcde"                                   ; one short
                        (apply str (repeat 31 "a"))               ; one long
                        "https://console.cloud.google.com/my-project"]] ; a pasted URL
      (testing project-id
        (is (false? (llm.settings/valid-google-project-id? project-id))))))
  (testing "rejects a non-string"
    (is (false? (llm.settings/valid-google-project-id? nil)))))

(deftest valid-google-location?-test
  (testing "accepts the locations the platform serves"
    (doseq [location ["global" "us" "eu" "us-central1" "europe-west2"]]
      (testing location
        (is (true? (llm.settings/valid-google-location? location))))))
  (testing "rejects anything that cannot be spliced into a request host"
    (doseq [location [""
                      "us central1"
                      "US-CENTRAL1"
                      "us_central1"
                      "-us-central1"
                      "us-central1-"
                      "https://us-central1-aiplatform.googleapis.com"
                      ;; a DNS label holds 63 characters and `-aiplatform` takes 11 of them
                      (apply str (repeat 53 "a"))]]
      (testing location
        (is (false? (llm.settings/valid-google-location? location)))))))

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
  (testing "cannot be set through the setter at all: it is sysadmin-only"
    (mt/with-premium-features #{:metabot-v3}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting llm-proxy-base-url can only be set by the MB_LLM_PROXY_BASE_URL environment variable"
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
  (testing "cannot be set through the setter at all: it is sysadmin-only"
    (mt/with-premium-features #{:metabase-ai-managed}
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Setting ai-service-base-url can only be set by the MB_AI_SERVICE_BASE_URL environment variable"
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
