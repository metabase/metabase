(ns metabase-enterprise.metabot-v3.client
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.client.schema :as metabot-v3.client.schema]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.tools :as metabot-v3.tools]
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defsetting ai-proxy-base-url
  (deferred-tru "URL for the a AI Proxy service")
  :type       :string
  :encryption :no
  :default    "https://ai-service.coredev.metabase.com"
  :visibility :internal
  :export?    false)

(def ^:dynamic ^:private *debug* false)

(mu/defn- ^:dynamic *instance-info* :- ::metabot-v3.client.schema/request.instance-info
  []
  {:token     (premium-features/premium-embedding-token)
   :site-uuid (public-settings/site-uuid-for-premium-features-token-checks)})

(defn- encode-request-body [body]
  (mc/encode ::metabot-v3.client.schema/request body (mtx/transformer
                                                      (mtx/default-value-transformer)
                                                      {:name :api-request}
                                                      (mtx/key-transformer {:encode (fn [k]
                                                                                      (if (#{:additionalProperties :additional-properties} k)
                                                                                        :additionalProperties
                                                                                        (u/->snake_case_en k)))}))))

(mu/defn- build-request-body
  [context :- [:maybe ::metabot-v3.context/context]
   messages :- [:maybe ::metabot-v3.client.schema/messages]]
  (encode-request-body
   {:messages      messages
    :context       (metabot-v3.context/hydrate-context (or context {}))
    :tools         (metabot-v3.tools/applicable-tools (metabot-v3.tools/*tools-metadata*) context)
    :instance-info (*instance-info*)}))

(defn- ->json-bytes ^bytes [x]
  (with-open [os (java.io.ByteArrayOutputStream.)
              w  (java.io.OutputStreamWriter. os)]
    (json/generate-stream x w)
    (.toByteArray os)))

(def ^:private request-headers
  {"Accept"       "application/json"
   "Content-Type" "application/json;charset=UTF-8"})

(defn- build-request-options [body]
  (merge
   {:headers          request-headers
    :body             (->json-bytes body)
    :follow-redirects true
    :throw-exceptions false}
   (when *debug*
     {:debug true})))

(mu/defn- maybe-parse-response-body-as-json :- :map
  [response :- :map]
  (let [json? (some-> (get-in response [:headers "Content-Type"]) (str/starts-with? "application/json"))]
    (cond-> response
      json? (update :body #(json/parse-string % true)))))

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

(defn- agent-endpoint-url []
  (str (ai-proxy-base-url) "/v1/agent/"))

(defn- decode-response-body [response-body]
  (mc/decode ::metabot-v3.client.schema/ai-proxy.response
             response-body
             (mtx/transformer
              (mtx/json-transformer)
              {:name :api-response}
              (mtx/key-transformer {:decode u/->kebab-case-en}))))

(mu/defn ^:dynamic *request* :- ::metabot-v3.client.schema/ai-proxy.response
  "Make a request to the AI Proxy."
  [context :- [:maybe ::metabot-v3.context/context]
   messages :- [:maybe ::metabot-v3.client.schema/messages]]
  ;; TODO -- when `:metabot-v3` code goes live remove this check and check for the `:metabot-v3` feature specifically.
  (assert (premium-features/has-any-features?) (i18n/tru "You must have a valid enterprise token to use MetaBot."))
  #_(premium-features/assert-has-feature :metabot-v3 "MetaBot")
  (try
    (let [url      (agent-endpoint-url)
          body     (doto (build-request-body context messages)
                     (metabot-v3.context/log :llm.log/be->llm))
          _        (log/debugf "Request to AI Proxy:\n%s" (u/pprint-to-str body))
          options  (build-request-options body)
          response (post! url options)]
      (metabot-v3.context/log (:body response) :llm.log/llm->be)
      (log/debugf "Response from AI Proxy:\n%s" (u/pprint-to-str (select-keys response #{:body :status :headers})))
      (if (= (:status response) 200)
        (u/prog1 (decode-response-body (:body response))
          (log/debugf "Response (decoded):\n%s" (u/pprint-to-str <>)))
        (throw (ex-info (format "Error: unexpected status code: %d %s" (:status response) (:reason-phrase response))
                        {:request (assoc options :body body)
                         :response response}))))
    (catch Throwable e
      (throw (ex-info (format "Error in request to AI Proxy: %s" (ex-message e))
                      {}
                      e)))))

(defn- str->message [msg] {:role :user :content msg})

;;; Example flow. Copy this into the REPL to debug things
(comment
  ;; request 1
  (let [message-1  "Send an email to Cam"
        response-1 (*request* {} [(str->message message-1)])]
    ;; response 1 looks something like:
    (comment {:message {:content "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
                        :role :assistant
                        :tool-calls []}
              :metadata {:model "gpt-4o-mini", :usage {:total 439, :prompt 416, :completion 23}}})
    (let [history   [(str->message message-1)
                     (:message response-1)
                     (str->message "Cam's email is cam@metabase.com")]
          response-2 (*request* {} history)]
      ;; response 2 looks like:
      (comment {:message
                {:content "",
                 :role :assistant,
                 :tool-calls [{:id "call_DUTV9UW4s47fycBIjQ0Id0XM", :name :invite-user, :arguments {:email "cam@metabase.com"}}]},
                :metadata {:model "gpt-4o-mini", :usage {:total 497, :prompt 478, :completion 19}}})
      (let [history (conj (vec history)
                          (:message response-2)
                          (str->message "Thank you!"))]
        (*request* {} history)))))

#_#_(*request* "Send an invite to Cam at cam@metabase.com" {} [])
  (*request* "" {}
             [{:content ""
               :role :assistant
               :tool-calls [{:id "call_e07zRoT7gH1L9dOOgCEIhql0"
                             :name :metabot.tool/invite-user
                             :arguments {:email "cam@metabase.com"}}]}
              {:content "Sent the invite!"
               :role :tool
               :tool-call-id "call_e07zRoT7gH1L9dOOgCEIhql0"}])
