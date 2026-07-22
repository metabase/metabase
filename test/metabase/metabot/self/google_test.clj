(ns metabase.metabot.self.google-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.google :as google]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Auth / HTTP tests
;;; ──────────────────────────────────────────────────────────────────

(deftest google-raw-project-scoped-url-test
  (testing "requests are scoped to projects/{p}/locations/{l}, location defaulting to global, with the x-goog-api-key header"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaTestKey"
                                       llm.settings/llm-google-project-id "my-project"
                                       llm.settings/llm-google-location   nil]
      (with-redefs [self.core/sse-reducible identity
                    debug/capture-stream    (fn [r _] r)
                    http/request            (fn [req] {:body req})]
        (is (=? {:method  :post
                 :url     "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse"
                 :headers {"x-goog-api-key" "AIzaTestKey"}
                 :body    string?}
                (google/google-raw {:model "gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))
    (testing "and an explicit location is used verbatim"
      (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaTestKey"
                                         llm.settings/llm-google-project-id "my-project"
                                         llm.settings/llm-google-location   "us-central1"]
        (with-redefs [self.core/sse-reducible identity
                      debug/capture-stream    (fn [r _] r)
                      http/request            (fn [req] {:body req})]
          (is (=? {:url "https://aiplatform.googleapis.com/v1/projects/my-project/locations/us-central1/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse"}
                  (google/google-raw {:model "gemini-3.5-flash" :input [{:role :user :content "hi"}]}))))))))

(deftest google-raw-publisher-qualified-model-test
  (testing "a publisher-qualified model ID ({publisher}/{model}) lands in the publishers/{publisher}/models/{model} path"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaTestKey"
                                       llm.settings/llm-google-project-id "my-project"
                                       llm.settings/llm-google-location   nil]
      (with-redefs [self.core/sse-reducible identity
                    debug/capture-stream    (fn [r _] r)
                    http/request            (fn [req] {:body req})]
        (is (=? {:url "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-3.1-pro-preview:streamGenerateContent?alt=sse"}
                (google/google-raw {:model "google/gemini-3.1-pro-preview" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-api-key-without-project-throws-test
  (testing "an API key without a project ID throws before any HTTP call — express mode is not supported"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaTestKey"
                                       llm.settings/llm-google-project-id nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Google Cloud project ID is required for the Google provider"
             (google/google-raw {:model "gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-bearer-token-auth-test
  (testing "a non-AIza credential is treated as an OAuth access token and sent as a Bearer header"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "ya29.pasted-access-token"
                                       llm.settings/llm-google-project-id "my-project"
                                       llm.settings/llm-google-location   nil]
      (with-redefs [self.core/sse-reducible identity
                    debug/capture-stream    (fn [r _] r)
                    http/request            (fn [req] {:body req})]
        (let [req (google/google-raw {:model "gemini-3.5-flash" :input [{:role :user :content "hi"}]})]
          (is (=? {:url     "https://aiplatform.googleapis.com/v1/projects/my-project/locations/global/publishers/google/models/gemini-3.5-flash:streamGenerateContent?alt=sse"
                   :headers {"Authorization" "Bearer ya29.pasted-access-token"}}
                  req))
          (is (not (contains? (:headers req) "x-goog-api-key"))))))))

(deftest google-raw-token-without-project-throws-test
  (testing "an OAuth access token without a project ID throws before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "ya29.pasted-access-token"
                                       llm.settings/llm-google-project-id nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Google Cloud project ID is required for the Google provider"
             (google/google-raw {:model "gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-missing-api-key-test
  (testing "a missing API key throws before any HTTP call"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"No Google API key is set"
             (google/google-raw {:model "gemini-3.5-flash" :input [{:role :user :content "hi"}]})))))))

(deftest google-raw-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for the Google provider"
           (google/google-raw {:model     "gemini-3.5-flash"
                               :input     [{:role :user :content "hi"}]
                               :ai-proxy? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models tests
;;; ──────────────────────────────────────────────────────────────────

(defn- catalog-response
  "A `projects.locations.models/list` response body for models with the given resource-name tails."
  [parent model-ids & {:keys [next-page-token]}]
  (cond-> {:models (mapv #(hash-map :name (str parent "/models/" %)) model-ids)}
    next-page-token (assoc :nextPageToken next-page-token)))

(deftest list-models-intersects-catalog-test
  (testing "list-models fetches the project's model catalog and returns its intersection with the whitelist, in picker order"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaTestKey"
                                       llm.settings/llm-google-project-id "my-project"
                                       llm.settings/llm-google-location   nil]
      (let [parent "projects/my-project/locations/global"]
        (with-redefs [http/request (fn [req]
                                     (is (=? {:method  :get
                                              :url     (str "https://aiplatform.googleapis.com/v1/" parent "/models")
                                              :headers {"x-goog-api-key" "AIzaTestKey"}}
                                             req))
                                     {:status 200
                                      :body   (json/encode
                                               (catalog-response parent
                                                                 ["gemini-3.5-flash"
                                                                  "gemini-3.6-flash"
                                                                  "google/gemini-3.1-pro-preview"
                                                                  "some-custom-model"]))})]
          (is (= [{:id "gemini-3.6-flash"              :display_name "Gemini 3.6 Flash"}
                  {:id "gemini-3.5-flash"              :display_name "Gemini 3.5 Flash"}
                  {:id "google/gemini-3.1-pro-preview" :display_name "Gemini 3.1 Pro Preview"}]
                 (:models (google/list-models)))))))))

(deftest list-models-excludes-unlisted-models-test
  (testing "whitelisted models absent from the project's catalog are not offered"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaTestKey"
                                       llm.settings/llm-google-project-id "my-project"
                                       llm.settings/llm-google-location   nil]
      (let [parent "projects/my-project/locations/global"]
        (with-redefs [http/request (fn [_]
                                     {:status 200
                                      :body   (json/encode
                                               (catalog-response parent ["gemini-3.5-flash"
                                                                         "some-custom-model"]))})]
          (is (= [{:id "gemini-3.5-flash" :display_name "Gemini 3.5 Flash"}]
                 (:models (google/list-models)))))))))

(deftest list-models-follows-pagination-test
  (testing "list-models follows nextPageToken across catalog pages"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaTestKey"
                                       llm.settings/llm-google-project-id "my-project"
                                       llm.settings/llm-google-location   nil]
      (let [parent "projects/my-project/locations/global"]
        (with-redefs [http/request (fn [{:keys [query-params]}]
                                     {:status 200
                                      :body   (json/encode
                                               (if (nil? query-params)
                                                 (catalog-response parent ["gemini-3.5-flash"]
                                                                   :next-page-token "page-2")
                                                 (do (is (= {"pageToken" "page-2"} query-params))
                                                     (catalog-response parent ["gemini-3.6-flash"]))))})]
          (is (= ["gemini-3.6-flash" "gemini-3.5-flash"]
                 (mapv :id (:models (google/list-models))))))))))

(deftest list-models-explicit-credentials-test
  (testing "credentials in opts override the configured settings, including project scoping"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaSavedKey"
                                       llm.settings/llm-google-project-id "saved-project"]
      (let [parent "projects/other-project/locations/europe-west1"]
        (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                   (is (=? {:url     (str "https://aiplatform.googleapis.com/v1/" parent "/models")
                                                            :headers {"x-goog-api-key" "AIzaOverrideKey"}}
                                                           req))
                                                   {:status 200
                                                    :body   (json/encode
                                                             (catalog-response parent ["gemini-3.5-flash"]))})]
          (is (seq (:models (google/list-models {:credentials {:api-key    "AIzaOverrideKey"
                                                               :project-id "other-project"
                                                               :location   "europe-west1"}})))))))))

(deftest list-models-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for the Google provider"
           (google/list-models {:ai-proxy? true}))))))

(deftest list-models-invalid-key-maps-to-google-error-test
  (testing "a 400 from the catalog call (Google's invalid-API-key status) surfaces the canonical message"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key    "AIzaBadKey"
                                       llm.settings/llm-google-project-id "my-project"]
      (with-redefs [http/request (fn [_]
                                   (throw (ex-info "clj-http: status 400"
                                                   {:status  400
                                                    :headers {"content-type" "application/json"}
                                                    :body    (json/encode
                                                              {:error {:code    400
                                                                       :message "API key not valid. Please pass a valid API key."
                                                                       :status  "INVALID_ARGUMENT"}})})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Google API rejected the request — the API key may be invalid — API key not valid\. Please pass a valid API key\."
             (google/list-models)))))))
