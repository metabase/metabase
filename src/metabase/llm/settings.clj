(ns metabase.llm.settings
  "Settings for LLM integration (provider credentials, model defaults, provider configuration)."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log])
  (:import
   (java.net MalformedURLException URL)
   (software.amazon.awssdk.regions Region)))

(set! *warn-on-reflection* true)

(def known-aws-regions
  "The set of AWS region ids known to the bundled AWS SDK, e.g. `\"us-east-1\"`.
  Used to validate [[llm-bedrock-region]]."
  (into #{} (map str) (Region/regions)))

(def ^:private loopback-hosts
  "Hostnames that resolve to the local machine. `URL.getHost` returns IPv6 hosts
  wrapped in brackets, e.g. `[::1]`."
  #{"localhost" "127.0.0.1" "[::1]" "::1"})

(defn assert-llm-host-allowed!
  "Safeguard for Cypress e2e tests: refuse to send an LLM request to any host
  other than localhost. e2e tests are expected to point the LLM URL at a local
  mock server (see `startMockLlmServer`), so throwing here keeps a misconfigured
  test run from sending traffic to a real provider. No-op outside of e2e mode and
  for blank URLs (so the normal not-configured handling still runs)."
  [url]
  (when (and config/is-e2e? (not (str/blank? url)))
    (let [host (try
                 (u/lower-case-en (.getHost (URL. ^String url)))
                 ;; A malformed URL can't be verified as localhost — treat it as
                 ;; not allowed (fail closed) rather than throwing raw.
                 (catch MalformedURLException _ nil))]
      (when-not (and host (contains? loopback-hosts host))
        (throw (ex-info (tru "Refusing to send an LLM request to non-localhost host ''{0}'' during e2e tests. Point the LLM base URL at a local mock server." (or host url))
                        {:status-code 400
                         :llm-url     url}))))))

(def ^:private network-policies
  "The `llm-allowed-networks` policies, loosest last."
  [:external-only :allow-private :allow-all])

(def ^:private network-policy-rank
  (zipmap network-policies (range)))

(defonce ^:private warned-network-policy-values
  (atom #{}))

(defsetting llm-allowed-networks
  (deferred-tru (str "Controls which networks Metabase may connect to for LLM provider base URLs. "
                     "Set through the environment only; on Metabase Cloud the default applies.\n"
                     "Options:\n"
                     "- external-only (default; only globally reachable public addresses)\n"
                     "- allow-private (external + private networks but NOT loopback or link-local)\n"
                     "- allow-all (no restrictions).\n"
                     "The Metabase AI service and LLM proxy are deployment configuration and may always use "
                     "private addresses."))
  :type       :keyword
  ;; Environment only. A settings manager is who this policy defends against, and on Cloud a customer admin
  ;; loosening it would be reaching for our own infrastructure, so nobody sets it through the API, and a value
  ;; that reached the app DB some other way is ignored rather than trusted.
  :visibility :internal
  :setter     :none
  :default    :external-only
  :export?    false
  :doc        (str "Set this when a self-hosted vLLM server is on your private network (allow-private) or on this "
                   "machine (allow-all). There is no admin UI for it, and a value stored in the application "
                   "database is ignored.")
  :getter     (fn []
                (let [value (some-> (setting/env-var-value :llm-allowed-networks) keyword)]
                  (cond
                    (nil? value)                          :external-only
                    (contains? network-policy-rank value) value
                    ;; fail closed on a typo, and say so once rather than on every request
                    :else
                    (do (when-not (contains? @warned-network-policy-values value)
                          (swap! warned-network-policy-values conj value)
                          (log/warnf "Ignoring MB_LLM_ALLOWED_NETWORKS=%s: expected one of %s; using external-only"
                                     (name value) (str/join ", " (map name network-policies))))
                        :external-only)))))

(defn network-policy
  "The network policy for an LLM request.
  `floor`, for a deployment-controlled endpoint such as the AI service, can only loosen [[llm-allowed-networks]]:
  the looser of the two applies."
  ([]
   (llm-allowed-networks))
  ([floor]
   (let [configured (llm-allowed-networks)]
     (if (and floor (> (network-policy-rank floor) (network-policy-rank configured)))
       floor
       configured))))

(defn- host-not-allowed-message
  "Why a base URL on `host` is refused under `policy`, and what to do about it.
  `policy` is the one that actually refused, which a deployment-controlled endpoint's floor may have loosened past
  [[llm-allowed-networks]]: naming a value that is already in force would be advice that changes nothing.
  On Cloud there is nothing to do: private networks are out of reach, and the policy is not the customer's to change."
  [policy host]
  (cond
    (premium-features/is-hosted?)
    (tru "The base URL host {0} is on a private network. Metabase Cloud can only connect to LLM providers on the public internet." host)

    (= :allow-private policy)
    (tru "The base URL host {0} is on a network Metabase is not allowed to connect to. Set MB_LLM_ALLOWED_NETWORKS=allow-all for a server on this machine." host)

    :else
    (tru "The base URL host {0} is on a network Metabase is not allowed to connect to. Set MB_LLM_ALLOWED_NETWORKS=allow-private for a server on your private network, or allow-all for one on this machine." host)))

(defn- url-not-allowed-ex
  "The 400 every policy refusal is thrown as, at set time and at connection time alike.
  `:status` sits beside `:status-code` because the semantic-search dead-letter queue files errors by `:status`, and a
  refused endpoint is a permanent failure, not one to retry on the fast schedule."
  ([message host]
   (url-not-allowed-ex message host nil))
  ([message host cause]
   (ex-info message
            {:status-code 400
             :status      400
             :api-error   true
             :error-code  :llm-host-not-allowed
             :llm-host    host}
            cause)))

(defn llm-url-syntax-problem
  "Why `url` cannot be an LLM provider base URL under any policy, or nil when it can: it must be an `http` or
  `https` URL that names a host and carries no username or password.
  Nothing here resolves the host, so it is cheap enough to run on every request.
  A blank `url` is not a problem here: the not-configured handling covers it."
  [url]
  (when-not (str/blank? url)
    (let [^URL parsed (try
                        (URL. ^String url)
                        (catch MalformedURLException _ nil))]
      (cond
        (not (and parsed (#{"http" "https"} (.getProtocol parsed)) (not-empty (.getHost parsed))))
        (tru "Invalid base URL: it must start with http:// or https://.")

        ;; it would otherwise ride along into error messages and ex-data
        (some? (.getUserInfo parsed))
        (tru "Invalid base URL: it must not contain a username or password.")))))

(defn llm-url-problem
  "Why `url` may not be used as an LLM provider base URL, or nil when it may: [[llm-url-syntax-problem]], and every
  address the host resolves to must be permitted by the network policy. The one-argument form uses
  [[llm-allowed-networks]].
  This is the set-time check. It resolves the host, so it is not run per request: the `:dns-resolver` from
  [[llm-request-opts]] makes the same decision about the addresses the connection actually opens, which also
  covers a host that rebinds after it was saved."
  ([url]
   (llm-url-problem (llm-allowed-networks) url))
  ([network-policy url]
   (or (llm-url-syntax-problem url)
       (when-not (str/blank? url)
         (let [host (.getHost (URL. ^String url))]
           (when-not (u.http/host-allowed-for-network-policy? network-policy host)
             (host-not-allowed-message network-policy host)))))))

(defn- proxied-url-problem
  "Why `url` may not be requested through a JVM proxy under `policy`, or nil when it may.

  [[llm-url-problem]], and additionally the host has to resolve. An unresolvable host is allowed everywhere else
  because the connection then fails on its own, but behind a proxy the proxy resolves the target: a name only it can
  answer -- a split-horizon record, a cluster-internal service -- would otherwise reach an address nothing checked."
  [policy url]
  (or (llm-url-problem policy url)
      (when-not (or (= policy :allow-all) (str/blank? url))
        (let [host (.getHost (URL. ^String url))]
          (when-not (seq (u.http/host->inet-addresses host))
            (tru "Metabase cannot resolve the base URL host {0}. Behind an HTTP proxy it has to resolve the host itself to hold it to MB_LLM_ALLOWED_NETWORKS." host))))))

(defn llm-request-opts
  "clj-http options that put the network policy on a request to `url`: redirects are never followed, and a
  `:dns-resolver` refuses any address the policy does not permit (omitted under `:allow-all`). Throws the same 400 as
  a set-time refusal when `url` fails [[llm-url-syntax-problem]]. `floor` is for a deployment-controlled endpoint,
  see [[network-policy]]. Pair with [[rethrow-if-llm-network-policy-error!]] around the request.

  Behind a JVM-wide proxy a `:dns-resolver` enforces nothing, so the check moves to [[proxied-url-problem]] here;
  see [[metabase.util.http/jvm-proxied-url?]]."
  ([url]
   (llm-request-opts nil url))
  ([floor url]
   (when-let [problem (llm-url-syntax-problem url)]
     (throw (url-not-allowed-ex problem (u.http/->hostname url))))
   (let [policy (network-policy floor)]
     (if (u.http/jvm-proxied-url? url)
       ;; An operator who configured a JVM proxy put it between Metabase and everything, deliberately, so it is
       ;; trusted rather than judged by the policy -- which is also what makes a private egress proxy usable under
       ;; `:external-only`. The proxy resolves the target on its own, so the target is checked here instead. That
       ;; leaves a host that rebinds between this check and the proxy's own lookup unnoticed, which no check on our
       ;; side of the proxy can close.
       (do (when-let [problem (proxied-url-problem policy url)]
             (throw (url-not-allowed-ex problem (u.http/->hostname url))))
           {:redirect-strategy :none})
       ;; nil under :allow-all, which leaves clj-http on its default resolver. Redirects stay disabled under every
       ;; policy: the resolver would stop an internal target, but credentials could otherwise follow a redirect to a
       ;; public host.
       (u/assoc-dissoc {:redirect-strategy :none}
                       :dns-resolver (u.http/network-policy-dns-resolver policy))))))

(defn llm-network-policy-error?
  "Whether `e` or one of its causes is a connection-time refusal from the policy DNS resolver."
  [e]
  (boolean (:ssrf (u/all-ex-data e))))

(defn rethrow-if-llm-network-policy-error!
  "Translate a connection-time refusal from the policy DNS resolver in `e` to the 400 a set-time refusal gets.
  Returns nil when `e` is unrelated. Logs the refusal: it is the only trace a host that rebinds leaves.
  The resolver records the policy it refused under, which is what the message and the log line report."
  [e url]
  (when (llm-network-policy-error? e)
    (let [host   (u.http/->hostname url)
          policy (or (:policy (u/all-ex-data e)) (llm-allowed-networks))]
      (log/warnf "Refused an LLM request to %s: it resolves to an address the %s network policy does not permit"
                 host (name policy))
      (throw (url-not-allowed-ex (host-not-allowed-message policy host) host e)))))

;; TODO (Chris 2026-08-17) -- BOT-2005: generate-sql and semantic search read these settings directly, so
;; deleting the connection they key off turns those features off. They should name a connection instead.
(defn- connection-field-getter
  "Getter for a per-provider credential setting whose value lives on the `llm-providers` connection list.
  Resolved late: [[metabase.llm.provider]] requires this namespace."
  [setting-kw]
  (fn []
    ((requiring-resolve 'metabase.llm.provider/single-provider-setting-value) setting-kw)))

(defn- connection-field-setter
  "Setter counterpart of [[connection-field-getter]], writing through to the connection list so `config.yml`
  provisioning and code that has always written these settings keep working."
  [setting-kw]
  (fn [new-value]
    ((requiring-resolve 'metabase.llm.provider/set-single-provider-setting!) setting-kw new-value)))

;;; ------------------------------------------------- Anthropic -------------------------------------------------

(defsetting llm-anthropic-api-key
  (deferred-tru "The Anthropic API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-anthropic-api-key
  :getter           (connection-field-getter :llm-anthropic-api-key)
  :setter           (connection-field-setter :llm-anthropic-api-key)
  :doc              "Backed by the anthropic connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-anthropic-api-key-configured?
  "Whether an Anthropic API key has been configured."
  :type       :boolean
  :visibility :public
  :setter     :none
  :export?    false
  :getter     #(some? (llm-anthropic-api-key))
  :doc        false)

(defsetting llm-anthropic-model
  (deferred-tru "The Anthropic model to use.")
  :encryption :no
  :visibility :settings-manager
  :default "claude-opus-4-5-20251101"
  :export? false)

(defsetting llm-anthropic-api-base-url
  (deferred-tru "The Anthropic API base URL.")
  :encryption       :when-encryption-key-set
  :visibility       :settings-manager
  :default          "https://api.anthropic.com"
  :export?          false
  :getter           (connection-field-getter :llm-anthropic-api-base-url)
  :setter           (connection-field-setter :llm-anthropic-api-base-url)
  :deprecated-name  :ee-anthropic-api-base-url
  :doc              "Backed by the anthropic connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-anthropic-api-version
  (deferred-tru "The Anthropic API version.")
  :encryption :no
  :visibility :internal
  :default "2023-06-01"
  :export? false
  :doc false)

;;; -------------------------------------------------- OpenAI ---------------------------------------------------

(defsetting llm-openai-model
  (deferred-tru "The OpenAI Model (e.g. ''gpt-5.5'', ''gpt-5.4-mini'')")
  :encryption       :no
  :visibility       :settings-manager
  :default          "gpt-5.4"
  :export?          false
  :deprecated-name  :ee-openai-model)

(defsetting llm-openai-api-base-url
  (deferred-tru "The OpenAI API base URL.")
  :encryption       :when-encryption-key-set
  :visibility       :settings-manager
  :default          "https://api.openai.com"
  :export?          false
  :getter           (connection-field-getter :llm-openai-api-base-url)
  :setter           (connection-field-setter :llm-openai-api-base-url)
  :deprecated-name  :ee-openai-api-base-url
  :doc              "Backed by the openai connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-openai-api-key
  (deferred-tru "The OpenAI API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-openai-api-key
  :getter           (connection-field-getter :llm-openai-api-key)
  :setter           (connection-field-setter :llm-openai-api-key)
  :doc              "Backed by the openai connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; ------------------------------------------------- OpenRouter ------------------------------------------------

(defsetting llm-openrouter-api-base-url
  (deferred-tru "The OpenRouter API base URL used for Chat Completions.")
  :encryption       :when-encryption-key-set
  :visibility       :settings-manager
  :default          "https://openrouter.ai/api"
  :export?          false
  :getter           (connection-field-getter :llm-openrouter-api-base-url)
  :setter           (connection-field-setter :llm-openrouter-api-base-url)
  :deprecated-name  :ee-openrouter-api-base-url
  :doc              "Backed by the openrouter connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-openrouter-api-key
  (deferred-tru "The OpenRouter API Key.")
  :sensitive?       true
  :visibility       :settings-manager
  :export?          false
  :deprecated-name  :ee-openrouter-api-key
  :getter           (connection-field-getter :llm-openrouter-api-key)
  :setter           (connection-field-setter :llm-openrouter-api-key)
  :doc              "Backed by the openrouter connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; --------------------------------------------------- Z.AI ----------------------------------------------------

(defsetting llm-zai-api-base-url
  (deferred-tru "The Z.AI API base URL used for Chat Completions.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :default    "https://api.z.ai/api/paas/v4"
  :export?    false
  :getter     (connection-field-getter :llm-zai-api-base-url)
  :setter     (connection-field-setter :llm-zai-api-base-url)
  :doc        "Backed by the zai connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-zai-api-key
  (deferred-tru "The Z.AI API Key.")
  ;; Z.AI keys are `{id}.{secret}` pairs with no documented prefix, so unlike the other
  ;; direct-provider keys there is no format validation.
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-zai-api-key)
  :setter     (connection-field-setter :llm-zai-api-key)
  :doc        "Backed by the zai connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; -------------------------------------------------- Mistral ---------------------------------------------------

(defsetting llm-mistral-api-base-url
  (deferred-tru "The Mistral API base URL used for Chat Completions.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :default    "https://api.mistral.ai/v1"
  :export?    false
  :getter     (connection-field-getter :llm-mistral-api-base-url)
  :setter     (connection-field-setter :llm-mistral-api-base-url)
  :doc        "Backed by the mistral connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-mistral-api-key
  (deferred-tru "The Mistral API Key.")
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-mistral-api-key)
  :setter     (connection-field-setter :llm-mistral-api-key)
  :doc        "Backed by the mistral connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; ------------------------------------------------- Moonshot --------------------------------------------------

(defsetting llm-moonshot-api-base-url
  (deferred-tru "The Moonshot AI API base URL used for Chat Completions. Repoint this to use the `.cn` platform; keys are not interchangeable between the two.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :default    "https://api.moonshot.ai/v1"
  :export?    false
  :getter     (connection-field-getter :llm-moonshot-api-base-url)
  :setter     (connection-field-setter :llm-moonshot-api-base-url)
  :doc        "Backed by the moonshot connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-moonshot-api-key
  (deferred-tru "The Moonshot AI API Key.")
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-moonshot-api-key)
  :setter     (connection-field-setter :llm-moonshot-api-key)
  :doc        "Backed by the moonshot connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; ------------------------------------------------- DeepSeek --------------------------------------------------

(defsetting llm-deepseek-api-base-url
  (deferred-tru "The DeepSeek API base URL. Both the Anthropic-compatible Messages surface (`/anthropic/v1/messages`) and the model catalog (`/models`) are served off this root, so do not include `/anthropic` or `/v1`.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :default    "https://api.deepseek.com"
  :export?    false
  :getter     (connection-field-getter :llm-deepseek-api-base-url)
  :setter     (connection-field-setter :llm-deepseek-api-base-url)
  :doc        "Backed by the deepseek connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-deepseek-api-key
  (deferred-tru "The DeepSeek API Key.")
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-deepseek-api-key)
  :setter     (connection-field-setter :llm-deepseek-api-key)
  :doc        "Backed by the deepseek connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; ------------------------------------ Google Gemini Enterprise Agent Platform --------------------------------
;;; The Gemini Enterprise Agent Platform (formerly Vertex AI). Every request applies to one Google Cloud project. The
;;; project ID is necessary. The location is optional and defaults to `global`.

(defsetting llm-google-service-account-key
  (deferred-tru "A Google Cloud service account key JSON for the Gemini Enterprise Agent Platform. Takes precedence over the OAuth access token when both are set.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-google-service-account-key)
  :setter      (connection-field-setter :llm-google-service-account-key)
  :doc         "Backed by the google connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-google-oauth-access-token
  (deferred-tru "A short-lived OAuth2 access token for the Gemini Enterprise Agent Platform (e.g. from `gcloud auth print-access-token`). Useful for testing.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-google-oauth-access-token)
  :setter      (connection-field-setter :llm-google-oauth-access-token)
  :doc         "Backed by the google connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

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

(defsetting llm-google-project-id
  (deferred-tru "The Google Cloud project ID for the Gemini Enterprise Agent Platform.")
  :encryption  :no
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-google-project-id)
  :setter      (connection-field-setter :llm-google-project-id)
  :doc         "Backed by the google connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-google-location
  (deferred-tru "The Google Cloud location for the Gemini Enterprise Agent Platform (e.g. us-central1). Defaults to global.")
  :encryption  :no
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-google-location)
  :setter      (connection-field-setter :llm-google-location)
  :doc         "Backed by the google connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(def google-global-api-base-url
  "Google's global Gemini Enterprise Agent Platform host, and the default for [[llm-google-api-base-url]].
  It serves only the `global` location. A regional location uses `https://{location}-aiplatform.googleapis.com`, and
  the `us` and `eu` multi-region locations use `https://aiplatform.{location}.rep.googleapis.com`."
  "https://aiplatform.googleapis.com")

(defsetting llm-google-api-base-url
  (deferred-tru "The Gemini Enterprise Agent Platform API base URL. Leave unset to derive it from the location.")
  :encryption  :when-encryption-key-set
  :visibility  :settings-manager
  :default     google-global-api-base-url
  :export?     false
  :getter      (connection-field-getter :llm-google-api-base-url)
  :setter      (connection-field-setter :llm-google-api-base-url)
  :doc         "Backed by the google connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; ----------------------------------------------- Amazon Bedrock ----------------------------------------------

(defsetting llm-bedrock-access-key-id
  (deferred-tru "The AWS Access Key ID for Amazon Bedrock.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-bedrock-access-key-id)
  :setter      (connection-field-setter :llm-bedrock-access-key-id)
  :doc         "Backed by the bedrock connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-bedrock-secret-access-key
  (deferred-tru "The AWS Secret Access Key for Amazon Bedrock.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-bedrock-secret-access-key)
  :setter      (connection-field-setter :llm-bedrock-secret-access-key)
  :doc         "Backed by the bedrock connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-bedrock-session-token
  (deferred-tru "The AWS Session Token for Amazon Bedrock. Only needed for temporary credentials.")
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-bedrock-session-token)
  :setter      (connection-field-setter :llm-bedrock-session-token)
  :doc         "Backed by the bedrock connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-bedrock-region
  (deferred-tru "The AWS region for Amazon Bedrock (e.g. us-east-1).")
  :encryption  :no
  :visibility  :settings-manager
  :default     "us-east-1"
  :export?     false
  :getter      (connection-field-getter :llm-bedrock-region)
  :setter      (connection-field-setter :llm-bedrock-region)
  :doc         "Backed by the bedrock connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; ----------------------------------------------- Microsoft Azure ---------------------------------------------

(defsetting llm-azure-api-key
  (deferred-tru "The API key for the Azure resource hosting your models.")
  ;; Azure data-plane keys are unprefixed, so unlike the direct-provider keys there is no format validation.
  :sensitive?  true
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-azure-api-key)
  :setter      (connection-field-setter :llm-azure-api-key)
  :doc         "Backed by the azure connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-azure-api-base-url
  (deferred-tru "The base URL of the Azure resource''s OpenAI- or Anthropic-compatible surface, e.g. `https://<resource>.services.ai.azure.com/openai`.")
  :encryption  :when-encryption-key-set
  :visibility  :settings-manager
  :export?     false
  :getter      (connection-field-getter :llm-azure-api-base-url)
  :setter      (connection-field-setter :llm-azure-api-base-url)
  :doc         "Backed by the azure connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-azure-model-family
  (deferred-tru "Whether the Azure deployment configured from the environment serves an `openai` or an `anthropic` model. Defaults to `openai`.")
  :encryption :no
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-azure-model-family)
  :setter     (connection-field-setter :llm-azure-model-family)
  :doc        "Backed by the azure connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-azure-deployment-name
  (deferred-tru "The name of the model deployment served by the Azure connection configured from the environment.")
  :encryption :no
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-azure-deployment-name)
  :setter     (connection-field-setter :llm-azure-deployment-name)
  :doc        "Backed by the azure connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

;;; --------------------------------------------------- vLLM ----------------------------------------------------

(defsetting llm-vllm-api-base-url
  (deferred-tru "The base URL of your vLLM server''s OpenAI-compatible API, e.g. `http://vllm.internal:8000/v1`.")
  :encryption :when-encryption-key-set
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-vllm-api-base-url)
  :setter     (connection-field-setter :llm-vllm-api-base-url)
  :doc        "Backed by the vllm connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-vllm-api-key
  (deferred-tru "The API key for your vLLM server. Only needed when the server was started with `--api-key`.")
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :getter     (connection-field-getter :llm-vllm-api-key)
  :setter     (connection-field-setter :llm-vllm-api-key)
  :doc        "Backed by the vllm connection in the admin AI settings provider list: reads and writes go through the llm-providers connection list, and a value set by this environment variable shadows this one field of that connection.")

(defsetting llm-vllm-request-timeout-ms
  (deferred-tru "Socket timeout in milliseconds for requests to your vLLM server.")
  ;; Self-hosted TTFT is bounded by the operator's hardware; the shared 60s default is too short.
  :type       :integer
  :default    300000
  :visibility :settings-manager
  :export?    false)

;;; ---------------------------------------------- Provider connections ------------------------------------------

;;; The per-provider credential settings above are read-only at runtime: they configure a connection only when set
;;; by an environment variable, which [[metabase.llm.provider/connections]] resolves on every read. Editing one in
;;; the app DB would not reach the connection serving requests, so a write is rejected rather than silently ignored.
;;; Connections are managed through the `/api/llm/providers` endpoints instead.

(defsetting llm-providers
  (deferred-tru "JSON array of configured LLM provider connections. Each entry has a `key` (a URL-safe slug identifying the connection), a `type` (the provider type, e.g. `anthropic`), a display `name`, and a `config` map of that provider type''s credential fields.")
  :type       :json
  :default    []
  :encryption :when-encryption-key-set
  :sensitive? true
  :visibility :settings-manager
  :export?    false
  :audit      :no-value
  ;; The connection API validates what it saves, and so do the single-provider settings, but the list is also
  ;; writable as itself -- through `PUT /api/setting/llm-providers` and through `config.yml` -- so the field
  ;; validators run here too, on the way in.
  :setter     (fn [new-value]
                ((requiring-resolve 'metabase.llm.provider/validate-changed-connections!) new-value)
                (setting/set-value-of-type! :json :llm-providers new-value))
  :doc        "Connections are normally managed from the admin AI settings page. Setting this environment variable puts the whole list under environment control and makes it read-only in the UI.

Configuring a provider through the single-provider variables (`MB_LLM_ANTHROPIC_API_KEY` and friends) is equally supported, and is the simpler option when you only need one connection per provider and would rather not hand-write JSON. Each such provider becomes a read-only connection whose key is the provider type, resolved from the environment on every read, so editing one of those variables is picked up on the next restart. A provider configured this way takes precedence over a stored connection with the same key.")

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

(defsetting ai-service-base-url
  (deferred-tru "Base URL for the managed Metabase AI service.")
  :enabled?         #(or (premium-features/has-feature? :metabase-ai-managed)
                         (premium-features/has-feature? :metabot-v3))
  :encryption       :when-encryption-key-set
  :visibility       :internal
  :default          nil
  :export?          false
  :doc              false)

(defsetting llm-proxy-configured?
  (deferred-tru "Whether the LLM proxy is configured for the managed Metabase AI service.")
  :encryption       :no
  :visibility       :settings-manager
  :export?          false
  :setter           :none
  :getter           #(some? (llm-proxy-base-url))
  :doc              false)

;;; -------------------------------------------------- General --------------------------------------------------

(defsetting ai-features-enabled?
  (deferred-tru "Whether AI features are enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true)

(defsetting llm-max-tokens
  (deferred-tru "Maximum tokens for LLM responses.")
  :type :integer
  :default 4096
  :visibility :settings-manager
  :export? false)

(defsetting llm-request-timeout-ms
  (deferred-tru
   (str "Socket (inter-byte read) timeout in milliseconds for LLM API requests. "
        "For streaming responses this bounds the gap between successive chunks, "
        "NOT the total response time. Picked generously: extended thinking can "
        "pause for tens of seconds between chunks. Without it, a hung read inside "
        "the stream blocks the worker indefinitely — observed in production when "
        "an upstream proxy held the connection open without sending data."))
  :type :integer
  :default 120000
  :visibility :settings-manager
  :export? false)

(defsetting llm-connection-timeout-ms
  (deferred-tru
   (str "TCP connection timeout in milliseconds for LLM API requests. A provider "
        "that is down or unreachable should fail fast instead of holding a worker "
        "thread forever."))
  :type :integer
  :default 10000
  :visibility :settings-manager
  :export? false)

(defsetting llm-rate-limit-per-user
  (deferred-tru "Maximum SQL generation requests per user per minute.")
  :type :integer
  :default 20
  :visibility :settings-manager
  :export? false)

(defsetting llm-rate-limit-per-ip
  (deferred-tru "Maximum SQL generation requests per IP address per minute.")
  :type :integer
  :default 100
  :visibility :settings-manager
  :export? false)
