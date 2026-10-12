(ns metabase.sso.oidc.http
  "Centralized HTTP client for OIDC operations.

   All server-side OIDC HTTP requests should go through this namespace
   to ensure SSRF validation via `oidc-allowed-networks`."
  (:require
   [clj-http.client :as http]
   [metabase.sso.settings :as sso.settings]
   [metabase.util.http :as u.http]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private default-opts
  {:as               :json
   :throw-exceptions false
   :conn-timeout     5000
   :socket-timeout   5000})

(defn- validate-url!
  "Validate that a URL is allowed by the current `oidc-allowed-networks` setting.
   Throws `ex-info` if the URL is blocked."
  [url]
  (when-not (u.http/host-allowed-for-network-policy? (sso.settings/oidc-allowed-networks) url)
    (log/warnf "OIDC request to %s blocked by network restrictions (oidc-allowed-networks = %s)"
               url (sso.settings/oidc-allowed-networks))
    (throw (ex-info "OIDC request blocked: address not allowed by network restrictions"
                    {:url url}))))

(defn- request-opts
  "Merge caller `opts` over the defaults, adding the connection-time SSRF `:dns-resolver` for the current
   `oidc-allowed-networks` policy so a host that rebinds to an internal address between validation and
   connection is still rejected. Omitted for `:allow-all`, which imposes no restriction."
  [opts]
  (let [resolver (u.http/network-policy-dns-resolver (sso.settings/oidc-allowed-networks))]
    (cond-> (merge default-opts opts)
      resolver (assoc :dns-resolver resolver))))

(defn oidc-get
  "Perform a validated GET request for OIDC operations.
   Validates the URL against `oidc-allowed-networks` before making the request."
  ([url]
   (oidc-get url {}))
  ([url opts]
   (validate-url! url)
   (http/get url (request-opts opts))))

(defn oidc-post
  "Perform a validated POST request for OIDC operations.
   Validates the URL against `oidc-allowed-networks` before making the request."
  ([url]
   (oidc-post url {}))
  ([url opts]
   (validate-url! url)
   (http/post url (request-opts opts))))
