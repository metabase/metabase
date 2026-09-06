(ns metabase.server.middleware.ip-allowlist
  "Ring middleware that restricts access to Metabase based on client IP address."
  (:require
   [clojure.string :as str]
   [metabase.request.current :as request.current]
   [metabase.server.settings :as server.settings]
   [metabase.util.log :as log])
  (:import
   (java.net InetAddress)
   (org.eclipse.jetty.util InetAddressSet)))

(set! *warn-on-reflection* true)

(defn- parse-allowlist
  "Parse a comma-separated string of IP patterns into an InetAddressSet."
  ^InetAddressSet [^String raw]
  (let [addr-set (InetAddressSet.)]
    (doseq [pattern (map str/trim (str/split raw #","))]
      (when-not (str/blank? pattern)
        (.add addr-set pattern)))
    addr-set))

(def ^:private cached-allowlist
  "Cache parsed allowlist. Atom holds `[raw-string, InetAddressSet]`. Re-parses only when the setting value changes."
  (atom [nil nil]))

(defn- current-allowlist
  "Get the current InetAddressSet, re-parsing only if the setting changed."
  ^InetAddressSet []
  (let [raw (server.settings/allowed-ip-addresses)]
    (when (not-empty raw)
      (let [[cached-raw cached-set] @cached-allowlist]
        (if (= raw cached-raw)
          cached-set
          (let [new-set (parse-allowlist raw)]
            (reset! cached-allowlist [raw new-set])
            new-set))))))

(defn- ip-allowed?
  [^InetAddressSet addr-set ^String ip-str]
  (try
    (.test addr-set (InetAddress/getByName ip-str))
    (catch Exception _
      false)))

(defn wrap-ip-allowlist
  "Ring middleware that rejects requests from IPs not in the allowlist. When `allowed-ip-addresses` is empty/nil, all
  requests pass through."
  [handler]
  (fn [request respond raise]
    (if-let [addr-set (current-allowlist)]
      (let [client-ip (request.current/ip-address request)]
        (if (and client-ip (ip-allowed? addr-set client-ip))
          (handler request respond raise)
          (do
            (log/warn "Blocked request from IP not in allowlist:" (or client-ip "unknown"))
            (respond {:status  403
                      :headers {"Content-Type" "text/plain"}
                      :body    "Forbidden"}))))
      (handler request respond raise))))
