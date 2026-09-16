(ns metabase.metabot.self.ollama.connection
  "Which Ollama server a connection points at, and how to reach it.

  Ollama answers on two surfaces: the OpenAI-compatible API the adapter generates against, mounted
  under the `/v1` an admin's base URL ends in, and Ollama's own API at the server root. Both live on
  the same host and take the same key, so which one a caller wants is the only thing that differs.

  Nothing here reaches the network. [[metabase.metabot.self.ollama.capabilities]] is the layer above
  that does.

  https://docs.ollama.com/api/openai-compatibility"
  (:require
   [clojure.string :as str]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.core :as core]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def Credentials
  "An Ollama connection's `:config`, with the provider type's field defaults filled in — the shape
  every adapter entry point receives as `:credentials`.

  Open, and `:maybe`: the map carries whatever else the connection holds (timeouts, what a probe
  learned), and a caller with no connection at all — a request body built outside any connection —
  passes nothing. `:hosting` is optional for the same reason, even though the registry marks the
  field required and defaults it: it is only guaranteed once `with-field-defaults` has run.

  The `:hosting` values are the registry's own, rather than restated here, so the schema cannot drift
  from the options the admin's form offers. Instrumentation is dev and test only, so this catches a
  wrong value where it is a developer's mistake without turning a hand-written `llm-providers` typo
  into a 500 in production — there, an unrecognized value reads as self-hosted and the admin gets
  [[missing-base-url-ex]]'s advice instead."
  [:maybe
   [:map
    [:hosting  {:optional true} [:maybe [:enum llm.provider/ollama-self-hosted llm.provider/ollama-cloud]]]
    [:base-url {:optional true} [:maybe :string]]
    [:api-key  {:optional true} [:maybe :string]]]])

(def Auth
  "An address to call and the headers to call it with, as [[metabase.metabot.self.core/request]]
  takes them."
  [:map
   [:url     :string]
   [:headers {:optional true} [:maybe [:map-of :string :string]]]])

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for Ollama")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- missing-base-url-ex []
  ;; `provider-client-error?` needs a numeric status to render this under the field; without one the
  ;; admin gets a 500. The base URL is only conditionally required, so the adapter owns this error.
  (ex-info (tru "No Ollama base URL is set. Give the address of your server, or switch this connection to Ollama Cloud.")
           {:api-error   true
            :status-code 400
            :field       :base-url
            :error-code  :base-url-missing}))

(def ^:private cloud-base-url
  "Ollama Cloud's OpenAI-compatible API — the one Ollama address that is not configurable."
  "https://ollama.com/v1")

(mu/defn cloud? :- :boolean
  "Whether a connection is Ollama Cloud."
  [credentials :- Credentials]
  (= llm.provider/ollama-cloud (:hosting credentials)))

(defn- resolve-base-url
  "The address to call. A self-hosted connection with no address throws rather than falling through
  to Cloud, which would send the operator's data somewhere they did not choose."
  [credentials]
  (if (cloud? credentials)
    cloud-base-url
    (or (not-empty (:base-url credentials)) (throw (missing-base-url-ex)))))

(mu/defn auth :- Auth
  "Auth for the OpenAI-compatible API — the surface the adapter generates against.

  Never nil, so `core/resolve-auth`'s missing-key branch is unreachable: a keyless self-hosted server
  is the normal configuration, not a broken one. Throws when `ai-proxy?` is set, which is how every
  Ollama entry point refuses the proxy: it fronts hosted providers, and a self-hosted server is
  reached directly."
  [credentials :- Credentials
   ai-proxy?   :- [:maybe :boolean]]
  (when ai-proxy? (throw (ai-proxy-unsupported-ex)))
  (let [token (not-empty (:api-key credentials))
        auth  (merge {:url (resolve-base-url credentials)}
                     (when token {:headers {"Authorization" (str "Bearer " token)}}))]
    (core/resolve-auth "ollama" "Ollama" auth ai-proxy?)))

(mu/defn native-auth :- Auth
  "Auth for Ollama's own API, which lives at the server root rather than under the `/v1` the
  OpenAI-compatible surface is mounted at. Cloud serves it on the same host, and takes the same key."
  [credentials :- Credentials]
  (update (auth credentials false) :url str/replace #"/v1/*$" ""))
