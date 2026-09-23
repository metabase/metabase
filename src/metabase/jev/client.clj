(ns metabase.jev.client
  "Server-side client for TypeSafe's System One model (Jev).

  Jev returns typed *judgments* — pick one of a fixed set (`choice`), the probability a condition holds
  (`noul`), a position on an ordered rubric (`score`) — each with calibrated probabilities. It is fast
  (~0.1-0.4s) and its confidence is trustworthy (low when it is likely wrong), which makes it a good fit
  for offering an admin a *suggestion* they can accept or ignore.

  This ns owns the HTTP call + the server-side key. The key is read from the [[jev-token]] setting
  (settable over the API, `MB_JEV_TOKEN` env var), falling back to the legacy `JEV_KEY` process env var.
  Higher layers assemble `state` from Metabase data and hand it here; the `/api/jev` pass-through and the
  table-suggestions endpoint both go through [[ask]]."
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [metabase.jev.diagnostics :as diagnostics]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(def ^:dynamic *endpoint* "https://api.typesafe.ai/v1/systemone")
(def ^:dynamic *model* "jev-latest")

(defsetting jev-token
  (deferred-tru "API token for TypeSafe''s System One model (Jev). Used server-side to authenticate Jev requests; never sent to the browser.")
  :type       :string
  :encryption :when-encryption-key-set
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :audit      :no-value)

(defn- api-key
  "The Jev token: the [[jev-token]] setting if set, else the legacy `JEV_KEY` process env var."
  []
  (or (jev-token)
      (System/getenv "JEV_KEY")))

(defn key-present?
  "True when a Jev API key is configured (setting or legacy env var)."
  []
  (boolean (api-key)))

(defn- require-api-key []
  (or (api-key)
      (throw (ex-info "Jev token is not configured (set the `jev-token` setting or the JEV_KEY env var)"
                      {:status-code 503}))))

;;; ---- question constructors (the three judgment shapes) ----

(defn choice
  "A `choice` question: Jev picks one key from `criteria` (a map of option-key -> description). Use when
  exactly one category should win."
  [instructions criteria]
  {:type "choice" :instructions instructions :criteria criteria})

(defn noul
  "A `noul` question: the probability the condition in `instructions` holds. A value near 0.5 means
  genuinely uncertain, not \"medium.\""
  ([instructions] {:type "noul" :instructions instructions})
  ([instructions criteria] {:type "noul" :instructions instructions :criteria criteria}))

(defn score
  "A `score` question: a probability-weighted position on the ordered `levels` (a vector of concrete
  level descriptions, low to high). Use for graded judgments (e.g. relevance) — the answer spreads
  across the range far better than a `noul` yes/no, and carries its own confidence. Answer:
  `{:score n :confidence c :probabilities {level p} :legend {…}}`."
  [instructions levels]
  {:type "score" :instructions instructions :criteria levels})

;;; ---- the call ----

(defn ask
  "POST `state` + `questions` to Jev and return a result map. A failure is data, never a thrown
  exception, so callers can branch on `:ok`.

  Returns `{:ok true :answers {id answer} :usage {...} :model \"...\"}` on success, or
  `{:ok false :status <http-status-or-nil> :error <string> :body <raw>}` on failure."
  ([state questions] (ask state questions {}))
  ([state questions {:keys [model timeout-ms] :or {model *model* timeout-ms 30000}}]
   (try
     (let [body   {:model model :state state :questions questions}
           _      (diagnostics/capture-request! "jev" body)
           resp   (http/post *endpoint*
                             {:headers            {"Authorization" (str "Bearer " (require-api-key))
                                                   "Content-Type"  "application/json"}
                              :body               (json/generate-string body)
                              :socket-timeout     timeout-ms
                              :connection-timeout timeout-ms
                              :throw-exceptions   false
                              :as                 :string})
           status (:status resp)]
       (if (= 200 status)
         (let [parsed (json/parse-string (:body resp) true)]
           {:ok true :answers (:answers parsed) :usage (:usage parsed) :model (:model parsed)})
         {:ok false :status status :error (str "Jev returned HTTP " status) :body (:body resp)}))
     (catch Exception e
       {:ok false :status nil :error (ex-message e)}))))

(defn pass-through
  "Forward a raw Jev request `body` (`{:state :questions :model?}`) and return `{:status :body}`, parsing
  the JSON body when possible. Never throws on an HTTP error — the caller decides. Used by the dumb
  `/api/jev` proxy."
  [body]
  (let [resp (http/post *endpoint*
                        {:headers            {"Authorization" (str "Bearer " (require-api-key))
                                              "Content-Type"  "application/json"}
                         :body               (json/generate-string (merge {:model *model*} body))
                         :socket-timeout     30000
                         :connection-timeout 30000
                         :throw-exceptions   false
                         :as                 :string})]
    {:status (:status resp)
     :body   (try (json/parse-string (:body resp) true)
                  (catch Exception _ (:body resp)))}))
