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
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Schemas ---------------------------------------------------

(def Auth
  "The `{:url ... :headers ...}` pair [[core/request]] sends a request with. A server that takes no key at
  all (vLLM started without `--api-key`) carries no headers."
  [:map
   [:url     {:optional true} [:maybe :string]]
   [:headers {:optional true} [:maybe [:map-of :string :string]]]])

(def Request
  "One HTTP request to a provider, as [[request!]] performs it and a descriptor's `:auth` sees it.
  `:credentials` and `:ai-proxy?` come from the caller; the rest describe the wire. `:body` is already
  encoded, so a provider that signs over it can."
  [:map
   [:method                       :keyword]
   [:path                         :string]
   [:credentials {:optional true} [:maybe :map]]
   [:ai-proxy?   {:optional true} [:maybe :boolean]]
   [:as          {:optional true} [:maybe :keyword]]
   [:headers     {:optional true} [:maybe [:map-of :string :string]]]
   [:body        {:optional true} [:maybe :string]]])

(def ProviderSpec
  "What an adapter hands [[provider]]; see that fn for what each key means."
  [:map
   [:slug                         :string]
   [:display-name                 :string]
   [:errors      {:optional true} [:maybe [:map-of :int [:fn fn?]]]]
   [:headers     {:optional true} [:maybe [:map-of :string :string]]]
   [:auth        {:optional true} [:maybe [:fn fn?]]]
   [:ai-proxy?   {:optional true} [:maybe :boolean]]])

(def Provider
  "A built descriptor: a [[ProviderSpec]] with `:auth` defaulted and `:span` and `:error-msg` derived.
  Every helper here takes one as its first argument."
  [:map
   [:slug                         :string]
   [:display-name                 :string]
   [:errors      {:optional true} [:maybe [:map-of :int [:fn fn?]]]]
   [:headers     {:optional true} [:maybe [:map-of :string :string]]]
   [:ai-proxy?   {:optional true} [:maybe :boolean]]
   [:auth                         [:fn fn?]]
   [:span                         :keyword]
   [:error-msg                    [:fn fn?]]])

(def SupportedModels
  "An adapter's allow-list of the models it offers in the picker, keyed by model id. A provider that
  publishes no context window for a model (DeepSeek) records only the display name."
  [:map-of :string [:map
                    [:display-name                   :string]
                    [:context-window {:optional true} [:maybe :int]]]])

(def Listing
  "The model-listing response the admin picker consumes."
  [:map
   [:models [:sequential [:map
                          [:id           :string]
                          [:display_name [:maybe :string]]]]]])

(def CatalogOpts
  "How an adapter reaches its model catalog; see [[fetch-catalog]]."
  [:map
   [:path {:optional true} [:maybe :string]]])

(def StreamOpts
  "How an adapter puts one request on the wire; see [[stream!]]."
  [:map
   [:path                        :string]
   [:body                        :map]
   [:headers    {:optional true} [:maybe [:map-of :string :string]]]
   [:request    {:optional true} [:maybe :map]]
   [:span-attrs {:optional true} [:maybe :map]]
   [:wrap       {:optional true} [:maybe [:fn fn?]]]
   [:on-error   {:optional true} [:maybe [:fn fn?]]]])

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

;;; --------------------------------------------------- Auth -----------------------------------------------------

(mu/defn reject-ai-proxy! :- :nil
  "Throw when `ai-proxy?` asks for a proxied request to a provider the proxy cannot serve.

  [[request!]] applies this, so the check lands on every request to a provider — an adapter's own
  request paths included, since those go through [[request!]] too."
  [{:keys [display-name ai-proxy?]} :- Provider
   requested-proxy?                    :- [:maybe :boolean]]
  (when (and requested-proxy? (not ai-proxy?))
    (throw (ex-info (tru "AI proxy is not supported for {0}" display-name)
                    {:api-error  true
                     :error-code :proxy-unsupported}))))

(mu/defn bearer-auth :- Auth
  "The default `:auth`: carry the connection's API key as `Authorization: Bearer`. Nothing about the
  request itself matters, which is true of every provider that authenticates per connection.

  A blank key passes no auth map at all, so [[core/resolve-auth]] raises the provider's own missing-key
  error rather than sending an unauthenticated request."
  [{:keys [slug display-name]}       :- Provider
   {:keys [credentials ai-proxy?]}   :- Request]
  (core/resolve-auth slug display-name
                     (when-let [k (not-empty (:api-key credentials))]
                       {:url     (:base-url credentials)
                        :headers {"Authorization" (str "Bearer " k)}})
                     ai-proxy?))

(mu/defn request!
  "Perform one HTTP request to `p` and return the response.

  The single door every provider request goes through, so what is true of all of them lives here rather
  than in each adapter: a proxied request `p` cannot serve is refused, and the descriptor's `:auth`
  authenticates whatever is left. `req` carries the caller's `:credentials` and `:ai-proxy?` alongside
  the wire details (`:method`, `:path`, `:as`, `:headers`, and an already-encoded `:body`); `extra` is
  merged into the [[core/request]] opts, for per-provider timeouts and the like."
  ([p req]
   (request! p req nil))
  ([{:keys [auth] :as p}                                    :- Provider
    {:keys [method path body as headers ai-proxy?] :as req} :- Request
    extra                                                   :- [:maybe :map]]
   (reject-ai-proxy! p ai-proxy?)
   (core/request (auth p req)
                 (merge (cond-> {:method  method
                                 :url     path
                                 :headers (merge (:headers p) headers)}
                          as   (assoc :as as)
                          body (assoc :body body))
                        extra))))

(mu/defn provider :- Provider
  "Build the descriptor the helpers in this namespace take as their first argument.

    :slug         - the `llm-providers` type string. Tags errors and debug logs, and names the request
                    span `:metabot.{slug}/request`.
    :display-name - the human name spliced into user-facing messages.
    :errors       - HTTP status -> thunk returning that status's message (see [[status-error-msg-fn]]).
    :headers      - headers every request to this provider carries (e.g. an API version).
    :auth         - how this provider authenticates one request: a fn of the descriptor and the request
                    (`:credentials`, `:ai-proxy?`, `:method`, `:path`, and the encoded `:body`),
                    returning the `{:url ... :headers ...}` [[core/request]] takes. Defaults to
                    [[bearer-auth]]. Everything provider-specific about authenticating lives here — the
                    header the key travels in, the validation its credentials need, or a signature over
                    the request itself.
    :ai-proxy?    - whether the Metabase Cloud AI proxy can serve this provider. Defaults to false,
                    which makes [[request!]] reject a proxied request."
  [{:keys [slug display-name errors auth] :as descriptor} :- ProviderSpec]
  (assoc descriptor
         :error-msg (status-error-msg-fn display-name errors)
         :auth      (or auth bearer-auth)
         :span      (keyword (str "metabot." slug) "request")))

(mu/defn rethrow!
  "Rethrow a provider HTTP exception with `p`'s own user-facing message. See [[core/rethrow-api-error!]]."
  [{:keys [slug error-msg]} :- Provider
   e                        :- [:fn #(instance? Throwable %)]]
  (core/rethrow-api-error! slug error-msg e))

;;; ------------------------------------------------ Model catalog -----------------------------------------------

(mu/defn fetch-catalog :- [:maybe [:sequential :map]]
  "Fetch a provider's OpenAI-style model catalog and return its entries.

  This doubles as the credential round trip behind the admin Connect button for every provider whose
  catalog endpoint answers one, so failures are translated with the provider's own messages.

  Entries come from [[chat-completions/models-catalog]], which fails closed: a 2xx whose body is not a
  recognizable catalog throws rather than yielding no entries, which would leave the admin an empty model
  picker and a Connect button that succeeded against a provider we never actually reached. A well-formed
  but empty catalog is a legitimate answer and passes.

  `opts` is the caller's request. The third argument carries `:path`, the catalog endpoint relative to
  the base URL, for a provider that does not serve one at `/models`. The descriptor's own `:headers`
  ride along either way."
  ([p opts]
   (fetch-catalog p opts nil))
  ([{:keys [display-name] :as p}         :- Provider
    {:keys [credentials ai-proxy?]}      :- core/LLMRequestOpts
    {:keys [path] :or {path "/models"}}  :- [:maybe CatalogOpts]]
   (try
     (let [res (request! p {:credentials credentials
                            :ai-proxy?   ai-proxy?
                            :method      :get
                            :path        path
                            :as          :json
                            :headers     {"Content-Type" "application/json"}})]
       (chat-completions/models-catalog display-name res))
     (catch Exception e
       (rethrow! p e)))))

(mu/defn listing :- Listing
  "Shape a provider's catalog `entries` into the `{:models [{:id ... :display_name ...}]}` listing response.

  Keeps only the entries `supported-models` allows and sorts by id, so the admin picker is stable across
  catalog reorderings. `catalog-name?` prefers the catalog entry's own name over the allow-list's — only
  for providers that send one, since naming a model from a catalog that has just started carrying names
  would silently rename it in the picker."
  ([supported-models entries]
   (listing supported-models entries false))
  ([supported-models :- SupportedModels
    entries          :- [:maybe [:sequential :map]]
    catalog-name?    :- [:maybe :boolean]]
   {:models (->> entries
                 (filter (comp supported-models :id))
                 (sort-by :id)
                 (mapv (fn [{:keys [id] :as entry}]
                         {:id           id
                          :display_name (or (when catalog-name?
                                              (or (:name entry) (:display_name entry)))
                                            (get-in supported-models [id :display-name]))})))}))

(mu/defn context-window-fn :- [:fn fn?]
  "The `context-window-tokens` fn for an adapter whose `supported-models` records one per model id."
  [supported-models :- SupportedModels]
  (fn [model]
    (get-in supported-models [model :context-window])))

;;; ------------------------------------------------- Streaming --------------------------------------------------

(mu/defn stream!
  "Open a provider's streaming request and return a reducible over its raw SSE events.

  Wraps the exchange in what every adapter needs around it: the request span, the opt-in debug capture of
  the composed request and its response, and translation of failures into the provider's own messages —
  both at request time and mid-stream, since the SSE body is consumed lazily, long after this returns.

  `opts` is the caller's request — its `:model` names the span and the debug log, and its `:credentials`
  and `:ai-proxy?` are what the descriptor's `:auth` authenticates from. The third argument says how this
  adapter puts that request on the wire:

    :path       - the streaming endpoint, relative to the base URL.
    :body       - the composed request body. Encoded here.
    :headers    - extra request headers, beyond the descriptor's own and `Content-Type`.
    :request    - extra [[core/request]] opts, e.g. per-provider timeouts.
    :span-attrs - extra attributes for the span.
    :wrap       - applied to the reducible before error translation, for an adapter with its own
                  translation to do first.
    :on-error   - replaces the default [[rethrow!]] catch, for an adapter that retries."
  [{:keys [slug display-name span] :as p}   :- Provider
   {:keys [model credentials ai-proxy?]}   :- core/LLMRequestOpts
   {:keys [path body headers request span-attrs wrap on-error]
    :or   {wrap identity}}                 :- StreamOpts]
  (let [send!      (fn []
                     ;; encoded up front, since a provider may sign over the body
                     (request! p {:credentials credentials
                                  :ai-proxy?   ai-proxy?
                                  :method      :post
                                  :path        path
                                  :as          :stream
                                  :headers     (merge {"Content-Type" "application/json"} headers)
                                  :body        (json/encode body)}
                               request))
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
