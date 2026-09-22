(ns metabase.metabot.self.typesafe
  "TypeSafe adapter, serving the Jev System One model. See [[metabase.metabot.self.system-one]] for what a System One
  model is and for the provider-neutral question and answer shapes this namespace translates to and from.

    - `POST {base-url}/v1/systemone` — answer a batch of typed questions about one state
    - `GET  {base-url}/v1/models`    — the model catalog, used only as the admin Connect round trip

  The wire format is already the provider-neutral shape with string keys, so translation is mostly re-keying: question
  keys and choice option keys go out as strings and come back as whatever the caller used.

  https://docs.typesafe.ai/api"
  (:require
   [metabase.metabot.self.core :as core]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(def default-model
  "The model a request runs on when it names none: TypeSafe's alias for its current production Jev."
  "jev-latest")

(def ^:private system-one-path "/v1/systemone")

(def ^:private models-path "/v1/models")

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for TypeSafe")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- typesafe-error-msg
  "Canonical, status-specific TypeSafe error message. 529 is TypeSafe's own overloaded status."
  [res]
  (let [status (long (:status res 0))]
    (case status
      400 (tru "TypeSafe rejected the request — check the questions and state")
      401 (tru "TypeSafe API key expired or invalid")
      403 (tru "TypeSafe denied access — check the API key permissions")
      404 (tru "TypeSafe API endpoint or model was not found — check the base URL and model")
      422 (tru "TypeSafe rejected the request parameters")
      429 (tru "TypeSafe has rate limited us")
      500 (tru "TypeSafe returned an internal server error")
      529 (tru "TypeSafe is overloaded and is asking us to wait")
      (tru "TypeSafe API error (HTTP {0})" status))))

(defn- auth
  [{:keys [api-key base-url]} ai-proxy?]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (core/resolve-auth "typesafe" "TypeSafe"
                     (when-let [k (not-empty api-key)]
                       {:url     base-url
                        :headers {"Authorization" (str "Bearer " k)}})
                     ai-proxy?))

;;; ------------------------------------------------ Translation -------------------------------------------------

(defn- wire-key [k]
  (if (keyword? k) (u/qualified-name k) (str k)))

(defn- wire-key->key
  "`{wire-key caller-key}` for `ks`. Throws when two keys, e.g. `:a` and `\"a\"`, would collide on the wire."
  [ks]
  (let [index (into {} (map (juxt wire-key identity)) ks)]
    (when (< (count index) (count ks))
      (throw (ex-info (tru "Question and option keys must stay distinct once sent as strings: {0}" (pr-str (vec ks)))
                      {:status-code 400 :keys (vec ks)})))
    index))

(defn- question->wire
  [{:keys [type criteria] :as question}]
  (cond-> (assoc question :type (name type))
    (= :choice type) (assoc :criteria (update-keys criteria wire-key))))

(defn request-body
  "The `/v1/systemone` request body for asking `questions` about `state`."
  [{:keys [state questions model]}]
  (wire-key->key (keys questions))
  (doseq [{:keys [type criteria]} (vals questions)
          :when (= :choice type)]
    (wire-key->key (keys criteria)))
  {:model     (or model default-model)
   :state     state
   :questions (into {}
                    (map (fn [[k question]] [(wire-key k) (question->wire question)]))
                    questions)})

(defn- level-map
  "A map keyed by score level: the wire sends levels as the strings `\"0\"`, `\"1\"`, ..."
  [m]
  (update-keys m parse-long))

(defn- wire->answer
  [{:keys [criteria]} answer]
  (case (get answer "type")
    "noul"   {:type :noul
              :noul (get answer "noul")}
    "choice" (let [option (wire-key->key (keys criteria))]
               {:type          :choice
                :choice        (option (get answer "choice") (get answer "choice"))
                :probabilities (update-keys (get answer "probabilities") #(option % %))
                :confidence    (get answer "confidence")})
    "score"  {:type          :score
              :score         (get answer "score")
              :probabilities (level-map (get answer "probabilities"))
              ;; the legend is the rubric echoed back, so it is rebuilt from the caller's own levels to hand back
              ;; exactly the values they sent rather than their JSON round trip
              :legend        (into {} (map-indexed vector) criteria)
              :confidence    (get answer "confidence")}
    (throw (ex-info (tru "TypeSafe returned an answer of unknown type {0}" (pr-str (get answer "type")))
                    {:answer answer}))))

(defn response->answers
  "Translate a decoded `/v1/systemone` response body into the provider-neutral response, keying each answer, and
  each choice option inside it, the way `questions` did."
  [questions body]
  (let [question-key (wire-key->key (keys questions))]
    {:model   (get body "model")
     :answers (into {}
                    (keep (fn [[wk answer]]
                            (when-let [k (question-key wk)]
                              [k (wire->answer (get questions k) answer)])))
                    (get body "answers"))
     :usage   {:input-tokens  (get-in body ["usage" "input_tokens"])
               :output-tokens (get-in body ["usage" "output_tokens"])}}))

;;; ------------------------------------------------ Requests ----------------------------------------------------

(defn system-one
  "Ask Jev a batch of typed `questions` about `state` in one request and return the provider-neutral response.

  `:credentials` is the connection's `{:api-key :base-url}`; adapters read credentials only, never settings, so this
  can be called at the REPL with a literal key before any connection exists. `:ai-proxy?` is not supported and throws
  when true."
  [{:keys [questions credentials ai-proxy?] :as opts}]
  (let [body (request-body opts)]
    (log/debug "TypeSafe request" {:model (:model body) :question-count (count questions)})
    (with-span :info {:name           :metabot.typesafe/request
                      :model          (:model body)
                      :question-count (count questions)}
      (try
        (let [res (core/request (auth credentials ai-proxy?)
                                {:method  :post
                                 :url     system-one-path
                                 :as      :string
                                 :headers {"Content-Type" "application/json"}
                                 :body    (json/encode body)})]
          (response->answers questions (json/decode (:body res))))
        (catch Exception e
          (core/rethrow-api-error! "typesafe" typesafe-error-msg e))))))

(defn list-models
  "Verify the credentials against TypeSafe's model catalog and return no models.

  The catalog is fetched only because it is the credential round trip behind the admin Connect button. Its models are
  deliberately not offered: System One models cannot serve Metabot, so there is nothing to pick them for."
  ([] (list-models {}))
  ([{:keys [credentials ai-proxy?]}]
   (try
     (core/request (auth credentials ai-proxy?)
                   {:method  :get
                    :url     models-path
                    :as      :string
                    :headers {"Content-Type" "application/json"}})
     {:models []}
     (catch Exception e
       (core/rethrow-api-error! "typesafe" typesafe-error-msg e)))))
