(ns metabase-enterprise.metabot-v3.client
  (:require
   [buddy.core.hash :as buddy-hash]
   [buddy.sign.jwt :as jwt]
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [java-time.api :as t]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.settings :as metabot-v3.settings]
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
  (:import
   (java.io BufferedReader Closeable FilterInputStream InputStream)
   (org.eclipse.jetty.io EofException)))

(set! *warn-on-reflection* true)

(def ^:dynamic ^:private *debug* false)

(defn get-ai-service-token
  "Get the token for the AI service."
  ([]
   (get-ai-service-token api/*current-user-id* metabot-v3.config/internal-metabot-id))

  ([user-id metabot-id]
   (let [secret (buddy-hash/sha256 (metabot-v3.settings/site-uuid-for-metabot-tools))
         claims {:user       user-id
                 :exp        (t/plus (t/instant) (t/seconds (metabot-v3.settings/metabot-ai-service-token-ttl)))
                 :metabot-id metabot-id}]
     (jwt/encrypt claims secret {:alg :dir, :enc :a128cbc-hs256}))))

(defn- ->json-bytes ^bytes [x]
  (with-open [os (java.io.ByteArrayOutputStream.)
              w  (java.io.OutputStreamWriter. os)]
    (json/encode-to x w nil)
    (.toByteArray os)))

(defn- build-request-options [body]
  (merge
   {:headers          {"Accept"                    "application/json"
                       "Content-Type"              "application/json;charset=UTF-8"
                       "x-metabase-instance-token" (premium-features/premium-embedding-token)}
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

(defn- ai-url [path]
  (str (metabot-v3.settings/ai-service-base-url) path))

(defn- check-response!
  "Returns response body on success (200 or 202), throws on failure."
  [response request]
  (if (#{200 202} (:status response))
    (:body response)
    (throw (ex-info (format "Unexpected status code: %d %s"
                            (:status response) (:reason-phrase response))
                    {:request  (dissoc request :headers)
                     :response (dissoc response :headers)}))))

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

(defn- document-generate-content-endpoint []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/document/generate-content"))

(defn- generate-embeddings-endpoint []
  (str (metabot-v3.settings/ai-service-base-url) "/v1/embeddings"))

(defn- quick-closing-body
  "Some requests come with body wrapped in ContentLengthInputStream, and that will never close the underlying stream.
  So we just close the client itself.

  Please use `Connection: close` header when using this function to prevent connection being reused by HttpClient.

  See: https://github.com/dakrone/clj-http/issues/627
  Also: metabase-enterprise.metabot-v3.api-test/closing-connection-test (for 'chunked')"
  [response]
  (proxy [FilterInputStream] [^InputStream (:body response)]
    (close []
      (.close ^Closeable (:http-client response)))))

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
  [{:keys [context message history profile-id conversation-id session-id state on-complete]}
   :- [:map
       [:context :map]
       [:message ::metabot-v3.client.schema/message]
       [:history ::metabot-v3.client.schema/messages]
       [:profile-id :string]
       [:conversation-id :string]
       [:session-id :string]
       [:state :map]
       [:on-complete {:optional true} [:function [:=> [:cat :any] :any]]]]]
  (premium-features/assert-has-feature :metabot-v3 "MetaBot")
  (try
    (let [url      (ai-url "/v2/agent/stream")
          body     {:messages        (conj (vec history) message)
                    :context         context
                    :conversation_id conversation-id
                    :profile_id      profile-id
                    :user_id         api/*current-user-id*
                    :state           state}
          _        (metabot-v3.context/log body :llm.log/be->llm)
          _        (log/debugf "V2 request to AI Proxy:\n%s" (u/pprint-to-str body))
          options  (cond-> {:headers          {"Accept"                    "text/event-stream"
                                               "Content-Type"              "application/json;charset=UTF-8"
                                               "x-metabase-instance-token" (premium-features/premium-embedding-token)
                                               "x-metabase-session-token"  session-id
                                               "x-metabase-url"            (system/site-url)
                                               ;; close conn so it's not reused so that when we use
                                               ;; `quick-closing-body` there are no weird problems
                                               "Connection"                "close"}
                            :body             (->json-bytes body)
                            :throw-exceptions false
                            :as :stream
                            ;; Don't compress streaming responses - adds latency and breaks
                            ;; cancellation when streams are incomplete
                            :decompress-body  false}
                     *debug* (assoc :debug true))
          response (post! url options)
          lines    (when on-complete
                     (atom []))
          ;; NOTE: this atom is unused right now, but we potentially might put its value in database (see
          ;; `on-complete`) to indicate which requests were canceled in flight
          canceled (atom nil)]
      (metabot-v3.context/log (:body response) :llm.log/llm->be)
      (log/debugf "Response from AI Proxy:\n%s" (u/pprint-to-str (select-keys response #{:body :status :headers})))
      (when-not (#{200 202} (:status response))
        (check-response! response body))
      (sr/streaming-response {:content-type "text/event-stream; charset=utf-8"} [os canceled-chan]
        ;; see `quick-closing-body` docs and see `Connection` header supporting this behavior
        (with-open [^BufferedReader response-reader (io/reader (quick-closing-body response))]
          ;; Response from the AI Service will send response parts separated by newline
          (loop [^String line (.readLine response-reader)]
            (cond
              (nil? line)             nil
              (a/poll! canceled-chan) (do (reset! canceled true)
                                          (log/debug "Request cancelled"))
              :else
              (do
                (when on-complete
                  (swap! lines conj line))
                (try
                  (doto os
                    ;; `line-seq` strips newlines, so we need to append it back.
                    (.write (.getBytes line "UTF-8"))
                    (.write (.getBytes "\n"))
                    ;; Immediately flush so it feels fluid on the frontend
                    (.flush))
                  (catch EofException _
                    (reset! canceled true)
                    (log/debug "Request cancelled, through exception")))
                (when-not @canceled
                  ;; `recur` cannot be inside of `try`, so we have to signal stop somehow
                  (recur (.readLine response-reader)))))))
        (when on-complete
          (on-complete @lines))))
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
      (u/prog1 (check-response! response body)
        (log/debugf "Response:\n%s" (u/pprint-to-str <>))))
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
      (u/prog1 (check-response! response body)
        (log/debugf "Response:\n%s" (u/pprint-to-str <>))))
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
    (check-response! response body)))

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
    (check-response! response body)))

(mu/defn document-generate-content
  "Ask the AI service to generate a new node for a document."
  [body :- [:map
            [:instructions :string]]]
  (let [url (document-generate-content-endpoint)
        options (build-request-options body)
        headers (merge (:headers options) {"x-metabase-session-token"  (get-ai-service-token)
                                           "x-metabase-url"            (system/site-url)})
        options (assoc options :headers headers)
        response (post! url options)]
    (check-response! response body)))

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
    (check-response! response chart-data)))

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
    (check-response! response dashboard-data)))

(mr/def ::example-generation-column
  [:and
   [:map
    [:name :string]
    [:type [:enum :number, :string, :date, :datetime, :time, :boolean, nil]]
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
    (check-response! response payload)))

(defn generate-embeddings
  "Generate vector embeddings for a batch of inputs questions for the given models and metrics."
  [model-name texts]
  (let [url (generate-embeddings-endpoint)
        body {:model model-name
              :input texts
              :encoding_format "base64"}
        options (build-request-options body)
        response (post! url options)]
    (check-response! response body)))
