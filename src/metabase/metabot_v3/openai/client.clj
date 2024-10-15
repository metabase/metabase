(ns metabase.metabot-v3.openai.client
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase.metabot-v3.openai.config :as metabot-v3.openai.config]
   [metabase.metabot-v3.tools :as metabot-v3.tools]
   [metabase.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(def ^:dynamic ^:private *debug* false)

(mu/defn- request-headers :- [:map-of :string :any]
  []
  {"Authorization"       (format "Bearer %s" (metabot-v3.openai.config/openai-api-key))
   "Accept"              "application/json"
   "Content-Type"        "application/json;charset=UTF-8"
   "OpenAI-Organization" (metabot-v3.openai.config/openai-organization)})

(mr/def ::role
  [:enum :system :user :assistant :tool])

(mr/def ::message.tool-call.function
  [:map
   [:name      ::metabot-v3.tools.interface/tool.name]
   [:arguments [:map-of
                {:decode/api-response (fn [x]
                                        (cond-> x
                                          (string? x) (json/parse-string true)))
                 :encode/api-request  (fn [x]
                                        (cond-> x
                                          (not (string? x)) json/generate-string))}
                :keyword
                :any]]])

(mr/def ::message.tool-call
  [:map
   [:id       :string]
   [:type     [:= :function]]
   [:function ::message.tool-call.function]])

(mr/def ::message
  [:map
   {:decode/api-response #(set/rename-keys % {:tool_calls :tool-calls})
    :encode/api-request  #(set/rename-keys % {:tool-calls :tool_calls})}
   [:role    ::role]
   [:content [:maybe :string]]
   [:tool-calls {:optional true} [:maybe [:sequential ::message.tool-call]]]])

(mr/def ::messages
  [:sequential {:min 1} ::message])

(def ^:private ^String system-message
  (slurp (io/resource "metabase/metabot_v3/openai/client/system_message.txt")))

(mr/def ::request.tools.tool
  [:map
   {:encode/api-request (fn [m]
                          (if (= (:type m) :function)
                            m
                            {:type :function, :function m}))}
   [:type     [:= :function]]
   [:function ::metabot-v3.tools.interface/tool]])

(mr/def ::request.tools
  [:sequential ::request.tools.tool])

(mr/def ::request
  [:map
   [:model    :string]
   [:messages ::messages]
   [:tools    ::request.tools]])

(mu/defn- build-request-body
  [messages :- ::messages]
  (let [messages (cons {:role    :system
                        :content system-message}
                       messages)
        request  {:model    (metabot-v3.openai.config/metabot-v3-openai-model)
                  :messages messages
                  :tools    (metabot-v3.tools/tool-definitions)}]
    (mc/encode ::request request (mtx/transformer {:name :api-request}))))

(defn- ->json-bytes ^bytes [x]
  (with-open [os (java.io.ByteArrayOutputStream.)
              w  (java.io.OutputStreamWriter. os)]
    (json/generate-stream x w)
    (.toByteArray os)))

(defn- build-request-options [body]
  #_(println "(u/pprint-to-str body):" (u/pprint-to-str body)) ; NOCOMMIT
  (merge
   {:headers          (request-headers)
    :body             (->json-bytes body)
    :throw-exceptions false}
   (when *debug*
     {:debug true})))

(mu/defn- parse-response :- :map
  [response :- :map]
  (let [json? (str/starts-with? (get-in response [:headers "Content-Type"]) "application/json")]
    (cond-> response
      json? (update :body #(json/parse-string % true)))))

(mr/def ::response.choice
  [:map
   [:message ::message]])

(mr/def ::response
  [:map
   [:choices [:sequential ::response.choice]]])

(mu/defn- chat :- ::response
  [messages :- ::messages]
  (let [url      (str metabot-v3.openai.config/*api-base-url* "/v1/chat/completions")
        body     (build-request-body messages)
        options  (build-request-options body)
        response (-> (http/post url options)
                     parse-response)]
    (if (= (:status response) 200)
      (mc/decode ::response (:body response) (mtx/transformer
                                              (mtx/json-transformer)
                                              (mtx/transformer {:name :api-response})))
      (throw (ex-info "Error" {:request  (assoc options :body body)
                               :response response})))))

(mu/defn user-chat :- ::response
  "Send a user-written message to GPT."
  ([message-string]
   (user-chat message-string nil))

  ([message-string    :- :string
    previous-messages :- [:maybe [:sequential ::message]]]
   (chat (concat previous-messages [{:role :user, :content message-string}]))))
