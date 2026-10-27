(ns metabase.server.settings
  "These are mostly settings that have to do with server responses. Not sure if they belong here or if we should spin
  off a separate `response` module."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.system.core :as system]
   [metabase.util :as u]
   [metabase.util.http :as u.http]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]))

(set! *warn-on-reflection* true)

(def ^:private default-allowed-iframe-hosts
  "youtube.com,
youtu.be,
loom.com,
vimeo.com,
docs.google.com,
calendar.google.com,
airtable.com,
typeform.com,
canva.com,
codepen.io,
figma.com,
grafana.com,
miro.com,
excalidraw.com,
notion.com,
atlassian.com,
trello.com,
asana.com,
gist.github.com,
linkedin.com,
twitter.com,
x.com")

(defsetting allowed-iframe-hosts
  (deferred-tru "Allowed iframe hosts. Includes a list of popular hosts by default; set to '' '' to disable the default list.")
  :encryption :when-encryption-key-set
  :default    default-allowed-iframe-hosts
  :audit      :getter
  :visibility :public
  :export?    true)

(defn- normalize-origin
  "The `scheme://host[:port]` origin of `s`: the form browsers report in `Origin` and
  `MessageEvent.origin`, which every consumer of [[isolated-origin]] compares against or builds
  URLs from. A path, trailing slash, or default port is dropped. A value without a scheme takes
  the site URL's scheme (https without a site URL). Nil when no http(s) origin can be read from `s`."
  [^String s]
  (let [s (if (re-find #"^[A-Za-z][A-Za-z0-9+.-]*://" s)
            s
            (str (or (some-> (system/site-url) (str/split #":" 2) first) "https") "://" s))]
    (try
      (let [uri    (java.net.URI. s)
            scheme (some-> (.getScheme uri) u/lower-case-en)
            host   (some-> (.getHost uri) u/lower-case-en)
            port   (.getPort uri)]
        (when (and (#{"http" "https"} scheme)
                   (not (str/blank? host)))
          (str scheme "://" host
               (when-not (contains? #{-1 ({"http" 80, "https" 443} scheme)} port)
                 (str ":" port)))))
      (catch java.net.URISyntaxException _
        nil))))

(defn- configured-isolated-origin
  "The trimmed `MB_ISOLATED_ORIGIN` value, or nil when it is unset or blank."
  []
  (some-> (setting/get-value-of-type :string :isolated-origin) str/trim not-empty))

(defn- isolated-origin-problem
  "Why `origin` (the normalized setting value, nil when it has no origin) can't be the isolated origin, or nil."
  [origin]
  (let [site-url (system/site-url)]
    (cond
      (nil? origin)
      "it is not an http(s) URL like https://example-isolated.com"

      ;; The session cookie is host-only, so it reaches every port of the main host.
      (and site-url (= (u.http/host-name origin) (u.http/host-name site-url)))
      "it has the site URL's host name, and a different port isn't enough"

      ;; An https page can't frame an http one.
      (and site-url (str/starts-with? site-url "https:") (str/starts-with? origin "http:"))
      "it uses http while the site URL uses https")))

(defonce ^:private last-invalid-isolated-origin (atom nil))

(defn- log-invalid-isolated-origin!
  "Logs once per bad value, since [[isolated-origin]] is read several times per request."
  [value problem]
  (when-not (= value (first (reset-vals! last-invalid-isolated-origin value)))
    (log/errorf "MB_ISOLATED_ORIGIN %s can't be used: %s. Data apps are off until it is fixed."
                (pr-str value) problem))
  nil)

(defsetting isolated-origin
  (deferred-tru "A second address for this Metabase, such as https://example-isolated.com, that the browser keeps apart from the session: it never sends the session cookie there. Metabase serves data apps from it, so a data app reaches Metabase only through the page that shows it.")
  :type       :string
  :encryption :no
  :visibility :public
  :setter     :none
  :getter     (fn []
                (when-let [value (configured-isolated-origin)]
                  (let [origin (normalize-origin value)]
                    (if-let [problem (isolated-origin-problem origin)]
                      (log-invalid-isolated-origin! value problem)
                      origin))))
  :export?    false
  :doc        "Point this address at the same Metabase. The browser never sends the session cookie to it, so Metabase
  serves content there that must stay apart from the session. Data apps run on it, and every request they make to
  Metabase goes through the page that shows them. The address must meet these requirements:

  - Its host name differs from the site URL's host name. A different port isn't enough.
  - It uses https when the site URL does.
  - A site URL is set. Only pages at the site URL can show content from this address.
  - A reverse proxy in front of Metabase passes the original host name (`Host` or `X-Forwarded-Host`).
  - If Metabase runs under a path, both addresses serve it under that path.

  If the value breaks one of the first two requirements, Metabase turns data apps off until you fix it. A separate
  domain (such as `example-isolated.com` rather than `isolated.example.com`) isolates best while the session cookie's
  `SameSite` is `lax` or `strict`.")

(defn isolated-origin-misconfigured?
  "True when `MB_ISOLATED_ORIGIN` is set but [[isolated-origin]] can't use it. Data apps are then refused, not served
  without the isolated origin."
  []
  (and (some? (configured-isolated-origin))
       (nil? (isolated-origin))))

(defsetting csp-img-allowed-hosts
  (deferred-tru "Comma-separated list of hosts that images may load from (e.g. in dashboard text, entity descriptions, and custom visualizations) when `csp-img-enabled` is on. Empty by default, which restricts images to this Metabase instance and the map tile server used by map visualizations.")
  :encryption :when-encryption-key-set
  :default    ""
  :audit      :getter
  :visibility :authenticated
  :export?    true)

(defsetting csp-img-enabled
  (deferred-tru "Restrict the browser Content Security Policy so images can only load from this Metabase instance or the hosts listed in `csp-img-allowed-hosts`. Must be on to enable Custom Visualizations.")
  :type       :boolean
  :default    false
  :visibility :public
  :audit      :getter
  :export?    true
  :setter     (fn [new-value]
                (let [disabling? (not (cond-> new-value (string? new-value) setting/string->boolean))]
                  (when (and disabling?
                             config/ee-available?
                             (when-let [custom-viz-enabled?
                                        (requiring-resolve
                                         'metabase-enterprise.custom-viz-plugin.settings/custom-viz-enabled)]
                               (custom-viz-enabled?)))
                    (throw (ex-info (tru "Cannot disable the image CSP setting while Custom Visualizations are enabled.")
                                    {:status-code 400})))
                  (setting/set-value-of-type! :boolean :csp-img-enabled new-value))))

(defsetting redirect-all-requests-to-https
  (deferred-tru "Force all traffic to use HTTPS via a redirect, if the site URL is HTTPS")
  :visibility :public
  :type       :boolean
  :default    false
  :audit      :getter
  :setter     (fn [new-value]
                ;; if we're trying to enable this setting, make sure `site-url` is actually an HTTPS URL.
                (when (if (string? new-value)
                        (setting/string->boolean new-value)
                        new-value)
                  (assert (some-> (system/site-url) (str/starts-with? "https:"))
                          (tru "Cannot redirect requests to HTTPS unless `site-url` is HTTPS.")))
                (setting/set-value-of-type! :boolean :redirect-all-requests-to-https new-value)))

(defsetting health-check-logging-enabled
  "Whether to log health check requests from session middleware."
  :type       :boolean
  :default    true
  :visibility :internal
  :export?    false)

(defsetting disable-cors-on-localhost
  (deferred-tru "Prevents the server from sending CORS headers for requests originating from localhost.")
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    true)

(defsetting hide-stacktraces
  (deferred-tru "Prevent the exception middleware from including stacktraces in responses.")
  :type       :boolean
  :default    false
  :visibility :admin
  :export?    false)

;; This is normally set via the env var `MB_THREAD_INTERRUPT_ESCALATION_TIMEOUT_MS`
(defsetting thread-interrupt-escalation-timeout-ms
  "By default, this is 0 and the thread interrupt escalation does not run."
  :visibility :internal
  :export?    false
  :type       :integer
  :default    0
  :doc "Timeout in milliseconds to wait after query cancellation before escalating to thread interruption.
        This is used to free up threads that are stuck waiting for a DB response after a query has been cancelled.")

#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:dynamic ^Long *thread-interrupt-escalation-timeout-ms*
  "Timeout in milliseconds to wait after query cancellation before escalating to thread interruption."
  (thread-interrupt-escalation-timeout-ms))

(defsetting max-unauthenticated-request-body-bytes
  "Maximum size in bytes of an HTTP request body from a caller who is not authenticated. Larger requests are rejected with HTTP 413 before the body is read."
  :type       :integer
  :visibility :internal
  :setter     :none
  :export?    false
  :default    (* 4 1024 1024)
  :doc "Applies to requests without a valid session, API key or token. The body is bounded before authentication is checked, so this is the most memory an anonymous request can make the server buffer. It covers login, setup, password reset, SSO callbacks, and public or embedded queries; none of those legitimately send more than a few hundred kilobytes. Authenticated requests are not limited.")

(defsetting metabot-slack-signing-secret
  (deferred-tru "Signing secret for verifying requests from the Metabot Slack app")
  :type       :string
  :visibility :admin
  :encryption :when-encryption-key-set
  :export?    false
  :audit      :no-value
  :getter     (fn []
                (-> (setting/get-value-of-type :string :metabot-slack-signing-secret)
                    (u.str/mask 4))))

(defn unobfuscated-metabot-slack-signing-secret
  "Get the unobfuscated value of [[metabot-slack-signing-secret]]."
  []
  (setting/get-value-of-type :string :metabot-slack-signing-secret))

(defsetting slack-connect-signing-secret-version
  "Monotonically increasing version number for the Slack signing secret. Incremented each time the signing secret is rotated. Slack-connect auth identities are stamped with this version and only valid when it matches the current value. Legacy identities without a version are treated as version 0 for backwards compatibility."
  :type       :integer
  :visibility :internal
  :default    0
  :export?    false)
