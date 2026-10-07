(ns metabase.metabot.self.ollama.connection
  "Which Ollama server a connection points at, how to reach it, and whether Ollama Cloud serves a model.

  Ollama answers on two surfaces: the OpenAI-compatible API the adapter generates against, mounted
  under the `/v1` an admin's base URL ends in, and Ollama's own API at the server root. Both live on
  the same host and take the same key, so which one a caller wants is the only thing that differs.

  Nothing here reaches the network. [[metabase.metabot.self.ollama.capabilities]] is the layer above
  that does.

  https://docs.ollama.com/api/openai-compatibility"
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def Credentials
  "An Ollama connection's `:config` — the shape every adapter entry point receives as `:credentials`.

  `:maybe`, and every key optional: a caller with no connection at all — a request body built outside
  any connection — passes nothing."
  [:maybe
   [:map {:closed true}
    [:api-key      {:optional true} [:maybe :string]]
    [:base-url     {:optional true} [:maybe :string]]
    ;; recorded by the connect-time probe, not entered by the admin
    [:probed-model {:optional true} [:maybe :string]]]])

(defn- missing-base-url-ex []
  ;; `provider-client-error?` needs a numeric status to render this under the field; without one the
  ;; admin gets a 500.
  (ex-info (tru "No Ollama base URL is set. Give the address of your server, or https://ollama.com/v1 for Ollama Cloud.")
           {:api-error   true
            :status-code 400
            :field       :base-url
            :error-code  :base-url-missing}))

(mu/defn base-url :- :string
  "The address to call.

  Public because the adapter's transport errors name the address they failed to reach."
  [credentials :- Credentials]
  (or (not-empty (:base-url credentials)) (throw (missing-base-url-ex))))

;;; ------------------------------------------------ Ollama Cloud ------------------------------------------------

(defn- cloud-address?
  "Whether `url` is Ollama Cloud's own API, `https://ollama.com/v1`, rather than a server of the operator's."
  [url]
  (let [host (some-> (u.http/->hostname url) u/lower-case-en)]
    (boolean (and host (or (= "ollama.com" host) (str/ends-with? host ".ollama.com"))))))

(defn- cloud-tag?
  "Whether `model` names a Cloud model by Ollama's own rule (`parseSourceSuffix` in
  `internal/modelref/modelref.go`): the part after the last `:` is `cloud`, or ends in `-cloud`, in any case.
  A self-hosted server forwards such a model to ollama.com, request body and all."
  [model]
  (boolean
   (when-let [idx (some-> model (str/last-index-of ":"))]
     (let [suffix (u/lower-case-en (str/trim (subs model (inc idx))))]
       (or (= "cloud" suffix)
           (and (not (str/includes? suffix "/"))
                (str/ends-with? suffix "-cloud")))))))

(mu/defn served-by-cloud? :- :boolean
  "Whether Ollama Cloud serves `model` on this connection — what decides how a forced tool call is
  expressed, since Cloud discards both `tool_choice` and a `response_format` grammar.

  Either signal is enough. Ollama Cloud's own address serves every model under its plain name
  (`gemma4:31b`), so there the address is the only signal; a self-hosted server serves a Cloud model
  under a name that says so (`gpt-oss:120b-cloud`) and forwards it.

  Neither catches a Cloud model copied to a name without the suffix, nor a gateway in front of
  ollama.com. Both are taken for self-hosted and get a grammar."
  [credentials :- Credentials
   model       :- [:maybe :string]]
  (or (cloud-address? (:base-url credentials))
      (cloud-tag? model)))

(mu/defn- resolve-auth :- adapter/Auth
  [credentials :- Credentials]
  (let [token (not-empty (:api-key credentials))]
    (core/resolve-auth "ollama" "Ollama"
                       (cond-> {:url (base-url credentials)}
                         token (assoc :headers {"Authorization" (str "Bearer " token)}))
                       false)))

(mu/defn auth :- adapter/Auth
  "Ollama's `:auth`, for the OpenAI-compatible API the adapter generates against.

  Never nil, so `core/resolve-auth`'s missing-key branch is unreachable: a keyless self-hosted server
  is the normal configuration, not a broken one. The proxy is refused before this runs — the
  descriptor declares no `:supports-ai-proxy?`, so [[adapter/request!]] rejects a proxied call."
  [_provider             :- adapter/Provider
   {:keys [credentials]} :- adapter/Request]
  (resolve-auth credentials))

(mu/defn native-auth :- adapter/Auth
  "Auth for Ollama's own API, which lives at the server root rather than under the `/v1` the
  OpenAI-compatible surface is mounted at. Ollama Cloud serves it on the same host, and takes the same key."
  [credentials :- Credentials]
  (update (resolve-auth credentials) :url str/replace #"/v1/*$" ""))

(def native-provider
  "Descriptor for Ollama's own API, the surface that answers `/api/show` and `/api/ps`.

  A second descriptor rather than a second door: the adapter's own descriptor authenticates the
  OpenAI-compatible surface, and everything else [[adapter/request!]] does — the proxy refusal, the
  `Content-Type` only where there is a body — applies here unchanged. It carries no `:errors`, because
  every caller on this surface treats a failure as \"the server would not say\" and swallows it."
  (adapter/provider
   {:slug         "ollama"
    :display-name "Ollama"
    :auth         (fn [_provider {:keys [credentials]}] (native-auth credentials))}))
