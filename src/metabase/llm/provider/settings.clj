(ns metabase.llm.provider.settings
  "Where LLM provider connections are stored, and the vocabulary the provider type registry validates their
  credential fields against.

  Split out of [[metabase.llm.settings]] so that [[metabase.llm.provider]] can name these directly:
  `metabase.llm.settings` backs its per-provider credential settings with `metabase.llm.provider`, and nothing here
  does."
  (:require
   [clojure.string :as str]
   [metabase.llm.health :as llm.health]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.current :as request.current]
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

;;; ------------------------------------------------- Network policy ---------------------------------------------

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
                   "database is ignored. With a JVM-wide HTTP(S) proxy, Metabase checks destination addresses "
                   "available through local DNS; the deployment proxy must enforce destination restrictions on "
                   "its outbound connections. Proxy-only DNS is supported. Metabase enforces destination addresses "
                   "at connection time for direct requests.")
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
  On Cloud the policy is not the customer's to change."
  [policy host]
  (cond
    (premium-features/is-hosted?)
    (tru "The base URL host {0} is not permitted by Metabase Cloud''s LLM network policy. Use an LLM provider on the public internet." host)

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
  Used on write and before proxied requests. An unresolved host is permitted to allow proxy-only DNS.
  Direct requests use the policy resolver from [[llm-request-opts]] to enforce the policy at connection time."
  ([url]
   (llm-url-problem (llm-allowed-networks) url))
  ([network-policy url]
   (or (llm-url-syntax-problem url)
       (when-not (str/blank? url)
         (let [host (.getHost (URL. ^String url))]
           (when-not (u.http/host-allowed-for-network-policy? network-policy host)
             (host-not-allowed-message network-policy host)))))))

(defn llm-request-opts
  "clj-http options that put the network policy on a request to `url`: redirects are never followed, and a
  `:dns-resolver` refuses any address the policy does not permit (omitted under `:allow-all`). Throws the same 400 as
  a set-time refusal when `url` fails [[llm-url-syntax-problem]]. `floor` is for a deployment-controlled endpoint,
  see [[network-policy]]. Pair with [[rethrow-if-llm-network-policy-error!]] around the request.

  Behind a JVM-wide proxy a `:dns-resolver` enforces nothing, so the check moves to [[llm-url-problem]] here; see
  [[metabase.util.http/jvm-proxied-url?]]."
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
       ;; leaves proxy-only DNS, differing DNS answers, and rebinding to the proxy's own destination policy;
       ;; Metabase cannot enforce the addresses the proxy connects to.
       (do (when-let [problem (llm-url-problem policy url)]
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
  ;; Rewriting the list invalidates what the old one did: credentials may have been rotated, a connection replaced,
  ;; the order changed. Everything [[metabase.llm.health]] holds is about connections as they were configured, so it
  ;; is dropped rather than held against whatever is configured now.
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
                (llm.health/forget-all!)
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
