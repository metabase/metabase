(ns metabase-enterprise.metabot-v3.client
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.api.common :as api]
   [metabase.models.setting :refer [defsetting]]
   [metabase.premium-features.core :as premium-features]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defsetting ai-proxy-base-url
  (deferred-tru "URL for the a AI Proxy service")
  :type       :string
  :encryption :no
  :default    "http://localhost:8000"
  :visibility :internal
  :export?    false)

(def ^:dynamic ^:private *debug* false)

(defn- ->json-bytes ^bytes [x]
  (with-open [os (java.io.ByteArrayOutputStream.)
              w  (java.io.OutputStreamWriter. os)]
    (json/encode-to x w nil)
    (.toByteArray os)))

(defn- request-headers
  []
  {"Accept"                    "application/json"
   "Content-Type"              "application/json;charset=UTF-8"
   "x-metabase-instance-token" (premium-features/premium-embedding-token)})

(defn- build-request-options [body]
  (merge
   {:headers          (request-headers)
    :body             (->json-bytes body)
    :follow-redirects true
    :throw-exceptions false}
   (when *debug*
     {:debug true})))

(mu/defn- maybe-parse-response-body-as-json :- :map
  [response :- :map]
  (let [json? (some-> (get-in response [:headers "Content-Type"]) (str/starts-with? "application/json"))]
    (cond-> response
      json? (update :body #(json/decode % true)))))

(defn- post! [url options]
  (let [response-metadata (promise)
        response-status (promise)]
    (with-span :info {:name :metabot-v3.client/request
                      :url url
                      :metadata response-metadata
                      :status response-status}
      (u/prog1 (maybe-parse-response-body-as-json (http/post url options))
        (deliver response-metadata (some-> <> :body :metadata))
        (deliver response-status (some-> <> :status))))))

(defn- agent-v2-endpoint-url []
  (str (ai-proxy-base-url) "/v2/agent"))

(defn- metric-selection-endpoint-url []
  (str (ai-proxy-base-url) "/v1/select-metric"))

(defn- find-outliers-endpoint-url []
  (str (ai-proxy-base-url) "/v1/find-outliers"))

(defn- fix-sql-endpoint []
  (str (ai-proxy-base-url) "/v1/sql/fix"))

(mu/defn request :- ::metabot-v3.client.schema/ai-proxy.response-v2
  "Make a V2 request to the AI Proxy."
  [{:keys [context messages conversation-id session-id state]}
   :- [:map
       [:context :map]
       [:messages [:maybe ::metabot-v3.client.schema/messages]]
       [:conversation-id :string]
       [:session-id :string]
       [:state :map]]]
  (premium-features/assert-has-feature :metabot-v3 "MetaBot")
  (try
    (let [url      (agent-v2-endpoint-url)
          body     (-> {:messages messages
                        :context  context}
                       (metabot-v3.u/recursive-update-keys metabot-v3.u/safe->snake_case_en)
                       (assoc :conversation_id conversation-id
                              :state           state
                              :user_id         api/*current-user-id*))
          _        (metabot-v3.context/log body :llm.log/be->llm)
          _        (log/debugf "V2 request to AI Proxy:\n%s" (u/pprint-to-str body))
          options  (cond-> {:headers          {"Accept"                    "application/json"
                                               "Content-Type"              "application/json;charset=UTF-8"
                                               "x-metabase-instance-token" (premium-features/premium-embedding-token)
                                               "x-metabase-session-token"  session-id
                                               "x-metabase-url"            (public-settings/site-url)}
                            :body             (->json-bytes body)
                            :throw-exceptions false}
                     *debug* (assoc :debug true))
          response (post! url options)]
      (metabot-v3.context/log (:body response) :llm.log/llm->be)
      (log/debugf "Response from AI Proxy:\n%s" (u/pprint-to-str (select-keys response #{:body :status :headers})))
      (if (= (:status response) 200)
        (u/prog1 (mc/decode ::metabot-v3.client.schema/ai-proxy.response-v2
                            (:body response)
                            (mtx/transformer
                             (mtx/json-transformer)
                             {:name :api-response}
                             (mtx/key-transformer {:decode u/->kebab-case-en})))
          (log/debugf "Response (decoded):\n%s" (u/pprint-to-str <>)))
        (throw (ex-info (format "Error: unexpected status code: %d %s" (:status response) (:reason-phrase response))
                        {:request (assoc options :body body)
                         :response response}))))
    (catch Throwable e
      (throw (ex-info (format "Error in request to AI Proxy: %s" (ex-message e)) {} e)))))

(mu/defn select-metric-request
  "Make a request to AI Service to select a metric."
  [metrics :- [:sequential ::metabot-v3.client.schema/metric]
   query   :- :string]
  (try
    (let [url (metric-selection-endpoint-url)
          body {:metrics metrics
                :query query}
          options (build-request-options body)
          response (post! url options)]
      (if (= (:status response) 200)
        (u/prog1 (:body response)
          (log/debugf "Response:\n%s" (u/pprint-to-str <>)))
        (throw (ex-info (format "Error: unexpected status code: %d %s" (:status response) (:reason-phrase response))
                        {:request (assoc options :body body)
                         :response response}))))
    (catch Throwable e
      (throw (ex-info (format "Error in request to AI Service: %s" (ex-message e))
                      {}
                      e)))))

(mu/defn find-outliers-request
  "Make a request to AI Service to find outliers"
  [values :- [:sequential [:map [:dimension :any] [:value :any]]]]
  (try
    (let [url (find-outliers-endpoint-url)
          body {:values values}
          options (build-request-options body)
          response (post! url options)]
      (if (= (:status response) 200)
        (u/prog1 (:body response)
          (log/debugf "Response:\n%s" (u/pprint-to-str <>)))
        (throw (ex-info (format "Error: unexpected status code: %d %s" (:status response) (:reason-phrase response))
                        {:request (assoc options :body body)
                         :response response}))))
    (catch Throwable e
      (throw (ex-info (format "Error in request to AI service: %s" (ex-message e))
                      {}
                      e)))))

(mu/defn fix-sql
  "Ask the AI service to propose fixes a SQL query and a given error."
  [body :- [:map
            [:sql :string]
            [:dialect :keyword]
            [:error_message :string]
            [:schema_ddl {:optional true} :string]]]
  (let [url (fix-sql-endpoint)
        options (build-request-options body)
        response (post! url options)]
    (if (= (:status response) 200)
      (:body response)
      (throw (ex-info (format "Error in request to AI service: unexpected status code: %d %s"
                              (:status response) (:reason-phrase response))
                      {:request (assoc options :body body)
                       :response response})))))
