(ns metabase.metabot.tools.docs
  "`search_metabase_documentation`: answers questions about Metabase itself (features, settings, setup,
  permissions, embedding, errors, the API) from the Metabase docs, with the sources.

  It asks the Metabase docs assistant (`metabot-docs-api-url`, docs.metabase.fyi), which answers only from
  the docs of this instance's Metabase version and cites each claim. Only the question is sent, with this
  instance's version and whether it is Metabase Cloud; no data from the instance is. Admins can turn it off
  with `metabot-docs-search-enabled?`, which removes the tool (the `:feature-docs-search` capability)."
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private max-question-length
  "The docs assistant's limit on a question."
  1000)

(defn docs-version
  "The docs version for a Metabase version tag: \"v0.57.3\" and \"v1.57.3\" (EE) are both \"v0.57\".
  Nil when the tag has no version (local development)."
  [tag]
  (some->> (config/major-version (str tag)) (str "v0.")))

(defn- request-body
  [question {:keys [version deployment]}]
  (cond-> {:question question}
    version    (assoc :version version)
    deployment (assoc :context {:deployment deployment})))

(defn docs-request
  "POSTs `body` to the docs assistant's `/v1/ask`, asking for one JSON object. Returns `{:status :body}`
  with the body decoded, or throws on a network failure."
  [body]
  (let [response (http/post (str (str/replace (metabot.settings/metabot-docs-api-url) #"/+$" "") "/v1/ask")
                            {:headers            {"accept" "application/json"}
                             :content-type       "application/json; charset=utf-8"
                             :body               (json/encode body)
                             :throw-exceptions   false
                             :connection-timeout 5000
                             ;; An answer is written by a model: it can take a while.
                             :socket-timeout     60000})]
    {:status (:status response)
     :body   (try (json/decode+kw (:body response)) (catch Exception _ nil))}))

(tools/defrecoverable docs-unavailable!
  "The docs assistant could not answer: it failed, refused (rate limit) or could not be reached."
  {:payload [:map {:closed true} [:status [:maybe :int]]]}
  [_]
  {:message  "The Metabase docs could not be searched right now."
   :recovery [{:uses #{}
               :text (str "Answer without the docs: say that you could not check the documentation, give only "
                          "what you are sure of, and point the user to https://www.metabase.com/docs/latest/.")}]})

(defn ask-docs
  "The docs assistant's answer to `question`, for this instance's version and deployment. A version the
  assistant does not index (an old one) is asked against the newest docs instead."
  [question]
  (let [setup    {:version    (docs-version (:tag config/mb-version-info))
                  :deployment (if (premium-features/is-hosted?) "cloud" "self-hosted")}
        ask      (fn [setup]
                   (try
                     (docs-request (request-body question setup))
                     (catch Exception e
                       (log/warn e "Docs assistant unreachable")
                       {:status nil})))
        response (ask setup)
        response (if (and (:version setup)
                          (= 400 (:status response))
                          (= "unknown_version" (get-in response [:body :error])))
                   (ask (dissoc setup :version))
                   response)]
    (if (= 200 (:status response))
      (:body response)
      (do (log/warnf "Docs assistant answered %s: %s" (:status response) (get-in response [:body :error]))
          (docs-unavailable! {:status (:status response)})))))

(defn- format-output
  [{:keys [answer citations grounded version]}]
  (str "<metabase_docs version=\"" (llm-shape/escape-xml (str version)) "\" grounded=\"" (boolean grounded) "\">\n"
       "<answer>\n" (llm-shape/escape-xml (str answer)) "\n</answer>\n"
       (when (seq citations)
         (str "<sources>\n"
              (str/join "\n" (for [{:keys [n title heading url]} citations]
                               (str "<source n=\"" n "\" title=\""
                                    (llm-shape/escape-xml (str title (when (and (seq heading) (not= heading title))
                                                                       (str " › " heading))))
                                    "\" url=\"" (llm-shape/escape-xml (str url)) "\"/>")))
              "\n</sources>\n"))
       "</metabase_docs>\n"
       (if grounded
         (str "Answer the user from this documentation. Keep the steps and the plan or version requirements it "
              "names, adapt them to the user's situation, and link the pages you rely on with Markdown links to "
              "the source URLs (the [n] markers refer to the sources). Do not add Metabase facts that it does "
              "not state.")
         (str "The docs do not cover this. Tell the user so, share the closest pages above if there are any, "
              "and do not answer from memory."))))

(defrecord SearchMetabaseDocumentationTool []
  tools/Tool
  (declaration [_]
    {:name                 "search_metabase_documentation"
     :description          (str "Answer a question about Metabase itself from the official Metabase documentation: "
                                "how a feature works or where to find it, settings and environment variables, "
                                "installation and upgrades, permissions, embedding, Metabase Cloud, error messages "
                                "and the REST API. Returns an answer written from the docs of this instance's "
                                "Metabase version, with the source pages. Call it whenever the user wants "
                                "information about Metabase rather than about their data. Pass the question as one "
                                "standalone sentence, with the details from the conversation that matter.")
     :args                 [:map {:closed true}
                            [:question [:string {:min 1 :max max-question-length}]]]
     :metabot/capabilities #{:feature-docs-search}})
  (handle [_ {:keys [question]} _ctx]
    {:output (format-output (ask-docs (str/trim question)))}))

(def search-metabase-documentation-tool
  "The tool that answers questions about Metabase from the Metabase docs."
  (->SearchMetabaseDocumentationTool))
