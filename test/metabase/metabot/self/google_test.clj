(ns metabase.metabot.self.google-test
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.llm.test-util :as llm.tu]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.google :as google]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (com.google.auth.oauth2 GoogleCredentials ServiceAccountCredentials)
   (java.io IOException)
   (java.security KeyPairGenerator)
   (java.util Base64)))

(set! *warn-on-reflection* true)

(def ^:private test-private-key-pem
  "PEM of a generated RSA key, so the real credential parser accepts it."
  (delay
    (let [key-pair (.generateKeyPair (doto (KeyPairGenerator/getInstance "RSA")
                                       (.initialize 2048)))]
      (str "-----BEGIN PRIVATE KEY-----\n"
           (.encodeToString (Base64/getMimeEncoder 64 (byte-array [10]))
                            (.getEncoded (.getPrivate key-pair)))
           "\n-----END PRIVATE KEY-----\n"))))

(defn- test-service-account-json
  "A structurally valid service account key JSON for `project-id`."
  [project-id]
  (json/encode {:type           "service_account"
                :project_id     project-id
                :private_key_id "test-key-id"
                :private_key    @test-private-key-pem
                :client_email   (str "metabot-test@" project-id ".iam.gserviceaccount.com")
                :client_id      "123456789012345678901"
                :token_uri      "https://oauth2.googleapis.com/token"}))

;;; The adapter serves a request from the credentials of the connection behind it. These tests bind the
;;; `llm-google-*` settings, which are the environment-configured form of that connection, so the calls below
;;; resolve them into credentials the way `metabase.llm.provider` does before handing them over.

(defn- settings-credentials []
  {:service-account-key (not-empty (llm.settings/llm-google-service-account-key))
   :oauth-access-token  (not-empty (llm.settings/llm-google-oauth-access-token))
   :project-id          (not-empty (llm.settings/llm-google-project-id))
   :location            (not-empty (llm.settings/llm-google-location))
   :base-url            (not-empty (llm.settings/llm-google-api-base-url))})

(defn- with-settings-credentials [opts]
  (update opts :credentials #(or % (settings-credentials))))

(defn- google-raw [opts]
  (google/google-raw (with-settings-credentials opts)))

(defn- list-models
  ([] (list-models {}))
  ([opts] (google/list-models (with-settings-credentials opts))))

(defn- google [opts]
  (google/google (with-settings-credentials opts)))

(deftest context-window-tokens-test
  (testing "returns documented context windows for known Google models"
    (are [model window] (= window (google/context-window-tokens model))
      "google/gemini-3.5-flash" 1048576
      "google/gemini-3.6-flash" 1048576
      "google/gemini-3.7-flash" 1048576
      "google/gemini-unknown"   nil)))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth / HTTP tests
;;; ──────────────────────────────────────────────────────────────────

(deftest google-raw-project-scoped-url-test
  (testing "requests are scoped to projects/{p}/locations/{l}, location defaulting to global, with a Bearer header"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] {:body req})]
        (is (=? {:method  :post
                 :url     (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                               "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")
                 :headers {"Authorization" "Bearer ya29.pasted-access-token"}
                 :body    string?}
                (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-default-model-test
  (testing "a request that does not name a model uses google/gemini-3.5-flash"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] {:body req})]
        (is (=? {:url (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                           "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")}
                (google-raw {:input [{:role :user :content "hi"}]})))))))

(deftest google-raw-request-body-test
  (testing "the request streams its response and carries the streamGenerateContent body as JSON"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] {:body req})]
        (let [req (google-raw {:model "google/gemini-3.5-flash"
                               :input [{:role :user :content "hi"}]})]
          (is (=? {:as      :stream
                   :headers {"Content-Type" "application/json"}}
                  req))
          (is (= {:contents [{:role "user" :parts [{:text "hi"}]}]}
                 (json/decode+kw (:body req)))))))))

(deftest google-raw-regional-location-host-test
  (testing "a regional location is served by its own regional host, which the path must agree with"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            "us-central1"]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] {:body req})]
        (is (=? {:url (str "https://us-central1-aiplatform.googleapis.com/v1/projects/my-project"
                           "/locations/us-central1/publishers/google/models"
                           "/gemini-3.5-flash:streamGenerateContent?alt=sse")}
                (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-multi-region-host-test
  (testing "the us/eu multi-region locations are served by their `rep` host, not the regional spelling"
    (doseq [location ["us" "eu"]]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                         llm.settings/llm-google-service-account-key nil
                                         llm.settings/llm-google-project-id          "my-project"
                                         llm.settings/llm-google-location            location]
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                    debug/capture-stream    (fn [r _] r)
                                    http/request            (fn [req] {:body req})]
          (is (=? {:url (format (str "https://aiplatform.%s.rep.googleapis.com"
                                     "/v1/projects/my-project/locations/%s"
                                     "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")
                                location location)}
                  (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]}))))))))

(deftest google-raw-invalid-location-rejected-test
  (testing "a location that cannot be a host is rejected with its own message"
    ;; the setter rejects these, so only an env var can put one in place
    (doseq [location ["us central1" "us-central1/" "https://us-central1-aiplatform.googleapis.com"]]
      (mt/with-temp-env-var-value! [mb-llm-google-location location]
        (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                           llm.settings/llm-google-service-account-key nil
                                           llm.settings/llm-google-project-id          "my-project"]
          (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
            (let [e (try (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})
                         nil
                         (catch Exception e e))]
              (is (= (str "\"" location "\" is not a valid Google Cloud location. Use a location ID like"
                          " \"us-central1\", or leave it blank to use the global location.")
                     (ex-message e)))
              (is (=? {:api-error   true
                       :status-code 400
                       :error-code  :invalid-location}
                      (ex-data e))))))))))

(deftest effective-location-accepts-served-locations-test
  (testing "the location spellings the platform serves all pass validation"
    (doseq [location ["global" "us" "eu" "us-central1" "europe-west4" "asia-northeast1"]]
      (is (= location (#'google/effective-location {:location location}))))))

(def ^:private invalid-project-id-message
  "The message [[metabase.metabot.self.google/effective-project-id]] throws, less the offending ID."
  (str " is not a valid Google Cloud project ID. Use the project ID — 6 to 30 lowercase letters, digits and"
       " hyphens — rather than the project name or number."))

(deftest google-raw-invalid-project-id-rejected-test
  (testing "a project ID that cannot be a path segment is rejected with its own message"
    ;; the setter rejects these, so only an env var can put one in place
    (doseq [project-id ["my-project/../../evil" "my project" "MY-PROJECT"]]
      (mt/with-temp-env-var-value! [mb-llm-google-project-id project-id]
        (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                           llm.settings/llm-google-service-account-key nil]
          (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
            (let [e (try (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})
                         nil
                         (catch Exception e e))]
              (is (= (str "\"" project-id "\"" invalid-project-id-message)
                     (ex-message e)))
              (is (=? {:api-error   true
                       :status-code 400
                       :error-code  :invalid-project-id}
                      (ex-data e))))))))))

(deftest list-models-invalid-credentials-project-id-rejected-test
  (testing "a connect-time project ID override is validated too"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (let [e (try (list-models {:model       "google/gemini-3.5-flash"
                                 :credentials {:oauth-access-token "ya29.token"
                                               :project-id         "my-project/../../evil"}})
                   nil
                   (catch Exception e e))]
        (is (= (str "\"my-project/../../evil\"" invalid-project-id-message)
               (ex-message e)))
        (is (=? {:api-error   true
                 :status-code 400
                 :error-code  :invalid-project-id}
                (ex-data e)))))))

(deftest google-raw-service-account-json-project-id-rejected-test
  (testing "the project ID carried by a service account key JSON is validated as well"
    (let [sa-key (test-service-account-json "Not-A-Project")]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                         llm.settings/llm-google-service-account-key sa-key
                                         llm.settings/llm-google-project-id          nil]
        (mt/with-dynamic-fn-redefs [http/request                (fn [_] (throw (ex-info "should never be called" {})))
                                    google/fresh-bearer-headers (constantly {"Authorization" "Bearer test-sa-token"})]
          (let [e (try (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})
                       nil
                       (catch Exception e e))]
            (is (= (str "\"Not-A-Project\"" invalid-project-id-message)
                   (ex-message e)))
            (is (=? {:api-error   true
                     :status-code 400
                     :error-code  :invalid-project-id}
                    (ex-data e)))))))))

(deftest google-raw-explicit-base-url-not-derived-test
  (testing "an admin-set base URL is left alone — a regional location does not rewrite it"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            "us-central1"
                                       llm.settings/llm-google-api-base-url        "https://gemini.proxy.example.com"]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] {:body req})]
        (is (=? {:url (str "https://gemini.proxy.example.com/v1/projects/my-project/locations/us-central1"
                           "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")}
                (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-non-google-publisher-model-test
  (testing "the publisher comes from the model ID's {publisher}/{model} qualifier"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] {:body req})]
        (is (=? {:url (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                           "/publishers/anthropic/models/claude-sonnet-4-6:streamGenerateContent?alt=sse")}
                (google-raw {:model "anthropic/claude-sonnet-4-6" :input [{:role :user :content "hi"}]})))))))

(def ^:private bare-model-id-message-re
  "The message [[metabase.metabot.self.google/model-resource-path]] throws for an unqualified model ID."
  #"Invalid Google model \"gemini-3\.5-flash\" — expected a publisher-qualified ID like \"google/gemini-3\.5-flash\"")

(deftest google-raw-bare-model-id-throws-test
  (testing "a bare model ID without a publisher qualifier throws instead of assuming the google publisher"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             bare-model-id-message-re
             (google-raw {:model "gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-blank-model-id-throws-test
  (testing "a model ID with a publisher qualifier but no model segment throws before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid Google model \"google/\""
             (google-raw {:model "google/" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-invalid-model-characters-rejected-test
  (testing "a model whose segments cannot be path segments is rejected before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (doseq [model ["google/../../../v1beta1/evil"
                       "../../../v1beta1/evil"
                       "google/models/gemini-3.5-flash"
                       "google/gemini-3.5-flash?alt=json"
                       "google/gemini-3.5-flash#"
                       "google/gemini 3.5 flash"
                       "Google/gemini-3.5-flash"]]
          (let [e (try (google-raw {:model model :input [{:role :user :content "hi"}]})
                       nil
                       (catch Exception e e))]
            (is (= (str "Invalid Google model " (pr-str model) " — a publisher and model ID can hold only letters,"
                        " digits, and the characters \".\", \"_\", \"-\" and \"@\"")
                   (ex-message e)))
            (is (=? {:api-error   true
                     :status-code 400
                     :error-code  :invalid-model}
                    (ex-data e)))))))))

(deftest google-raw-versioned-partner-model-test
  (testing "the @-versioned model ID that Model Garden partner models use survives validation"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible identity
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [req] {:body req})]
        (is (=? {:url (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                           "/publishers/anthropic/models/claude-sonnet-4-5@20250929:streamGenerateContent?alt=sse")}
                (google-raw {:model "anthropic/claude-sonnet-4-5@20250929"
                             :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-token-without-project-throws-test
  (testing "an OAuth access token without a project ID throws before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Google Cloud project ID is required for the Google provider"
             (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-missing-credentials-test
  (testing "with no credential configured requests throw before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                       llm.settings/llm-google-service-account-key nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"No Google API key is set"
             (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-service-account-bearer-auth-test
  (testing "a service account key authenticates with a Bearer token and with the project ID read from the key JSON"
    (let [sa-key (test-service-account-json "json-project")]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                         llm.settings/llm-google-service-account-key sa-key
                                         llm.settings/llm-google-project-id          nil
                                         llm.settings/llm-google-location            nil]
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible     identity
                                    debug/capture-stream        (fn [r _] r)
                                    http/request                (fn [req] {:body req})
                                    google/fresh-bearer-headers (constantly {"Authorization" "Bearer test-sa-token"})]
          (is (=? {:url     (str "https://aiplatform.googleapis.com/v1/projects/json-project/locations/global"
                                 "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")
                   :headers {"Authorization" "Bearer test-sa-token"}}
                  (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]}))))))))

(deftest google-raw-service-account-explicit-project-wins-test
  (testing "an explicit project ID setting overrides the one embedded in the service account key"
    (let [sa-key (test-service-account-json "json-project")]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                         llm.settings/llm-google-service-account-key sa-key
                                         llm.settings/llm-google-project-id          "explicit-project"
                                         llm.settings/llm-google-location            nil]
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible     identity
                                    debug/capture-stream        (fn [r _] r)
                                    http/request                (fn [req] {:body req})
                                    google/fresh-bearer-headers (constantly {"Authorization" "Bearer test-sa-token"})]
          (is (=? {:url (str "https://aiplatform.googleapis.com/v1/projects/explicit-project/locations/global"
                             "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")}
                  (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]}))))))))

(deftest google-raw-service-account-precedence-over-oauth-token-test
  (testing "a service account key takes precedence over a configured OAuth access token"
    (let [sa-key (test-service-account-json "json-project")]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                         llm.settings/llm-google-service-account-key sa-key
                                         llm.settings/llm-google-project-id          nil
                                         llm.settings/llm-google-location            nil]
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible     identity
                                    debug/capture-stream        (fn [r _] r)
                                    http/request                (fn [req] {:body req})
                                    google/fresh-bearer-headers (constantly {"Authorization" "Bearer test-sa-token"})]
          (is (=? {:headers {"Authorization" "Bearer test-sa-token"}}
                  (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]}))))))))

(deftest parse-service-account-credentials-scope-test
  (testing "service account tokens carry the correct scope"
    (let [^ServiceAccountCredentials creds (#'google/parse-service-account-credentials
                                            (test-service-account-json "scope-project"))]
      (is (= ["https://www.googleapis.com/auth/cloud-platform"]
             (vec (.getScopes creds)))))))

(deftest google-raw-invalid-service-account-key-test
  (testing "a service account key the auth library rejects throws before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                       llm.settings/llm-google-service-account-key "{\"type\": \"service_account\"}"
                                       llm.settings/llm-google-project-id          "my-project"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid Google service account key"
             (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-invalid-service-account-key-status-test
  (testing "a rejected service account key is tagged as a 400 so the connect form shows the message"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                       llm.settings/llm-google-service-account-key "{\"type\": \"service_account\"}"
                                       llm.settings/llm-google-project-id          "my-project"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (let [e (try (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})
                     nil
                     (catch Exception e e))]
          (is (=? {:api-error   true
                   :status-code 400
                   :error-code  :invalid-service-account-key}
                  (ex-data e))))))))

(deftest google-raw-user-credential-key-test
  (testing "a gcloud user credential JSON is rejected"
    (let [user-credential-json (json/encode {:type          "authorized_user"
                                             :client_id     "test-client-id"
                                             :client_secret "test-client-secret"
                                             :refresh_token "1//test-refresh-token"})]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                         llm.settings/llm-google-service-account-key user-credential-json
                                         llm.settings/llm-google-project-id          "my-project"]
        (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
          (let [e (try (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})
                       nil
                       (catch Exception e e))]
            (is (= "This Google credential JSON is not a service account key."
                   (ex-message e)))
            (is (=? {:api-error   true
                     :status-code 400
                     :error-code  :not-a-service-account-key}
                    (ex-data e)))))))))

(deftest google-raw-non-object-service-account-key-test
  (testing "a service account key JSON that is not an object gets the invalid-key message"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                       llm.settings/llm-google-service-account-key "[]"
                                       llm.settings/llm-google-project-id          "my-project"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (let [e (try (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})
                     nil
                     (catch Exception e e))]
          (is (= "Invalid Google service account key" (ex-message e)))
          (is (=? {:api-error   true
                   :status-code 400
                   :error-code  :invalid-service-account-key}
                  (ex-data e))))))))

(deftest google-raw-service-account-credentials-cached-test
  (testing "repeated requests with the same service account key parse it once and reuse the credentials object"
    (let [sa-key (test-service-account-json "sa-credentials-cached-test")
          parses (atom 0)
          orig   (mt/original-fn #'google/parse-service-account-credentials)]
      ;; evict any entry from an earlier run in this JVM, so the test starts with a cache miss
      (memoize/memo-clear! @#'google/cached-service-account-credentials [sa-key])
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                         llm.settings/llm-google-service-account-key sa-key
                                         llm.settings/llm-google-project-id          nil
                                         llm.settings/llm-google-location            nil]
        (mt/with-dynamic-fn-redefs
          [self.core/sse-reducible                  identity
           debug/capture-stream                     (fn [r _] r)
           http/request                             (fn [req] {:body req})
           google/fresh-bearer-headers              (constantly {"Authorization" "Bearer test-sa-token"})
           google/parse-service-account-credentials (fn [json]
                                                      (swap! parses inc)
                                                      (orig json))]
          (dotimes [_ 2]
            (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]}))
          (is (= 1 @parses)))))))

(deftest fresh-bearer-headers-refresh-failure-test
  (testing "an IOException minting an access token surfaces as a friendly api-error"
    (let [creds (proxy [GoogleCredentials] []
                  (refreshIfExpired []
                    (throw (IOException. "invalid_grant: account disabled"))))
          e     (try (#'google/fresh-bearer-headers creds)
                     nil
                     (catch Exception e e))]
      (is (= "Could not obtain a Google access token: invalid_grant: account disabled"
             (ex-message e)))
      (is (=? {:api-error   true
               :status-code 400
               :error-code  :google-token-refresh-failed}
              (ex-data e))
          "the 400 status makes a connect attempt surface this as a credentials error, not a 500"))))

(deftest google-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for the Google provider"
           (google-raw {:model     "google/gemini-3.5-flash"
                        :input     [{:role :user :content "hi"}]
                        :ai-proxy? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; End-to-end stream translation.
;;; ──────────────────────────────────────────────────────────────────

(defn- sse-response-for
  "A stubbed clj-http response whose body is an SSE stream of `events`."
  [events]
  {:status 200
   :body   (java.io.ByteArrayInputStream.
            (.getBytes (str/join (map #(str "data: " (json/encode %) "\n\n") events)) "UTF-8"))})

(defn- aisdk-parts-for!
  "The AISDK parts [[metabase.metabot.self.google/google]] yields for an SSE stream of `events`."
  [events]
  (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                     llm.settings/llm-google-service-account-key nil
                                     llm.settings/llm-google-project-id          "my-project"
                                     llm.settings/llm-google-location            nil]
    (mt/with-dynamic-fn-redefs [debug/capture-stream (fn [r _] r)
                                http/request         (fn [_] (sse-response-for events))]
      (into []
            (self.core/aisdk-xf)
            (google {:model "google/gemini-3.5-flash"
                     :input [{:role :user :content "hi"}]})))))

(deftest google-text-stream-test
  (testing "streamed text off the wire arrives as one coalesced text part with usage"
    (is (=? [{:type :start :id "r1"}
             {:type :text :text "Hello"}
             {:type  :usage
              :model "gemini-3.5-flash"
              :usage {:promptTokens 5 :completionTokens 2}}]
            (aisdk-parts-for!
             [{:responseId "r1" :modelVersion "gemini-3.5-flash"
               :candidates [{:content {:role "model" :parts [{:text "Hel"}]} :index 0}]}
              {:candidates [{:content {:role "model" :parts [{:text "lo"}]}}]}
              {:candidates    [{:content {:role "model" :parts []} :finishReason "STOP"}]
               :usageMetadata {:promptTokenCount 5 :candidatesTokenCount 2 :totalTokenCount 7}}])))))

(deftest google-tool-call-stream-test
  (testing "a streamed functionCall off the wire arrives as a tool-input part with parsed arguments"
    (is (=? [{:type :start :id "r2"}
             {:type      :tool-input
              :function  "get_time"
              :arguments {:tz "UTC"}}
             {:type :usage :usage {:promptTokens 8 :completionTokens 4}}]
            (aisdk-parts-for!
             [{:responseId "r2" :modelVersion "gemini-3.5-flash"
               :candidates [{:content {:role  "model"
                                       :parts [{:functionCall {:name "get_time" :args {:tz "UTC"}}}]}
                             :finishReason "STOP"}]
               :usageMetadata {:promptTokenCount 8 :candidatesTokenCount 4}}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models tests
;;; ──────────────────────────────────────────────────────────────────

(defn- stub-count-tokens
  "An `http/request` stub answering the countTokens probe with a 200, recording every request
  into `calls`."
  [calls]
  (fn [req]
    (swap! calls conj req)
    {:status 200
     :body   (json/encode {:totalTokens 1})}))

(deftest list-models-count-tokens-probe-test
  (testing "list-models validates the candidate model countTokens and returns no models"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (stub-count-tokens calls)]
          (is (= {:models []}
                 (list-models {:model "google/gemini-3.5-flash"})))
          (is (=? [{:method  :post
                    :url     (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                                  "/publishers/google/models/gemini-3.5-flash:countTokens")
                    :headers {"Authorization" "Bearer ya29.pasted-access-token"}
                    :body    (json/encode {:contents [{:role "user" :parts [{:text "hi"}]}]})}]
                  @calls)))))))

(deftest list-models-bare-model-throws-test
  (testing "a bare model ID throws before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             bare-model-id-message-re
             (list-models {:model "gemini-3.5-flash"})))))))

(deftest list-models-defaults-to-saved-model-test
  (testing "without a model in opts the probe runs against the model the saved reference names"
    (llm.tu/with-connections [(llm.tu/connection "google")]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                         llm.settings/llm-google-service-account-key nil
                                         llm.settings/llm-google-project-id          "my-project"
                                         llm.settings/llm-google-location            nil
                                         metabot.settings/llm-metabot-provider       "google/google/gemini-3.6-flash"]
        (let [calls (atom [])]
          (mt/with-dynamic-fn-redefs [http/request (stub-count-tokens calls)]
            (is (= {:models []} (list-models)))
            (is (=? [{:url (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                                "/publishers/google/models/gemini-3.6-flash:countTokens")}]
                    @calls))))))))

(deftest list-models-no-model-skips-probe-test
  (testing "with no candidate model and a non-Google provider configured no call is made"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       metabot.settings/llm-metabot-provider       "anthropic/claude-sonnet-4-6"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (= {:models []} (list-models)))))))

(deftest list-models-explicit-credentials-test
  (testing "credentials in opts override the configured settings"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.saved-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "saved-project"]
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (stub-count-tokens calls)]
          (is (= {:models []}
                 (list-models {:model       "google/gemini-3.5-flash"
                               :credentials {:oauth-access-token "ya29.override-token"
                                             :project-id         "other-project"
                                             :location           "europe-west1"}})))
          (is (=? [{:url     (str "https://europe-west1-aiplatform.googleapis.com/v1/projects/other-project"
                                  "/locations/europe-west1/publishers/google/models/gemini-3.5-flash:countTokens")
                    :headers {"Authorization" "Bearer ya29.override-token"}}]
                  @calls)))))))

(deftest list-models-multi-region-location-test
  (testing "list-models reaches a multi-region location through its `rep` host"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            "eu"]
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (stub-count-tokens calls)]
          (is (= {:models []} (list-models {:model "google/gemini-3.5-flash"})))
          (is (=? [{:url (str "https://aiplatform.eu.rep.googleapis.com/v1/projects/my-project/locations/eu"
                              "/publishers/google/models/gemini-3.5-flash:countTokens")}]
                  @calls)))))))

(deftest list-models-service-account-credentials-test
  (testing "a service account key in the provided credentials is used"
    (let [sa-key (test-service-account-json "sa-project")
          calls  (atom [])]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  nil
                                         llm.settings/llm-google-service-account-key nil
                                         llm.settings/llm-google-project-id          nil]
        (mt/with-dynamic-fn-redefs [google/fresh-bearer-headers (constantly {"Authorization" "Bearer test-sa-token"})
                                    http/request                (stub-count-tokens calls)]
          (is (= {:models []}
                 (list-models {:model       "google/gemini-3.6-flash"
                               :credentials {:service-account-key sa-key}})))
          (is (=? [{:method  :post
                    :url     (str "https://aiplatform.googleapis.com/v1/projects/sa-project/locations/global"
                                  "/publishers/google/models/gemini-3.6-flash:countTokens")
                    :headers {"Authorization" "Bearer test-sa-token"}}]
                  @calls)))))))

(deftest list-models-missing-project-id-status-test
  (testing "the missing project ID message is tagged as a 400"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (let [e (try (list-models {:model       "google/gemini-3.5-flash"
                                 :credentials {:oauth-access-token "ya29.token"}})
                   nil
                   (catch Exception e e))]
        (is (=? {:api-error   true
                 :status-code 400
                 :error-code  :project-id-required}
                (ex-data e)))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for the Google provider"
           (list-models {:model "google/gemini-3.5-flash" :ai-proxy? true}))))))

(def ^:private ^String html-404-body
  "The HTML body the Google front end serves for a 404 from a host that does not exist."
  "<!DOCTYPE html> <html lang=en> <title>Error 404 (Not Found)!!1</title>")

(deftest list-models-html-404-hints-invalid-location-test
  (testing "the HTML 404 is replaced with a location hint and the full endpoint"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            "nowhere1"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 (throw (ex-info "clj-http: status 404"
                                                                 {:status  404
                                                                  :headers {"content-type" "text/html; charset=UTF-8"}
                                                                  :body    html-404-body})))]
        (let [e (try (list-models {:model "google/gemini-3.5-flash"}) nil (catch Exception e e))]
          (is (= (str "Google API endpoint is unavailable or the model was not found "
                      "(endpoint: https://nowhere1-aiplatform.googleapis.com) — "
                      "check that \"nowhere1\" is a valid location")
                 (ex-message e)))
          (is (str/includes? (-> e ex-cause ex-cause ex-data :body) "<!DOCTYPE html>")
              "the original HTML body survives on the cause chain"))))))

(deftest list-models-json-404-with-location-keeps-upstream-message-test
  (testing "a 404 with JSON body preserves the upstream message"
    (let [upstream-message "Publisher Model was not found or your project does not have access to it."]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.token"
                                         llm.settings/llm-google-service-account-key nil
                                         llm.settings/llm-google-project-id          "my-project"
                                         llm.settings/llm-google-location            "us-central1"]
        (mt/with-dynamic-fn-redefs
          [http/request (fn [_]
                          (throw (ex-info "clj-http: status 404"
                                          {:status  404
                                           :headers {"content-type" "application/json; charset=UTF-8"}
                                           :body    (json/encode
                                                     {:error {:code    404
                                                              :message upstream-message
                                                              :status  "NOT_FOUND"}})})))]
          (let [e (try (list-models {:model "google/gemini-3.5-flash"}) nil (catch Exception e e))]
            (is (= (str "Google API endpoint is unavailable or the model was not found "
                        "(endpoint: https://us-central1-aiplatform.googleapis.com) — "
                        upstream-message)
                   (ex-message e)))))))))

(deftest list-models-501-names-endpoint-test
  (testing "the 501 an unavailable-API location serves maps to a location message naming the endpoint"
    (let [upstream-message "Operation is not implemented, or supported, or enabled."]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.token"
                                         llm.settings/llm-google-service-account-key nil
                                         llm.settings/llm-google-project-id          "my-project"
                                         llm.settings/llm-google-location            "us-west8"]
        (mt/with-dynamic-fn-redefs
          [http/request (fn [_]
                          (throw (ex-info "clj-http: status 501"
                                          {:status  501
                                           :headers {"content-type" "application/json; charset=UTF-8"}
                                           :body    (json/encode
                                                     {:error {:code    501
                                                              :message upstream-message
                                                              :status  "UNIMPLEMENTED"}})})))]
          (let [e (try (list-models {:model "google/gemini-3.5-flash"}) nil (catch Exception e e))]
            (is (= (str "Google API is not available in this location "
                        "(endpoint: https://us-west8-aiplatform.googleapis.com) — "
                        upstream-message)
                   (ex-message e)))))))))

(deftest google-raw-html-404-hints-invalid-location-test
  (testing "the streaming call maps a wrong-location HTML 404 to the endpoint/location hint too"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            "nowhere1"]
      (mt/with-dynamic-fn-redefs
        [http/request (fn [_]
                        (throw (ex-info "clj-http: status 404"
                                        {:status  404
                                         :headers {"content-type" "text/html; charset=UTF-8"}
                                         :body    (java.io.ByteArrayInputStream.
                                                   (.getBytes html-404-body))})))]
        (let [e (try (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})
                     nil
                     (catch Exception e e))]
          (is (= (str "Google API endpoint is unavailable or the model was not found "
                      "(endpoint: https://nowhere1-aiplatform.googleapis.com) — "
                      "check that \"nowhere1\" is a valid location")
                 (ex-message e))))))))

(deftest list-models-invalid-request-maps-to-google-error-test
  (testing "a 400 from the countTokens probe surfaces the canonical message with the upstream detail"
    (let [upstream-message "Request contains an invalid argument."]
      (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.bad-token"
                                         llm.settings/llm-google-service-account-key nil
                                         llm.settings/llm-google-project-id          "my-project"]
        (mt/with-dynamic-fn-redefs
          [http/request (fn [_]
                          (throw (ex-info "clj-http: status 400"
                                          {:status  400
                                           :headers {"content-type" "application/json"}
                                           :body    (json/encode
                                                     {:error {:code    400
                                                              :message upstream-message
                                                              :status  "INVALID_ARGUMENT"}})})))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Google API rejected the request as invalid — Request contains an invalid argument\."
               (list-models {:model "google/gemini-3.5-flash"}))))))))

(deftest list-models-error-status-messages-test
  (testing "credential and quota statuses map to their canonical messages"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.test-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"]
      (doseq [[status pattern]
              [[401 #"Google API credentials expired or invalid"]
               [403 #"Google API credentials have insufficient permissions or the API is not enabled for this project"]
               [429 #"Google API has rate limited us"]]]
        (testing (str "HTTP " status)
          (mt/with-dynamic-fn-redefs
            [http/request (fn [_]
                            (throw (ex-info (str "clj-http: status " status)
                                            {:status  status
                                             :headers {"content-type" "application/json"}
                                             :body    (json/encode {:error {:code status}})})))]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 pattern
                 (list-models {:model "google/gemini-3.5-flash"})))))))))
