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

(defn valid-remote-host?
  "Check whether url is a valid url and also is an external host."
  [url]
  (let [^URL url   (if (string? url)
                     (URL. url)
                     url)
        host       (.getHost url)
        host->url (fn [host] (URL. (str "http://" host)))
        base-url  (host->url (.getHost url))
        host-name  (InetAddress/getByName host)]
    (and (not-any? (fn [invalid-url] (.equals ^URL base-url invalid-url))
                   (map host->url invalid-hosts))
         (not (.isLinkLocalAddress host-name))
         (not (.isLoopbackAddress host-name))
         (not (.isSiteLocalAddress host-name)))))
