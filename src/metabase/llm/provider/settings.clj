(ns metabase.llm.provider.settings
  "Where LLM provider connections are stored, and the vocabulary the provider type registry validates their
  credential fields against.

  Split out of [[metabase.llm.settings]] so that [[metabase.llm.provider]] can name these directly:
  `metabase.llm.settings` backs its per-provider credential settings with `metabase.llm.provider`, and nothing here
  does."
  (:require
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]])
  (:import
   (software.amazon.awssdk.regions Region)))

(set! *warn-on-reflection* true)

(def known-aws-regions
  "The set of AWS region ids known to the bundled AWS SDK, e.g. `\"us-east-1\"`.
  Used to validate [[metabase.llm.settings/llm-bedrock-region]]."
  (into #{} (map str) (Region/regions)))

(def ^:private google-project-id-pattern
  "Matches a Google Cloud project ID: 6 to 30 characters of lowercase letters, digits and hyphens, starting with a
  letter and not ending with a hyphen.
  https://docs.cloud.google.com/resource-manager/docs/creating-managing-projects"
  #"[a-z][a-z0-9-]{4,28}[a-z0-9]")

(defn valid-google-project-id?
  "True if `project-id` looks like a valid google project id."
  [project-id]
  (boolean (and (string? project-id)
                (re-matches google-project-id-pattern project-id))))

(def ^:private google-location-pattern
  "Matches a Google Cloud location ID, e.g. `us-central1`: hyphen-separated segments of lowercase letters and digits,
  the first of which starts with a letter."
  #"[a-z][a-z0-9]*(?:-[a-z0-9]+)*")

(def ^:private google-location-max-length
  "The longest location that still leaves a legal DNS label in `{location}-aiplatform.googleapis.com`.
  A label holds 63 characters and the `-aiplatform` suffix takes 11 of them."
  52)

(defn valid-google-location?
  "True if `location` can be spliced into a Gemini Enterprise Agent Platform request host.
  A location becomes a DNS label of that host, so a value that is not one cannot be sent.
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations"
  [location]
  (boolean (and (<= (count location) google-location-max-length)
                (re-matches google-location-pattern location))))

(def google-global-api-base-url
  "Google's global Gemini Enterprise Agent Platform host, and the default
  for [[metabase.llm.settings/llm-google-api-base-url]].
  It serves only the `global` location. A regional location uses `https://{location}-aiplatform.googleapis.com`, and
  the `us` and `eu` multi-region locations use `https://aiplatform.{location}.rep.googleapis.com`."
  "https://aiplatform.googleapis.com")

;;; ---------------------------------------------- Provider connections ------------------------------------------

(def ^:dynamic *allow-llm-provider-write*
  "Whether a trusted provider API operation may persist [[llm-providers]] during an HTTP request."
  false)

(defsetting llm-providers
  (deferred-tru "JSON array of configured LLM provider connections. Each entry has a `key` (a URL-safe slug identifying the connection), a `type` (the provider type, e.g. `anthropic`), a display `name`, and a `config` map of that provider type''s credential fields.")
  :type       :json
  :default    []
  :encryption :when-encryption-key-set
  :sensitive? true
  :visibility :internal
  :export?    false
  :audit      :no-value
  :setter     (fn [new-value]
                ;; Startup configuration and backend callers have no current request. During one, only the dedicated
                ;; provider API may write the backing setting; the generic settings API cannot perform its validation
                ;; or prove that secrets accompanying a base-URL change were freshly supplied.
                (when (and (request.current/current-request)
                        (not *allow-llm-provider-write*))
                  (throw (ex-info (tru "Manage LLM provider connections through the provider connection settings.")
                           {:status-code 400
                            :api-error   true
                            :error-code  :llm-providers-direct-write-forbidden})))
                ((requiring-resolve 'metabase.llm.provider/validate-changed-connections!) new-value)
                (setting/set-value-of-type! :json :llm-providers new-value))
  :doc        "Connections are normally managed from the admin AI settings page. Setting this environment variable puts the whole list under environment control and makes it read-only in the UI.

Configuring a provider through the single-provider variables (`MB_LLM_ANTHROPIC_API_KEY` and friends) is equally supported, and is the simpler option when you only need one connection per provider and would rather not hand-write JSON. Each such provider becomes a read-only connection whose key is the provider type, resolved from the environment on every read, so editing one of those variables is picked up on the next restart. A provider configured this way takes precedence over a stored connection with the same key.")

(defn set-llm-providers!
  "Allow the provider API and testing-only fixture endpoint to persist connections. Other HTTP paths must not write
  the backing setting directly."
  [providers]
  (binding [*allow-llm-provider-write* true]
    (llm-providers! providers)))

;;; --------------------------------------------------- Proxy ---------------------------------------------------

(defsetting llm-proxy-base-url
  (deferred-tru "Base URL for the LLM proxy. When set, requests to the managed Metabase AI service are routed through this proxy and authenticated with the instance token instead of a provider API key. Harbormaster adds /llm component into the url.")
  ;; For details on llm component see the https://github.com/metabase/metabase/pull/74526#discussion_r3282553435.
  :enabled?         #(or (premium-features/has-feature? :metabase-ai-managed)
                         (premium-features/has-feature? :offer-metabase-ai-managed)
                         (premium-features/has-feature? :metabot-v3))
  :encryption       :when-encryption-key-set
  :visibility       :internal
  :default          nil
  :export?          false
  :doc              false)
