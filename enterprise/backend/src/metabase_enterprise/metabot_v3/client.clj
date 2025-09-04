(ns metabase-enterprise.metabot-v3.client
  (:require
   [buddy.core.hash :as buddy-hash]
   [buddy.sign.jwt :as jwt]
   [clj-http.client :as http]
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
   [metabase.app-db.core :as app-db]
   [metabase.premium-features.core :as premium-features]
   [metabase.server.streaming-response :as sr]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.o11y :refer [with-span]]
   [toucan2.core :as t2])
  (:import
   (java.io BufferedReader)))

(set! *warn-on-reflection* true)

(def ^:dynamic ^:private *debug* false)

(def TYPE-PREFIX
  "AI SDK type to prefix"
  {:text        "0:"
   :data        "2:"
   :error       "3:"
   :finish      "d:"
   :tool-call   "9:"
   :tool-result "a:"})

(def PREFIX-TYPE "AI SDK prefix to type" (set/map-invert TYPE-PREFIX))

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

(defn- store-message! [conversation-id message]
  (let [usage (-> message :metadata :usage)]
    (app-db/update-or-insert! :model/MetabotConversation {:id conversation-id}
                              (constantly {:user_id api/*current-user-id*}))
    (t2/insert! :model/MetabotMessage
                {:conversation_id conversation-id
                 :data            message
                 :usage           usage
                 :total           (->> (vals usage)
                                       (map #(+ (:prompt %) (:completion %)))
                                       (apply +))})))

(defn aisdk-lines->message [lines]
  (let [chunks (mapv (fn [line] [(get PREFIX-TYPE (subs line 0 2))
                                 (json/decode+kw (subs line 2))])
                     lines)
        types  (into #{} (map first chunks))
        last-c (nth chunks (dec (count chunks)))]
    (when-not (set/subset? types #{:text :tool-call :finish})
      (log/error "Unhandled chunk types appeared" {:chunk-types types}))
    (u/remove-nils
     {:content    (apply str (for [[type c] chunks
                                   :when    (= type :text)]
                               c))
      :tool-calls (-> (for [[type c] chunks
                            :when    (= type :tool-call)]
                        {:id        (:toolCallId c)
                         :name      (:toolName c)
                         :arguments (:args c)})
                      vec
                      not-empty)
      :data       (apply merge
                         (when-let [navigate-to (first (for [[type c] chunks
                                                             :when    (and (= type :data)
                                                                           (= (:type c) :navigate_to))]
                                                         (:value c)))]
                           {:navigate_to navigate-to}))
      :metadata   {:usage (when (= (first last-c) :finish)
                            (:usage (second last-c)))}})))

(defn- handle-finish [conversation-id lines]
  (let [message (aisdk-lines->message lines)]
    (store-message! conversation-id message)))

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
    (let [url      (ai-url "/v2/agent")
          body     (-> {:messages        messages
                        :context         context
                        :conversation_id conversation-id
                        :profile_id      profile-id
                        :user_id         api/*current-user-id*
                        :state           state}
                       (u/deep-kebab->snake-keys))
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
          (log/debugf "Response (decoded):\n%s" (u/pprint-to-str <>))
          (store-message! conversation-id <>))
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
    (let [url      (ai-url "/v2/agent/stream")
          body     (-> {:messages        messages
                        :context         context
                        :conversation_id conversation-id
                        :profile_id      profile-id
                        :user_id         api/*current-user-id*
                        :state           state}
                       (u/deep-kebab->snake-keys))
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
            (loop [lines []]
              ;; https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#event_stream_format
              ;; Format is text chunks separated by 2 newlines, so for each line we append another newline
              ;; Immediately flush so it feels fluid on the frontend
              (when-let [line (.readLine response-lines)]
                (when (str/starts-with? line (:finish TYPE-PREFIX))
                  (handle-finish conversation-id (conj lines line)))
                (.write os (.getBytes line "UTF-8"))
                (.write os (.getBytes "\n"))
                (.flush os)
                (recur (conj lines line))))))
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

(defn generate-embeddings
  "Generate vector embeddings for a batch of inputs questions for the given models and metrics."
  [model-name texts]
  (let [url (generate-embeddings-endpoint)
        body {:model model-name
              :input texts
              :encoding_format "base64"}
        options (build-request-options body)
        response (post! url options)]
    (if (= (:status response) 200)
      (:body response)
      (throw (ex-info (format "Error in generate-embeddings request to AI service: unexpected status: %d %s"
                              (:status response) (:reason-phrase response))
                      {:request (assoc options :body body)
                       :response response})))))
