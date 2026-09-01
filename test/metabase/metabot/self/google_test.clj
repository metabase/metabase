(ns metabase.metabot.self.google-test
  (:require
   [clj-http.client :as http]
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.google :as google]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (com.google.auth.oauth2 GoogleCredentials ServiceAccountCredentials)
   (java.io IOException)
   (java.net SocketTimeoutException)
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

(deftest context-window-tokens-anthropic-test
  (testing "an Anthropic partner model takes the window the Messages API adapter records for its model,
           including when the platform dates it in the `@` spelling"
    (are [model window] (= window (google/context-window-tokens model))
      "anthropic/claude-fable-5"            1000000
      "anthropic/claude-opus-5"             1000000
      "anthropic/claude-opus-4-6"           1000000
      "anthropic/claude-sonnet-5"           1000000
      "anthropic/claude-sonnet-4-6"         1000000
      "anthropic/claude-haiku-4-5@20251001"  200000
      "anthropic/claude-unknown"            nil)))

(deftest context-window-tokens-unqualified-test
  (testing "a model with no publisher qualifier is not treated as an Anthropic one"
    (is (nil? (google/context-window-tokens "claude-sonnet-4-6")))
    (is (nil? (google/context-window-tokens nil)))))

(deftest context-window-tokens-unsupported-publisher-test
  (testing "an unsupported publisher answers nil rather than throwing"
    (is (nil? (google/context-window-tokens "mistralai/mistral-large")))
    (is (nil? (google/context-window-tokens "Google/gemini-3.5-flash")))))

(deftest every-offered-model-has-a-context-window-test
  (testing "every model the provider registry offers has a context window under the id the registry uses"
    (is (= [] (into []
                    (comp (map :id)
                          (remove google/context-window-tokens))
                    (llm.provider/fixed-models "google"))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth / HTTP tests
;;; ──────────────────────────────────────────────────────────────────

(deftest google-raw-project-scoped-url-test
  (testing "requests are scoped to projects/{p}/locations/{l}, location defaulting to global, with a Bearer header"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
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
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
        (is (=? {:url (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                           "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")}
                (google-raw {:input [{:role :user :content "hi"}]})))))))

(deftest google-raw-request-body-test
  (testing "the request streams its response and carries the streamGenerateContent body as JSON"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
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
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
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
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                    self.core/reducible-with-api-errors (fn [r _ _] r)
                                    debug/capture-stream                (fn [r _] r)
                                    http/request                        (fn [req] {:body req})]
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
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
        (is (=? {:url (str "https://gemini.proxy.example.com/v1/projects/my-project/locations/us-central1"
                           "/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse")}
                (google-raw {:model "google/gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-unsupported-publisher-rejected-test
  (testing "a Model Garden publisher this adapter cannot speak to is rejected rather than sent a Gemini body"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (doseq [model ["mistralai/mistral-large"
                       "meta/llama-4-scout"
                       "qwen/qwen3-next"
                       "Google/gemini-3.5-flash"
                       "../../../v1beta1/evil"]]
          (let [e (try (google-raw {:model model :input [{:role :user :content "hi"}]})
                       nil
                       (catch Exception e e))]
            (is (= (str "Unsupported Google model " (pr-str model)
                        ". Only google/* and anthropic/* models are supported.")
                   (ex-message e)))
            (is (=? {:api-error   true
                     :status-code 400
                     :error-code  :unsupported-model
                     :model       model}
                    (ex-data e)))))))))

(deftest list-models-unsupported-publisher-rejected-test
  (testing "connecting rejects an unsupported publisher before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unsupported Google model \"mistralai/mistral-large\"\. Only google/\* and anthropic/\* models are supported\."
             (list-models {:model "mistralai/mistral-large"})))))))

(deftest google-raw-anthropic-model-stream-raw-predict-test
  (testing "an anthropic model is served by its own streamRawPredict method rather than streamGenerateContent"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
        (is (=? {:method  :post
                 :url     (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                               "/publishers/anthropic/models/claude-sonnet-4-6:streamRawPredict")
                 :headers {"Authorization" "Bearer ya29.pasted-access-token"}}
                (google-raw {:model "anthropic/claude-sonnet-4-6" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-anthropic-request-body-test
  (testing "an anthropic model gets the Anthropic Messages body, with the model in the URL instead of the body and
           the platform's pinned anthropic_version in its place"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
        (let [req  (google-raw {:model  "anthropic/claude-haiku-4-5@20251001"
                                :system "You are terse."
                                :input  [{:role :user :content "hi"}]})
              body (json/decode+kw (:body req))]
          (is (=? {:as      :stream
                   :headers {"Content-Type" "application/json"}}
                  req))
          (is (=? {:anthropic_version "vertex-2023-10-16"
                   :stream            true
                   :messages          [{:role "user" :content [{:type "text" :text "hi"}]}]
                   :system            [{:type "text" :text "You are terse." :cache_control {:type "ephemeral"}}]}
                  body))
          (is (not (contains? body :model))
              "the URL names the model; a model in the body is rejected by the platform"))))))

(deftest google-raw-anthropic-max-tokens-test
  (testing "the Anthropic model whitelist supplies max_tokens for a bare current-generation ID, and the @-versioned
           spelling of a dated ID resolves to the same entry the direct Anthropic adapter uses"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
        (doseq [[model max-tokens] {"anthropic/claude-sonnet-4-6"          128000
                                    "anthropic/claude-fable-5"             128000
                                    "anthropic/claude-haiku-4-5@20251001"   64000}]
          (testing model
            (is (= max-tokens
                   (:max_tokens (json/decode+kw (:body (google-raw {:model model
                                                                    :input [{:role :user :content "hi"}]}))))))))))))

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
                       "google/models/gemini-3.5-flash"
                       "google/gemini-3.5-flash?alt=json"
                       "google/gemini-3.5-flash#"
                       "google/gemini 3.5 flash"
                       "anthropic/claude sonnet 4-6"]]
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
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                  self.core/reducible-with-api-errors (fn [r _ _] r)
                                  debug/capture-stream                (fn [r _] r)
                                  http/request                        (fn [req] {:body req})]
        (is (=? {:url (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                           "/publishers/anthropic/models/claude-sonnet-4-5@20250929:streamRawPredict")}
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
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                    self.core/reducible-with-api-errors (fn [r _ _] r)
                                    debug/capture-stream                (fn [r _] r)
                                    http/request                        (fn [req] {:body req})
                                    google/fresh-bearer-headers         (constantly {"Authorization" "Bearer test-sa-token"})]
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
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                    self.core/reducible-with-api-errors (fn [r _ _] r)
                                    debug/capture-stream                (fn [r _] r)
                                    http/request                        (fn [req] {:body req})
                                    google/fresh-bearer-headers         (constantly {"Authorization" "Bearer test-sa-token"})]
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
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                    self.core/reducible-with-api-errors (fn [r _ _] r)
                                    debug/capture-stream                (fn [r _] r)
                                    http/request                        (fn [req] {:body req})
                                    google/fresh-bearer-headers         (constantly {"Authorization" "Bearer test-sa-token"})]
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
  ([events] (aisdk-parts-for! "google/gemini-3.5-flash" events))
  ([model events]
   (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                      llm.settings/llm-google-service-account-key nil
                                      llm.settings/llm-google-project-id          "my-project"
                                      llm.settings/llm-google-location            nil]
     (mt/with-dynamic-fn-redefs [debug/capture-stream (fn [r _] r)
                                 http/request         (fn [_] (sse-response-for events))]
       (into []
             (self.core/aisdk-xf)
             (google {:model model
                      :input [{:role :user :content "hi"}]}))))))

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

(deftest google-anthropic-text-stream-test
  (testing "an anthropic model's SSE events off the wire are translated by the Claude chunk translation"
    (is (=? [{:type :start :id "msg_vrtx_011"}
             {:type :text :text "Hello"}
             {:type  :usage
              :model "claude-haiku-4-5-20251001"
              :usage {:promptTokens 17 :completionTokens 5}}]
            (aisdk-parts-for!
             "anthropic/claude-haiku-4-5@20251001"
             [{:type "message_start" :message {:id    "msg_vrtx_011"
                                               :model "claude-haiku-4-5-20251001"
                                               :usage {:input_tokens 17 :output_tokens 1}}}
              {:type "content_block_start" :index 0 :content_block {:type "text" :text ""}}
              {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "Hel"}}
              {:type "content_block_delta" :index 0 :delta {:type "text_delta" :text "lo"}}
              {:type "content_block_stop" :index 0}
              {:type "message_delta"
               :delta {:stop_reason "end_turn"}
               :usage {:input_tokens 17 :output_tokens 5}}
              {:type "message_stop"}])))))

(deftest google-anthropic-tool-call-stream-test
  (testing "an anthropic model's streamed tool_use block arrives as a tool-input part with parsed arguments"
    (is (=? [{:type :start :id "msg_vrtx_012"}
             {:type      :tool-input
              :function  "get_time"
              :arguments {:tz "UTC"}}
             {:type :usage :usage {:promptTokens 8 :completionTokens 4}}]
            (aisdk-parts-for!
             "anthropic/claude-haiku-4-5@20251001"
             [{:type "message_start" :message {:id    "msg_vrtx_012"
                                               :model "claude-haiku-4-5-20251001"
                                               :usage {:input_tokens 8 :output_tokens 1}}}
              {:type "content_block_start" :index 0 :content_block {:type "tool_use"
                                                                    :id   "toolu_01"
                                                                    :name "get_time"}}
              {:type "content_block_delta" :index 0 :delta {:type "input_json_delta" :partial_json "{\"tz\":"}}
              {:type "content_block_delta" :index 0 :delta {:type "input_json_delta" :partial_json "\"UTC\"}"}}
              {:type "content_block_stop" :index 0}
              {:type "message_delta"
               :delta {:stop_reason "tool_use"}
               :usage {:input_tokens 8 :output_tokens 4}}
              {:type "message_stop"}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; reasoning-model? tests
;;; ──────────────────────────────────────────────────────────────────

(deftest reasoning-model?-anthropic-test
  (testing "an Anthropic partner model reasons when the Messages API adapter says its model does"
    (is (true? (google/reasoning-model? "anthropic/claude-sonnet-4-6")))
    (is (false? (google/reasoning-model? "anthropic/claude-haiku-4-5")))))

(deftest reasoning-model?-anthropic-platform-spelling-test
  (testing "a dated partner model is recognized in the platform's `@` spelling"
    (is (true? (google/reasoning-model? "anthropic/claude-sonnet-4-6@20250929")))
    (is (false? (google/reasoning-model? "anthropic/claude-haiku-4-5@20251001")))))

(deftest reasoning-model?-gemini-test
  (testing "Gemini sends thinking only as :thought parts, which the adapter drops"
    (is (false? (google/reasoning-model? "google/gemini-3.5-flash")))
    (is (false? (google/reasoning-model? "google/gemini-3.6-pro")))))

(deftest reasoning-model?-unqualified-test
  (testing "a model with no publisher qualifier is not treated as an Anthropic one"
    (is (false? (google/reasoning-model? "claude-sonnet-4-6")))
    (is (false? (google/reasoning-model? nil)))))

(deftest reasoning-model?-unsupported-publisher-test
  (testing "an unsupported publisher answers false rather than throwing"
    (is (false? (google/reasoning-model? "mistralai/mistral-large")))
    (is (false? (google/reasoning-model? "Google/gemini-3.5-flash")))))

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

(def ^:private anthropic-validation-error-body
  "Anthropic error for empty probe body when the request reached the model."
  (json/encode {:type  "error"
                :error {:type "invalid_request_error" :message "messages: Field required"}}))

(def ^:private not-servable-in-region-body
  "Google's error envelope for a model the location does not serve."
  (json/encode {:error {:code    400
                        :message (str "Publisher Model `projects/my-project/locations/us-central1/publishers/anthropic"
                                      "/models/claude-haiku-4-5@20251001` is not servable in region us-central1.")
                        :status  "FAILED_PRECONDITION"}}))

(defn- stub-error
  "An `http/request` stub that throws an exception with `status` and `body`, recording every request into `calls`."
  [calls status body]
  (fn [req]
    (swap! calls conj req)
    (throw (ex-info (str "clj-http: status " status)
                    {:status  status
                     :headers {"content-type" "application/json"}
                     :body    body}))))

(deftest list-models-anthropic-empty-body-probe-test
  (testing "an anthropic model is probed by posting an empty body to its own streamRawPredict route"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (stub-error calls 400 anthropic-validation-error-body)]
          (is (= {:models []}
                 (list-models {:model "anthropic/claude-haiku-4-5@20251001"})))
          (is (=? [{:method  :post
                    :url     (str "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global"
                                  "/publishers/anthropic/models/claude-haiku-4-5@20251001:streamRawPredict")
                    :headers {"Authorization" "Bearer ya29.pasted-access-token"}
                    :body    "{}"}]
                  @calls)))))))

(deftest list-models-anthropic-spends-no-tokens-test
  (testing "the anthropic probe body names no messages, so it cannot reach inference"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (let [calls (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (stub-error calls 400 anthropic-validation-error-body)]
          (list-models {:model "anthropic/claude-haiku-4-5@20251001"})
          (is (= {} (json/decode+kw (:body (first @calls))))))))))

(deftest list-models-anthropic-not-servable-in-region-rejected-test
  (testing "a 400 in Google's error format means the location does not serve the model, and is surfaced"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            "us-central1"]
      (mt/with-dynamic-fn-redefs [http/request (stub-error (atom []) 400 not-servable-in-region-body)]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Google API rejected the request as invalid"
             (list-models {:model "anthropic/claude-haiku-4-5@20251001"})))))))

(deftest list-models-anthropic-model-not-found-rejected-test
  (testing "a 404 for a model this project cannot reach is surfaced rather than swallowed"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (stub-error (atom []) 404 (json/encode {:error {:code 404 :message "Publisher model was not found"}}))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Google API endpoint is unavailable or the model was not found"
             (list-models {:model "anthropic/claude-sonnet-4-6"})))))))

(deftest list-models-anthropic-unauthenticated-rejected-test
  (testing "a 401 from an expired credential is surfaced rather than read as a model verdict"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.expired"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (stub-error (atom []) 401 (json/encode {:error {:code 401 :message "invalid authentication credentials"}}))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Google API credentials expired or invalid"
             (list-models {:model "anthropic/claude-haiku-4-5@20251001"})))))))

(deftest list-models-anthropic-unexpected-success-accepted-test
  (testing "a 2xx also proves the model resolved, even though the empty body should never earn one"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body "{}"})]
        (is (= {:models []}
               (list-models {:model "anthropic/claude-haiku-4-5@20251001"})))))))

(deftest list-models-anthropic-probe-uses-inference-method-test
  (testing "the probe and inference hit the same streamRawPredict verb, so the probe validates what will run"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (let [probe-calls     (atom [])
            inference-calls (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (stub-error probe-calls 400 anthropic-validation-error-body)]
          (list-models {:model "anthropic/claude-haiku-4-5@20251001"}))
        (mt/with-dynamic-fn-redefs [self.core/sse-reducible             identity
                                    self.core/reducible-with-api-errors (fn [r _ _] r)
                                    debug/capture-stream                (fn [r _] r)
                                    http/request                        (fn [req] (swap! inference-calls conj req) {:body req})]
          (google-raw {:model "anthropic/claude-haiku-4-5@20251001" :input [{:role :user :content "hi"}]}))
        (is (= (:url (first @inference-calls))
               (:url (first @probe-calls))))))))

(deftest list-models-anthropic-invalid-model-rejected-test
  (testing "an anthropic model whose ID cannot be a path segment is rejected before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid Google model \"anthropic/claude bad model\""
             (list-models {:model "anthropic/claude bad model"})))))))

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

(deftest list-models-no-model-skips-probe-test
  (testing "with no candidate model there is nothing to probe and no call is made"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (= {:models []} (list-models)))))))

(deftest list-models-reports-the-probed-model-test
  (testing "the model the probe verified is reported back, for the connection to be re-verified against later"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (stub-count-tokens (atom []))]
        (is (= {:models         []
                :learned-config {:probed-model "google/gemini-3.5-flash"}}
               (list-models {:model "google/gemini-3.5-flash" :probe? true})))))))

(deftest list-models-anthropic-reports-the-probed-model-test
  (testing "an Anthropic partner model is reported in the spelling the platform names it by, `@` date and all"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [http/request (stub-error (atom []) 400 anthropic-validation-error-body)]
        (is (= {:models         []
                :learned-config {:probed-model "anthropic/claude-haiku-4-5@20251001"}}
               (list-models {:model "anthropic/claude-haiku-4-5@20251001" :probe? true})))))))

(deftest list-models-without-probe-keeps-the-model-to-itself-test
  (testing "a plain listing still validates the credentials but reports no `:learned-config` to the client"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.pasted-access-token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (let [requests (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (stub-count-tokens requests)]
          (is (= {:models []}
                 (list-models {:model "google/gemini-3.5-flash"})))
          (is (= 1 (count @requests))))))))

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

(deftest google-raw-mid-stream-failure-is-translated-test
  (testing "a failure while consuming the stream surfaces as a tagged Google error, not a raw IOException"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible (fn [_]
                                                            (reify clojure.lang.IReduceInit
                                                              (reduce [_ _rf _init]
                                                                (throw (IOException. "Connection reset")))))
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [_] {:body nil})]
        (let [e (try (into [] (google-raw {:model "google/gemini-3.5-flash"
                                           :input [{:role :user :content "hi"}]}))
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (=? {:api-error  true
                   :provider   "google"
                   :error-code :provider-request-failed}
                  (ex-data e)))
          (is (= "google API request failed: Connection reset" (ex-message e))))))))

(deftest google-raw-anthropic-mid-stream-failure-is-translated-test
  (testing "an Anthropic partner model's stream gets the same translation as a Gemini model's"
    (mt/with-temporary-setting-values [llm.settings/llm-google-oauth-access-token  "ya29.token"
                                       llm.settings/llm-google-service-account-key nil
                                       llm.settings/llm-google-project-id          "my-project"
                                       llm.settings/llm-google-location            nil]
      (mt/with-dynamic-fn-redefs [self.core/sse-reducible (fn [_]
                                                            (reify clojure.lang.IReduceInit
                                                              (reduce [_ _rf _init]
                                                                (throw (SocketTimeoutException. "Read timed out")))))
                                  debug/capture-stream    (fn [r _] r)
                                  http/request            (fn [_] {:body nil})]
        (let [e (try (into [] (google-raw {:model "anthropic/claude-haiku-4-5@20251001"
                                           :input [{:role :user :content "hi"}]}))
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (=? {:api-error  true
                   :provider   "google"
                   :error-code :provider-request-failed}
                  (ex-data e)))
          (is (= "google API request failed: Read timed out" (ex-message e))))))))

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
