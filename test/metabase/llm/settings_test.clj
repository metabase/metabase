(ns metabase.llm.settings-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting]
   [metabase.test :as mt]
   [metabase.util.http :as u.http])
  (:import
   (java.net InetSocketAddress Proxy Proxy$Type ProxySelector)))

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

;;; ----------------------------------------- llm-allowed-networks Tests -----------------------------------------

(deftest llm-allowed-networks-default-test
  ;; the raw binding clears any stored value, so the default is what is under test
  (mt/with-temporary-raw-setting-values [llm-allowed-networks nil]
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks nil]
      (testing "with nothing configured only public addresses are allowed, hosted or not"
        (mt/with-premium-features #{}
          (is (= :external-only (llm.settings/llm-allowed-networks))))
        (mt/with-premium-features #{:hosting}
          (is (= :external-only (llm.settings/llm-allowed-networks))))))
    (testing "the environment can loosen it"
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
        (is (= :allow-all (llm.settings/llm-allowed-networks))))
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-private"]
        (is (= :allow-private (llm.settings/llm-allowed-networks)))))
    (testing "a value that is not one of the policies fails closed"
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow_all"]
        (is (= :external-only (llm.settings/llm-allowed-networks)))))
    (testing "it is not settable: nobody loosens it through the API"
      (is (thrown? Exception (setting/set! :llm-allowed-networks :allow-all)))))
  (testing "a value that reached the application database some other way is ignored"
    (mt/with-temporary-raw-setting-values [llm-allowed-networks "allow-all"]
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks nil]
        (is (= :external-only (llm.settings/llm-allowed-networks)))))))

(deftest network-policy-floor-test
  (testing "a deployment-controlled endpoint's floor can only loosen the configured policy"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (is (= :external-only (llm.settings/network-policy)))
      (is (= :external-only (llm.settings/network-policy nil)))
      (is (= :allow-private (llm.settings/network-policy :allow-private))))
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
      (is (= :allow-all (llm.settings/network-policy :allow-private))))))

(deftest llm-url-problem-test
  ;; IP literals throughout: `host-allowed-for-network-policy?` resolves hostnames through real DNS
  (testing "under :external-only, internal addresses are refused and public ones are not"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (doseq [url ["http://127.0.0.1:8000/v1"
                   "http://[::1]:8000/v1"
                   "http://169.254.169.254/latest/meta-data/"
                   "http://10.0.0.1/v1"
                   "http://192.168.1.1/v1"]]
        (is (some? (llm.settings/llm-url-problem url)) url))
      (is (nil? (llm.settings/llm-url-problem "https://8.8.8.8/v1")))))
  (testing "the message tells a self-hosted operator which setting to change, and a Cloud admin that there is none"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (mt/with-premium-features #{}
        (is (= (str "The base URL host 10.0.0.1 is on a network Metabase is not allowed to connect to. "
                    "Set MB_LLM_ALLOWED_NETWORKS=allow-private for a server on your private network, "
                    "or allow-all for one on this machine.")
               (llm.settings/llm-url-problem "http://10.0.0.1/v1"))))
      (mt/with-premium-features #{:hosting}
        (is (= (str "The base URL host 10.0.0.1 is on a private network. "
                    "Metabase Cloud can only connect to LLM providers on the public internet.")
               (llm.settings/llm-url-problem "http://10.0.0.1/v1"))))))
  (testing "under :allow-private, private networks pass but loopback and link-local still do not"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-private"]
      (is (nil? (llm.settings/llm-url-problem "http://10.0.0.1/v1")))
      (is (some? (llm.settings/llm-url-problem "http://127.0.0.1:8000/v1")))
      (is (some? (llm.settings/llm-url-problem "http://169.254.169.254/")))))
  (testing "the two-argument form takes the policy to enforce"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (is (nil? (llm.settings/llm-url-problem :allow-private "http://10.0.0.1/v1")))
      (is (some? (llm.settings/llm-url-problem :allow-private "http://127.0.0.1/v1")))))
  (testing "under :allow-all, anything reachable goes"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
      (is (nil? (llm.settings/llm-url-problem "http://127.0.0.1:8000/v1")))
      (is (nil? (llm.settings/llm-url-problem "http://169.254.169.254/")))))
  (testing "a URL that is not http(s), or has no host, is refused under any policy"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
      (doseq [url ["api.openai.com/v1" "ftp://8.8.8.8/v1" "file:///etc/passwd" "http://" "not a url"]]
        (is (re-find #"must start with http" (llm.settings/llm-url-problem url)) url))))
  (testing "credentials in the URL are refused under any policy: they would ride along into error messages"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
      (is (re-find #"username or password" (llm.settings/llm-url-problem "https://svc:s3cret@8.8.8.8/v1")))))
  (testing "a blank URL is not a problem here: the not-configured handling covers it"
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (is (nil? (llm.settings/llm-url-problem nil)))
      (is (nil? (llm.settings/llm-url-problem "  "))))))

(deftest llm-request-opts-test
  ;; IP literals throughout: the resolver goes through real DNS
  (let [resolver (fn [& args] (:dns-resolver (apply llm.settings/llm-request-opts args)))]
    (testing "redirects are disabled under every network policy"
      (doseq [policy ["external-only" "allow-private" "allow-all"]]
        (mt/with-temp-env-var-value! [mb-llm-allowed-networks policy]
          (is (= :none (:redirect-strategy (llm.settings/llm-request-opts "https://8.8.8.8/v1")))))))
    (testing "under :external-only the request gets the policy resolver; no lookup happens here"
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
        (is (instance? org.apache.http.conn.DnsResolver (resolver "http://127.0.0.1:8000/v1")))
        (testing "and it is the resolver that refuses an address the policy does not permit"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"non-permitted"
               (.resolve ^org.apache.http.conn.DnsResolver (resolver "http://127.0.0.1:8000/v1") "127.0.0.1")))
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo #"non-permitted"
               (.resolve ^org.apache.http.conn.DnsResolver (resolver "http://10.0.0.1/v1") "10.0.0.1"))))
        (testing "a floor loosens it for a deployment-controlled endpoint"
          (is (= 1 (alength ^"[Ljava.net.InetAddress;"
                    (.resolve ^org.apache.http.conn.DnsResolver (resolver :allow-private "http://10.0.0.1/v1")
                              "10.0.0.1")))))))
    (testing "under :allow-all there is no policy resolver"
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
        (is (= {:redirect-strategy :none}
               (llm.settings/llm-request-opts "http://127.0.0.1:8000/v1")))))
    (testing "a URL that is not usable at all is refused up front, naming the host but not what else it carried"
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
        (doseq [url ["https://svc:s3cret@8.8.8.8/v1" "8.8.8.8/v1"]]
          (is (=? {:status-code 400
                   :status      400
                   :api-error   true
                   :error-code  :llm-host-not-allowed
                   :llm-host    "8.8.8.8"}
                  (try (llm.settings/llm-request-opts url)
                       (catch clojure.lang.ExceptionInfo e (ex-data e))))
              url))))))

(defn- proxy-selector
  "A `ProxySelector` that answers `proxies` for every URI, the way a JVM configured with `-Dhttps.proxyHost` does."
  ^ProxySelector [proxies]
  (proxy [ProxySelector] []
    (select [_uri] proxies)
    (connectFailed [_uri _sa _ioe] nil)))

(deftest llm-request-opts-behind-a-jvm-proxy-test
  (testing (str "clj-http routes through a JVM-configured proxy, so the connection is opened to the proxy and a "
                "`:dns-resolver` never sees the target: the target host is checked up front instead")
    (mt/with-temp-env-var-value! [mb-llm-allowed-networks "external-only"]
      (binding [u.http/*proxy-selector*
                (proxy-selector [(Proxy. Proxy$Type/HTTP (InetSocketAddress. "10.0.0.9" 3128))])]
        (testing "the proxy is deployment configuration, so a private one is not judged by the policy"
          (is (= {:redirect-strategy :none} (llm.settings/llm-request-opts "https://8.8.8.8/v1"))))
        (testing "and the target behind it still is"
          (is (=? {:status-code 400 :error-code :llm-host-not-allowed :llm-host "10.0.0.1"}
                  (try (llm.settings/llm-request-opts "http://10.0.0.1/v1")
                       (catch clojure.lang.ExceptionInfo e (ex-data e))))))
        (testing "a floor loosens the target check for a deployment-controlled endpoint"
          (is (= {:redirect-strategy :none}
                 (llm.settings/llm-request-opts :allow-private "http://10.0.0.1/v1")))))
      (testing "with the proxy selector answering DIRECT, the resolver does the enforcing as before"
        (binding [u.http/*proxy-selector* (proxy-selector [Proxy/NO_PROXY])]
          (is (instance? org.apache.http.conn.DnsResolver
                         (:dns-resolver (llm.settings/llm-request-opts "http://10.0.0.1/v1")))))))))

(deftest connection-time-network-policy-error-test
  (testing "direct and wrapped DNS policy rejections are recognized and translated to the URL-validation shape"
    (doseq [cause [(ex-info "blocked address" {:ssrf true})
                   (ex-info "HTTP client wrapper" {} (ex-info "blocked address" {:ssrf true}))]]
      (is (true? (llm.settings/llm-network-policy-error? cause)))
      (is (=? {:status-code 400
               :status      400
               :api-error   true
               :error-code  :llm-host-not-allowed
               :llm-host    "rebound.example"}
              (try (llm.settings/rethrow-if-llm-network-policy-error!
                    cause "https://rebound.example/v1")
                   (catch clojure.lang.ExceptionInfo e (ex-data e)))))))
  (testing "unrelated failures pass through the recognizer"
    (let [e (ex-info "provider down" {:status 503})]
      (is (false? (llm.settings/llm-network-policy-error? e)))
      (is (nil? (llm.settings/rethrow-if-llm-network-policy-error! e "https://example.com"))))))

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
