(ns metabase.sso.oidc.http
  "Centralized HTTP client for OIDC operations. All requests go through here so they are external-only
   (via `ssrf-safe-request-opts`)."
  (:require
   [clj-http.client :as http]
   [metabase.util.http :as u.http]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private default-opts
  {:as               :json
   :throw-exceptions false
   :conn-timeout     5000
   :socket-timeout   5000})

(defn- validate-url!
  "Fast-fail check: reject a URL whose host resolves to a non-public address. Advisory -- the real gate
   is `ssrf-safe-request-opts` on the request. Throws `ex-info` if blocked."
  [url]
  (when-not (u.http/external-host? url)
    (log/warnf "OIDC request to %s blocked: host does not resolve to a public address (external-only)" url)
    (throw (ex-info "OIDC request blocked: address not allowed by network restrictions"
                    {:url url}))))

(defn oidc-get
  "GET for OIDC operations, external-only (via `ssrf-safe-request-opts`)."
  ([url]
   (oidc-get url {}))
  ([url opts]
   (validate-url! url)
   (http/get url (merge default-opts opts u.http/ssrf-safe-request-opts))))

(defn oidc-post
  "POST for OIDC operations, external-only (via `ssrf-safe-request-opts`)."
  ([url]
   (oidc-post url {}))
  ([url opts]
   (validate-url! url)
   (http/post url (merge default-opts opts u.http/ssrf-safe-request-opts))))
