(ns metabase.util.http
  (:require
   [clj-http.client :as http]
   [medley.core :as m]
   [metabase.util.json :as json])
  (:import
   (java.net InetAddress URL)))

(set! *warn-on-reflection* true)

(defn- parse-http-headers [headers]
  (json/decode headers))

(defn ^:dynamic *fetch-as-json*
  "Fetches url and parses body as json, returning it."
  [url headers]
  (let [headers (cond-> headers
                  (string? headers) parse-http-headers)
        response (http/get url (m/assoc-some {:as :json} :headers headers))]
    (:body response)))

(def ^:private invalid-hosts
  #{"metadata.google.internal"}) ; internal metadata for GCP

(defn valid-host?
  "Check whether url is valid based on the given strategy:
   :external-only - only external hosts
   :allow-private - external + private networks but not localhost/loopback
   :allow-all - no restrictions"
  [strategy url]
  (case strategy
    :allow-all true
    ;; For both :external-only and :allow-private, we need to check the host
    (let [^URL url   (if (string? url) (URL. url) url)
          host       (.getHost url)
          host-name  (InetAddress/getByName host)]
      (and
       (not (contains? invalid-hosts host))
       (not (.isLinkLocalAddress host-name))
       (not (.isLoopbackAddress host-name))
       ;; Only block site-local (private) addresses for :external-only
       (or (= strategy :allow-private)
           (not (.isSiteLocalAddress host-name)))))))
