(ns metabase.metabot.self.adapter
  "Shared scaffolding for the LLM provider adapters in `metabase.metabot.self.*`.

  Every adapter does the same handful of things around whatever is genuinely provider-specific
  (request bodies, stream translation, capability quirks): it names itself in errors, refuses the
  Metabase Cloud AI proxy unless it can serve one, fetches a model catalog and intersects it with an
  allow-list, and opens a streaming request wrapped in a span, a debug capture, and provider-friendly
  error translation. That scaffolding lives here so an adapter is only its differences.

  Adapters start from a [[provider]] descriptor and pass it to the helpers below."
  (:require
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Descriptor -------------------------------------------------

(defn- status-error-msg-fn
  "Build the `res->message` callback [[core/rethrow-api-error!]] and [[core/reducible-with-api-errors]] take.

  `errors` maps an HTTP status to a thunk returning that status's user-facing message; a status with no
  entry falls back to naming the provider and the status. The messages stay thunks so each one is
  rendered in the caller's locale at throw time, the way an inline `tru` would be."
  [display-name errors]
  (fn [res]
    (let [status (long (:status res 0))]
      (if-let [msg (get errors status)]
        (msg)
        (tru "{0} API error (HTTP {1})" display-name status)))))

(defn- bearer-auth-scheme
  "The default `:auth-scheme`: `Authorization: Bearer {api-key}`."
  [api-key]
  {"Authorization" (str "Bearer " api-key)})

(defn provider
  "Build the descriptor the helpers in this namespace take as their first argument.

    :slug         - the `llm-providers` type string. Tags errors and debug logs, and names the span
                    unless `:span` overrides it.
    :display-name - the human name spliced into user-facing messages.
    :errors       - HTTP status -> thunk returning that status's message (see [[status-error-msg-fn]]).
    :headers      - headers every request to this provider carries (e.g. an API version).
    :auth-scheme  - API key -> auth headers. Defaults to `Authorization: Bearer`.
    :ai-proxy?    - whether the Metabase Cloud AI proxy can serve this provider. Defaults to false,
                    which makes [[stream!]] and [[fetch-catalog]] reject a proxied request.
    :span         - the request span's `:name`. Defaults to `:metabot.{slug}/request`."
  [{:keys [slug display-name errors auth-scheme span] :as descriptor}]
  (assoc descriptor
         :error-msg   (status-error-msg-fn display-name errors)
         :auth-scheme (or auth-scheme bearer-auth-scheme)
         :span        (or span (keyword (str "metabot." slug) "request"))))

(defn rethrow!
  "Rethrow a provider HTTP exception with `p`'s own user-facing message. See [[core/rethrow-api-error!]]."
  [{:keys [slug error-msg]} e]
  (core/rethrow-api-error! slug error-msg e))

;;; ------------------------------------------------- AI proxy ---------------------------------------------------

(defn reject-ai-proxy!
  "Throw when `ai-proxy?` asks for a proxied request to a provider the proxy cannot serve.

  [[stream!]] and [[fetch-catalog]] apply this themselves, from the descriptor's `:ai-proxy?`; adapters
  call it directly only for the request paths that go through neither."
  [{:keys [display-name ai-proxy?]} requested-proxy?]
  (when (and requested-proxy? (not ai-proxy?))
    (throw (ex-info (tru "AI proxy is not supported for {0}" display-name)
                    {:api-error  true
                     :error-code :proxy-unsupported}))))

;;; --------------------------------------------------- Auth -----------------------------------------------------

(defn- request-auth
  "The auth map for one request: the adapter's own `:auth` when it built one, else `p`'s `:auth-scheme` over
  the request's `:credentials`.

  A blank API key yields no auth map at all, so [[core/resolve-auth]] raises its own missing-key error
  unless the request is going through the proxy instead."
  [{:keys [slug display-name auth-scheme] :as p} {:keys [credentials ai-proxy? auth]}]
  (reject-ai-proxy! p ai-proxy?)
  (or auth
      (core/resolve-auth slug display-name
                         (when-let [k (not-empty (:api-key credentials))]
                           {:url     (:base-url credentials)
                            :headers (auth-scheme k)})
                         ai-proxy?)))

;;; ------------------------------------------------ Model catalog -----------------------------------------------

(defn data-entries
  "An `:extract` that reads an OpenAI-style catalog leniently, tolerating a body shape we don't recognize.
  The [[fetch-catalog]] default fails closed instead."
  [res]
  (get-in res [:body :data]))

(defn fetch-catalog
  "Fetch a provider's OpenAI-style model catalog and return its entries.

  This doubles as the credential round trip behind the admin Connect button for every provider whose
  catalog endpoint answers one, so failures are translated with the provider's own messages.

    :path    - the catalog endpoint, relative to the base URL. Defaults to `/models`.
    :headers - extra request headers, beyond the descriptor's own.
    :extract - res -> entries. Defaults to the fail-closed [[chat-completions/models-catalog]], which
               throws on a 2xx whose body is not a recognizable catalog rather than leaving the admin
               an empty model picker with no diagnostic."
  [{:keys [display-name] :as p}
   {:keys [path headers extract] :or {path "/models"} :as opts}]
  (try
    (let [res (core/request (request-auth p opts)
                            {:method  :get
                             :url     path
                             :as      :json
                             :headers (merge {"Content-Type" "application/json"} (:headers p) headers)})]
      (if extract
        (extract res)
        (chat-completions/models-catalog display-name res)))
    (catch Exception e
      (rethrow! p e))))

(defn listing
  "Shape a provider's catalog `entries` into the `{:models [{:id ... :display_name ...}]}` listing response.

  Keeps only the entries `supported-models` allows and sorts by id, so the admin picker is stable across
  catalog reorderings. `catalog-name?` prefers the catalog entry's own name over the allow-list's — only
  for providers that send one, since naming a model from a catalog that has just started carrying names
  would silently rename it in the picker."
  ([supported-models entries]
   (listing supported-models entries false))
  ([supported-models entries catalog-name?]
   {:models (->> entries
                 (filter (comp supported-models :id))
                 (sort-by :id)
                 (mapv (fn [{:keys [id] :as entry}]
                         {:id           id
                          :display_name (or (when catalog-name?
                                              (or (:name entry) (:display_name entry)))
                                            (get-in supported-models [id :display-name]))})))}))

(defn context-window-fn
  "The `context-window-tokens` fn for an adapter whose `supported-models` records one per model id."
  [supported-models]
  (fn [model]
    (get-in supported-models [model :context-window])))

;;; ------------------------------------------------- Streaming --------------------------------------------------

(defn stream!
  "Open a provider's streaming request and return a reducible over its raw SSE events.

  Wraps the exchange in what every adapter needs around it: the request span, the opt-in debug capture of
  the composed request and its response, and translation of failures into the provider's own messages —
  both at request time and mid-stream, since the SSE body is consumed lazily, long after this returns.

    :model       - the model being called, for the span and the debug log.
    :path        - the streaming endpoint, relative to the base URL.
    :body        - the composed request body. Encoded here.
    :headers     - extra request headers, beyond the descriptor's own and `Content-Type`.
    :request     - extra [[core/request]] opts, e.g. per-provider timeouts.
    :credentials - the connection's credentials, for the descriptor's `:auth-scheme`.
    :ai-proxy?   - whether to route through the Metabase Cloud AI proxy.
    :auth        - a resolved auth map, when the adapter builds its own.
    :send!       - a thunk performing the whole exchange and returning the response, for a provider that
                   signs its request over the encoded body. Runs inside the error translation, so a
                   failure to resolve credentials is translated too.
    :span-attrs  - extra attributes for the span.
    :wrap        - applied to the reducible before error translation, for an adapter with its own
                   translation to do first.
    :on-error    - replaces the default [[rethrow!]] catch, for an adapter that retries."
  [{:keys [slug display-name span] :as p}
   {:keys [model path body headers request send! span-attrs wrap on-error]
    :or   {wrap identity}
    :as   opts}]
  (let [send!      (or send!
                       (fn []
                         (core/request (request-auth p opts)
                                       (merge {:method  :post
                                               :url     path
                                               :as      :stream
                                               :headers (merge {"Content-Type" "application/json"}
                                                               (:headers p) headers)
                                               :body    (json/encode body)}
                                              request))))
        ;; every dialect we speak carries its turns under one of these two keys
        msg-count  (count (or (:messages body) (:input body)))
        tool-count (count (:tools body))]
    (log/debug (str display-name " request") {:model model :msg-count msg-count :tools tool-count})
    (with-span :info (cond-> {:name       span
                              :model      model
                              :msg-count  msg-count
                              :tool-count tool-count}
                       span-attrs (merge span-attrs))
      (try
        (-> (core/sse-reducible (:body (send!)))
            (debug/capture-stream {:provider slug
                                   :model    model
                                   :url      path
                                   :request  body})
            wrap
            (core/reducible-with-api-errors slug (:error-msg p)))
        (catch Exception e
          (if on-error
            (on-error e)
            (rethrow! p e)))))))
