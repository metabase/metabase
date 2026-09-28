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
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def Credentials
  "An Ollama connection's `:config`, with the provider type's field defaults filled in — the shape
  every adapter entry point receives as `:credentials`.

  `:maybe`, and every key optional: a caller with no connection at all — a request body built outside
  any connection — passes nothing, and `:hosting` is only guaranteed once `with-field-defaults` has run,
  even though the registry marks the field required and defaults it.

  [[core/OllamaCredentials]] with `:hosting` narrowed to the registry's own values, so the keys are
  declared once and the enum cannot drift from the options the admin's form offers. Instrumentation is dev
  and test only, so the narrowing catches a wrong value where it is a developer's mistake without turning
  a hand-written `llm-providers` typo into a 500 in production — there, an unrecognized value reads as
  self-hosted and the admin gets [[missing-base-url-ex]]'s advice instead."
  [:maybe
   [:merge
    core/OllamaCredentials
    [:map {:closed true}
     [:hosting {:optional true} [:maybe [:enum llm.provider/ollama-self-hosted llm.provider/ollama-cloud]]]]]])

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

(mu/defn base-url :- :string
  "The address to call. A self-hosted connection with no address throws rather than falling through
  to Cloud, which would send the operator's data somewhere they did not choose.

  Public because the adapter's transport errors name the address they failed to reach, and for Ollama
  that is not simply `(:base-url credentials)`: a Cloud connection carries none of its own."
  [credentials :- Credentials]
  (if (cloud? credentials)
    cloud-base-url
    (or (not-empty (:base-url credentials)) (throw (missing-base-url-ex)))))

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
  OpenAI-compatible surface is mounted at. Cloud serves it on the same host, and takes the same key."
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
