(ns metabase-enterprise.metabot-v3.client
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
   [metabase-enterprise.metabot-v3.util :as metabot-v3.u]
   [metabase.api.common :as api]
   [metabase.premium-features.core :as premium-features]
   [metabase.server.streaming-response :as sr]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.o11y :refer [with-span]])
  (:import (java.io BufferedReader)))

(set! *warn-on-reflection* true)

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
  (str (metabot-v3.settings/ai-service-base-url) "/v2/agent"))

(defn- agent-v2-streaming-endpoint-url []
  (str (metabot-v3.settings/ai-service-base-url) "/v2/agent/stream"))

(defn- metric-selection-endpoint-url []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/select-metric"))

(defn- find-outliers-endpoint-url []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/find-outliers"))

(defn- fix-sql-endpoint []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/sql/fix"))

(defn- generate-sql-endpoint []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/sql/generate"))

(defn- analyze-chart-endpoint []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/analyze/chart"))

(defn- analyze-dashboard-endpoint []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/analyze/dashboard"))

(defn- example-question-generation-endpoint []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/example-question-generation/batch"))

(mu/defn request :- ::metabot-v3.client.schema/ai-service.response
  "Make a V2 request to the AI Service."
  [{:keys [context messages profile-id conversation-id session-id state]}
   :- [:map
       [:context :map]
       [:messages ::metabot-v3.client.schema/messages]
       [:profile-id :string]
       [:conversation-id :string]
       [:session-id :string]
       [:state :map]]]
  (premium-features/assert-has-feature :metabot-v3 "MetaBot")
  (try
    (let [url      (agent-v2-endpoint-url)
          body     (-> {:messages        messages
                        :context         context
                        :conversation_id conversation-id
                        :profile_id      profile-id
                        :state           state
                        :user_id         api/*current-user-id*}
                       (metabot-v3.u/recursive-update-keys metabot-v3.u/safe->snake_case_en))
          _        (metabot-v3.context/log body :llm.log/be->llm)
          _        (log/debugf "V2 request to AI Service:\n%s" (u/pprint-to-str body))
          options  (cond-> {:headers          {"Accept"                    "application/json"
                                               "Content-Type"              "application/json;charset=UTF-8"
                                               "x-metabase-instance-token" (premium-features/premium-embedding-token)
                                               "x-metabase-session-token"  session-id
                                               "x-metabase-url"            (system/site-url)}
                            :body             (->json-bytes body)
                            :throw-exceptions false}
                     *debug* (assoc :debug true))
          response (post! url options)]
      (metabot-v3.context/log (:body response) :llm.log/llm->be)
      (log/debugf "Response from AI Service:\n%s" (u/pprint-to-str (select-keys response #{:body :status :headers})))
      (if (= (:status response) 200)
        (u/prog1 (mc/decode ::metabot-v3.client.schema/ai-service.response
                            (:body response)
                            (mtx/transformer {:name :api-response}))
          (log/debugf "Response (decoded):\n%s" (u/pprint-to-str <>)))
        (throw (ex-info (format "Error: unexpected status code: %d %s" (:status response) (:reason-phrase response))
                        {:request (assoc options :body body)
                         :response response}))))
    (catch Throwable e
      (throw (ex-info (format "Error in request to AI Service: %s" (ex-message e)) {} e)))))

(mu/defn streaming-request :- :any
  "Make a streaming V2 request to the AI Service

   This implements the streaming support for Metabot

   Clojure backend makes the request to the AI Service which respond immediately with a response and starts
   streaming the response chunks back. We want to ship these to the frontend as soon as possible to give
   the user the ability to consume the response before it's done.

   Since we want to send the chunks to the frontend as soon as possible, we manually write to the output stream
   and flush after every chunk. If we've just returned the `response` object, ring would handle it correctly
   but would also buffer the response.

   Response chunks are encoded in the format understood by the frontend and AI Service, Clojure backend doesn't
   know anything about it and just shuttles them over.
   "
  [{:keys [context messages profile-id conversation-id session-id state]}
   :- [:map
       [:context :map]
       [:messages ::metabot-v3.client.schema/messages]
       [:profile-id :string]
       [:conversation-id :string]
       [:session-id :string]
       [:state :map]]]
  (premium-features/assert-has-feature :metabot-v3 "MetaBot")
  (try
    (let [url      (agent-v2-streaming-endpoint-url)
          body     (-> {:messages        messages
                        :context         context
                        :conversation_id conversation-id
                        :profile_id      profile-id
                        :state           state
                        :user_id         api/*current-user-id*}
                       (metabot-v3.u/recursive-update-keys metabot-v3.u/safe->snake_case_en))
          _        (metabot-v3.context/log body :llm.log/be->llm)
          _        (log/debugf "V2 request to AI Proxy:\n%s" (u/pprint-to-str body))
          options  (cond-> {:headers          {"Accept"                    "text/event-stream"
                                               "Content-Type"              "application/json;charset=UTF-8"
                                               "x-metabase-instance-token" (premium-features/premium-embedding-token)
                                               "x-metabase-session-token"  session-id
                                               "x-metabase-url"            (system/site-url)}
                            :body             (->json-bytes body)
                            :throw-exceptions false
                            :as :stream}
                     *debug* (assoc :debug true))
          response (post! url options)]
      (metabot-v3.context/log (:body response) :llm.log/llm->be)
      (log/debugf "Response from AI Proxy:\n%s" (u/pprint-to-str (select-keys response #{:body :status :headers})))
      (if (= (:status response) 200)
        (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"} [os canceled-chan]
                               ;; Response from the AI Service will send response parts separated by newline
          (with-open [response-lines ^BufferedReader (io/reader (:body response))]
            (loop []
                                   ;; Grab the next line and write it to the output stream with appended newline (frontend depends on it)
                                   ;; Immediately flush so it get's sent to the frontend as soon as possible
              (when-let [line (.readLine response-lines)]
                (.write os (.getBytes (str line "\n") "UTF-8"))
                (.flush os)
                (recur)))))
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

(mu/defn generate-sql
  "Ask the AI service to generate a SQL query based on provided instructions."
  [body :- [:map
            [:dialect :keyword]
            [:instructions :string]
            [:tables [:sequential [:map
                                   [:name :string]
                                   [:schema {:optional true} [:maybe :string]]
                                   [:description {:optional true} [:maybe :string]]
                                   [:columns [:sequential [:map
                                                           [:name :string]
                                                           [:data_type :string]
                                                           [:description {:optional true} [:maybe :string]]]]]]]]]]
  (let [url (generate-sql-endpoint)
        options (build-request-options body)
        response (post! url options)]
    (if (= (:status response) 200)
      (:body response)
      (throw (ex-info (format "Error in request to AI service: unexpected status code: %d %s"
                              (:status response) (:reason-phrase response))
                      {:request (assoc options :body body)
                       :response response})))))

(def chart-analysis-schema
  "Schema for chart analysis data input."
  [:map
   [:image_base64 :string]
   [:chart {:optional true} [:map
                             [:name {:optional true} [:maybe :string]]
                             [:description {:optional true} [:maybe :string]]]]
   [:timeline_events {:optional true} [:sequential [:map
                                                    [:name :string]
                                                    [:description {:optional true} [:maybe :string]]
                                                    [:timestamp :string]]]]])

(mu/defn analyze-chart
  "Ask the AI service to analyze a chart image."
  [chart-data :- chart-analysis-schema]
  (let [url (analyze-chart-endpoint)
        options (build-request-options chart-data)
        response (post! url options)]
    (if (= (:status response) 200)
      (:body response)
      (throw (ex-info (format "Error in chart analysis request to AI service: unexpected status code: %d %s"
                              (:status response) (:reason-phrase response))
                      {:request options
                       :response response})))))

(def dashboard-analysis-schema
  "Schema for dashboard analysis data input."
  [:map
   [:image_base64 :string]
   [:dashboard {:optional true} [:map
                                 [:name {:optional true} [:maybe :string]]
                                 [:description {:optional true} [:maybe :string]]
                                 [:tab_name {:optional true} [:maybe :string]]]]])

(mu/defn analyze-dashboard
  "Ask the AI service to analyze a dashboard image."
  [dashboard-data :- dashboard-analysis-schema]
  (let [url (analyze-dashboard-endpoint)
        options (build-request-options dashboard-data)
        response (post! url options)]
    (if (= (:status response) 200)
      (:body response)
      (throw (ex-info (format "Error in dashboard analysis request to AI service: unexpected status code: %d %s"
                              (:status response) (:reason-phrase response))
                      {:request options
                       :response response})))))

(mr/def ::example-generation-column
  [:and
   [:map
    [:name :string]
    [:type [:enum :number, :string, :date, :datetime, :time, :boolean, :null]]
    [:description {:optional true} [:maybe :string]]
    [:table-reference {:optional true} :string]]
   [:map {:encode/ai-service-request #(set/rename-keys % {:table-reference :table_reference})}]])

(mr/def ::example-generation-payload
  [:map
   [:tables {:optional true}
    [:sequential
     [:map
      [:name :string]
      [:description {:optional true} [:maybe :string]]
      [:fields [:sequential ::example-generation-column]]]]]
   [:metrics {:optional true}
    [:sequential
     [:and
      [:map
       [:name :string]
       [:description {:optional true} [:maybe :string]]
       [:queryable-dimensions [:sequential ::example-generation-column]]
       [:default-time-dimension {:optional true} ::example-generation-column]]
      [:map {:encode/ai-service-request #(set/rename-keys % {:default-time-dimension :default_time_dimension
                                                             :queryable-dimensions :queryable_dimensions})}]]]]])

(mu/defn generate-example-questions
  "Generate example questions for the given models and metrics."
  [promptables :- ::example-generation-payload]
  (let [url (example-question-generation-endpoint)
        payload (mc/encode ::example-generation-payload
                           promptables
                           (mtx/transformer {:name :ai-service-request}))
        options (build-request-options payload)
        response (post! url options)]
    (if (= (:status response) 200)
      (:body response)
      (throw (ex-info (format "Error in generate-example-questions request to AI service: unexpected status: %d %s"
                              (:status response) (:reason-phrase response))
                      {:request (assoc options :body payload)
                       :response response})))))
