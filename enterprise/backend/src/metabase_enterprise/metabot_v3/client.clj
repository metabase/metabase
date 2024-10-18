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
   [metabase.util.malli :as mu]))

(defsetting ai-proxy-base-url
  (deferred-tru "URL for the a AI Proxy service")
  :type       :string
  :encryption :no
  :visibility :internal
  :export?    false
  ;; TODO -- getter/setter should do URL validation and strip of trailing slashes
  :default    "http://localhost:8000")

(set! *warn-on-reflection* true)

(def ^:dynamic ^:private *debug* false)

(mu/defn- ^:dynamic *instance-info* :- ::metabot-v3.client.schema/request.instance-info
  []
  {:token     (premium-features/premium-embedding-token)
   :site-uuid (public-settings/site-uuid-for-premium-features-token-checks)})

(defn- encode-request-body [body]
  (mc/encode ::metabot-v3.client.schema/request body (mtx/transformer
                                                      (mtx/default-value-transformer)
                                                      {:name :api-request})))

(mu/defn- build-request-body
  [message :- :string
   context :- [:maybe ::metabot-v3.context/context]
   history :- [:maybe ::metabot-v3.client.schema/messages]]
  (encode-request-body
   {:messages       (conj (vec history)
                          {:role :user, :content message})
    :context       (metabot-v3.context/hydrate-context (or context {}))
    :tools         (metabot-v3.tools/*tools-metadata*)
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

(defn- agent-endpoint-url []
  (str (ai-proxy-base-url) "/v1/agent/"))

(defn- decode-response-body [response-body]
  (mc/decode ::metabot-v3.client.schema/ai-proxy.response
             response-body
             (mtx/transformer
              (mtx/json-transformer)
              {:name :api-response})))

(mu/defn ^:dynamic *request* :- ::metabot-v3.client.schema/ai-proxy.response
  "Make a request to the AI Proxy."
  [message :- :string
   context :- [:maybe ::metabot-v3.context/context]
   history :- [:maybe ::metabot-v3.client.schema/messages]]
  ;; TODO -- when `:metabot-v3` code goes live remove this check and check for the `:metabot-v3` feature specifically.
  (assert (premium-features/has-any-features?) (i18n/tru "You must have a valid enterprise token to use MetaBot."))
  #_(premium-features/assert-has-feature :metabot-v3 "MetaBot")
  (let [url      (agent-endpoint-url)
        body     (build-request-body message context history)
        _        (log/debugf "Request to AI Proxy:\n%s" (u/pprint-to-str body))
        options  (build-request-options body)
        response (-> (http/post url options)
                     maybe-parse-response-body-as-json)]
    (log/debugf "Response from AI Proxy:\n%s" (u/pprint-to-str (select-keys response #{:body :status :headers})))
    (if (= (:status response) 200)
      (u/prog1 (decode-response-body (:body response))
        (log/debugf "Response (decoded):\n%s" (u/pprint-to-str <>)))
      (throw (ex-info (format "Error: unexpected status code: %d %s" (:status response) (:reason-phrase response))
                      {:request (assoc options :body body)
                       :response response})))))

;;; Example flow.
(comment
  ;; request 1
  (*request* "Send an email to Cam" {} [])

  ;; response 1
  {:message {:content "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?"
             :role :assistant
             :tool-calls []}
   :metadata {:model "gpt-4o-mini", :usage {:total 439, :prompt 416, :completion 23}}}

  ;; request 2 (response 1 is added to end of history)
  (*request* "cam@metabase.com" {} [{:role :user, :content "Send an email to Cam"}
                                    {:content "Sorry I don't understand that. Could you please clarify what you would like to include in the email to Cam?",
                                     :role :assistant
                                     :tool-calls []}]))
