(ns metabase-enterprise.metabot-v3.client
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.transform :as mtx]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.tools :as metabot-v3.tools]
   [metabase-enterprise.metabot-v3.tools.interface :as metabot-v3.tools.interface]
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(defsetting ai-proxy-base-url
  (deferred-tru "URL for the a AI Proxy service")
  :type       :string
  :encryption :no
  :visibility :internal
  :export?    false
  ;; TODO -- getter/setter should do URL validation and strip of trailing slashes
  :default    "http://localhost:8000"  )

(set! *warn-on-reflection* true)

(def ^:dynamic ^:private *debug* false)

(mr/def ::history
  [:sequential :map])

(mr/def ::request.tools
  [:sequential ::metabot-v3.tools.interface/metadata])

(mr/def ::request.instance-info
  "Instance info for billing purposes."
  [:map
   {:encode/api-request #(update-keys % u/->snake_case_en)}
   [:site-uuid :string]])

(mr/def ::request
  [:map
   {:encode/api-request #(update-keys % u/->snake_case_en)}
   [:message       :string]
   [:context       {:default {}} ::metabot-v3.context/context]
   [:history       {:default []} ::history]
   [:tools         ::request.tools]
   [:instance-info ::request.instance-info]])

(mu/defn- instance-info :- ::request.instance-info
  []
  {:site-uuid (public-settings/site-uuid-for-premium-features-token-checks)})

(mu/defn- build-request-body
  [message :- :string
   context :- ::metabot-v3.context/context
   history :- ::history]
  (let [request  {:message       message
                  :context       (metabot-v3.context/hydrate-context context)
                  :history       history
                  :tools         (metabot-v3.tools/tools-metadata)
                  :instance-info (instance-info)}]
    (mc/encode ::request request (mtx/transformer
                                  (mtx/default-value-transformer)
                                  {:name :api-request}))))

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

(mr/def ::response.type
  [:enum :message :tools])

(mr/def ::response.common
  [:map
   [:new-history ::history]])

(mr/def ::response.message
  [:merge
   ::response.common
   [:map
    [:type    [:= :message]]
    [:message :string]]])

(mr/def ::response.tools.tool.parameters
  [:map-of
   ::metabot-v3.tools.interface/metadata.parameter.name
   any?])

(mr/def ::response.tools.tool
  [:map
   [:name       ::metabot-v3.tools.interface/metadata.name]
   [:parameters ::response.tools.tool.parameters]])

(mr/def ::response.tools
  [:merge
   ::response.common
   [:map
    [:type  [:= :tools]]
    [:tools [:sequential {:min 1} ::response.tools.tool]]]])

(mr/def ::response
  [:and
   {:decode/api-response #(update-keys % u/->kebab-case-en)}
   [:map
    [:type ::response.type]]
   [:multi
    {:dispatch :type}
    [:message ::response.message]
    [:tools   ::response.tools]]])

(mu/defn- parse-response :- :map
  [response :- :map]
  (let [json? (some-> (get-in response [:headers "Content-Type"]) (str/starts-with? "application/json"))]
    (cond-> response
      json? (update :body #(json/parse-string % true)))))

(defn- agent-endpoint-url []
  (str (ai-proxy-base-url) "/v1/agent/"))

(mu/defn request :- ::response
  "Make a request to the AI Proxy."
  [message :- :string
   context :- ::metabot-v3.context/context
   history :- [:maybe ::history]]
  (let [url      (agent-endpoint-url)
        body     (build-request-body message context history)
        options  (build-request-options body)
        response (-> (http/post url options)
                     parse-response)]
    (if (= (:status response) 200)
      (mc/decode ::response (:body response) (mtx/transformer
                                              (mtx/json-transformer)
                                              {:name :api-response}))
      (throw (ex-info (format "Error: unexpected status code: %d %s" (:status response) (:reason-phrase response))
                      {:request  (assoc options :body body)
                       :response response})))))
