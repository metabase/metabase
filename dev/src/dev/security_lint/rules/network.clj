(ns dev.security-lint.rules.network
  "Outbound requests that escape the network policy."
  (:require
   [clojure.string :as str]
   [dev.security-lint.ast :as ast]
   [dev.security-lint.rule :refer [defrule]]
   [dev.security-lint.taint :as taint]))

(set! *warn-on-reflection* true)

(defn- literal-host?
  "Whether a URL expression names its host in a literal: `\"https://x\"`, or `(str \"https://x/\" path)` --
  the request goes to that host whatever is appended, so the address policy has nothing to decide."
  [node]
  (let [node (ast/unmeta node)]
    (boolean
     (or (some-> (ast/string-value node) (str/starts-with? "http"))
         (and (contains? '#{str format} (some-> (ast/head-sym node) name symbol))
              (some-> (ast/arg node 0) ast/unmeta ast/string-value (str/starts-with? "http")))))))

(defrule unguarded-outbound-http
  {:name        "Outbound HTTP bypassing the network policy"
   :description (str "metabase.util.http applies the warehouse/network address policy -- rejecting loopback, "
                     "link-local, private and CGNAT destinations according to the configured policy. Calling "
                     "clj-http directly skips that check, so a user-supplied URL can reach the instance's own "
                     "network.")
   :remediation "Route the request through metabase.util.http so the address policy is applied."
   ;; Three cases, not one finding. A URL from a request, a document or a row is SSRF: an error. A URL from a
   ;; setting is the setting's problem -- `url-setting-without-host-validation` reports the setting once, and
   ;; every call that reads it is the same fact -- so a note. A hard-coded URL, or one whose host is a literal
   ;; with a value appended, reaches that host and no other: not reported. Reporting those as architectural
   ;; debt listed 13 sites nobody would change.
   :severity    {:tainted :error :otherwise :note}
   :precision   :medium
   :cwe         "CWE-918"
   :triggers    #{clj-http.client/get
                  clj-http.client/post
                  clj-http.client/put
                  clj-http.client/patch
                  clj-http.client/delete
                  clj-http.client/head
                  clj-http.client/request}
   ;; The wrapper itself has to call the raw client, and tests stub it deliberately.
   :exempt-files [#"src/metabase/util/http\.clj$"]}
  [{:keys [node] :as ctx}]
  (let [url (ast/arg node 0)
        os  (when (and url (not (literal-host? url))) (taint/origins ctx url))
        ;; a value that is only a setting's is graded down; anything else that crossed a boundary is SSRF
        setting-only? (and (seq os) (every? #(= :app-db/setting %) os))]
    (when (seq os)
      {:tainted? (not setting-only?)
       :message  (if setting-only?
                   (str "URL from a setting passed to " (ast/head-sym node)
                        ", bypassing the metabase.util.http network policy")
                   (str "Caller-supplied URL passed to " (ast/head-sym node)
                        ", bypassing the metabase.util.http network policy"))})))

(defrule insecure-tls-option
  {:name        "TLS verification disabled on an outbound request"
   :description (str "An HTTP call passes an option that turns off certificate or hostname checking, which makes "
                     "the connection interceptable by anything on the network path.")
   :remediation (str "Leave verification on. To reach a host with a self-signed certificate, add that certificate "
                     "to the trust store.")
   :severity    :error
   :precision   :high
   :cwe         "CWE-295"
   :triggers    #{clj-http.client/get clj-http.client/post clj-http.client/put clj-http.client/patch
                  clj-http.client/delete clj-http.client/head clj-http.client/request
                  org.httpkit.client/get org.httpkit.client/post org.httpkit.client/request}}
  [{:keys [node]}]
  (let [bad (for [a     (ast/args node)
                  :when (ast/map-node? a)
                  [k v] [[:insecure? true] [:validate-hostnames false]]
                  :let  [found (ast/map-get a k)]
                  :when (and found (= (str v) (ast/->str found)))]
              (str k " " v))]
    (when (seq bad)
      {:message (str "Request disables TLS verification: " (first bad))})))

(defrule open-redirect
  {:name        "Redirect to a caller-supplied location"
   :description (str "A redirect target derived from a request lets an attacker send users to a site of their "
                     "choosing from a link that legitimately starts on this host.")
   :remediation "Resolve the target against an allow-list, or accept only a path and prepend the site URL."
   :severity    :error
   :precision   :medium
   :cwe         "CWE-601"
   :tainted-arg 0
   :triggers    #{ring.util.response/redirect
                  ring.util.response/redirect-after-post}}
  [{:keys [tainted?]}]
  (when tainted?
    {:tainted? true :message "Redirect target derives from a caller-supplied value"}))

(def ^:private url-setting-name #"(?i)(url|uri|host|hostname|endpoint)$")

(def ^:private host-validation
  "Names that mean a setter looked at the host before accepting it."
  #"(?i)host-allowed|safe-url|allowed|valid|network-policy|check")

(defrule url-setting-without-host-validation
  {:name        "URL setting the server fetches, with no host validation on write"
   :description (str "A setting that names a URL or host and can be written through the API is written by "
                     "settings managers, who are not superusers. Where the server then connects to it -- a "
                     "tile server, an LLM provider, an SMTP relay, an OIDC issuer -- the setting is an SSRF "
                     "vector, and with a credential attached to the request it exfiltrates that credential.")
   :remediation (str "Give the setting a `:setter` that rejects hosts the network policy disallows "
                     "(`u.http/host-allowed-for-network-policy?`), or make it `:visibility :internal` / "
                     "`:setter :none` so only the environment can set it.")
   ;; A warning: the rule cannot see whether the server fetches the URL or only hands it to the browser.
   :severity    :warning
   :precision   :medium
   :cwe         "CWE-918"
   :triggers    #{metabase.settings.core/defsetting
                  metabase.settings.models.setting/defsetting}}
  [{:keys [node]}]
  (let [setting-name (some-> (ast/arg node 0) ast/->str)
        opts         (ast/kwargs (ast/args node))
        opt          (fn [k] (some-> (get opts k) ast/->str))
        setter       (get opts :setter)]
    (when (and setting-name
               (re-find url-setting-name setting-name)
               ;; a logo or favicon URL is fetched by the browser, never by the server
               (not (re-find #"(?i)logo|favicon" setting-name))
               (contains? #{nil ":string"} (opt :type))
               (not= ":internal" (opt :visibility))
               (not= ":none" (opt :setter))
               (not (and setter
                         (some #(re-find host-validation (ast/->str %)) (ast/find-nodes ast/symbol-node? setter)))))
      {:message (str "Setting " setting-name " accepts any host")})))
