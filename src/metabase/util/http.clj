(ns metabase.util.http
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.util.json :as json])
  (:import
   (java.net InetAddress URL)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(defn- lower-case-en
  "Locale-agnostic lowercase."
  ^String [^String s]
  (when s
    (.toLowerCase s Locale/ENGLISH)))

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

(defn https?
  "True if the original request made by the frontend client (i.e., browser) was made over HTTPS.

  In many production instances, a reverse proxy such as an ELB or nginx will handle SSL termination, and the actual
  request handled by Jetty will be over HTTP."
  [{{:strs [x-forwarded-proto x-forwarded-protocol x-url-scheme x-forwarded-ssl front-end-https origin]} :headers
    :keys                                                                                                [scheme]}]
  (cond
    ;; If `X-Forwarded-Proto` is present use that. There are several alternate headers that mean the same thing. See
    ;; https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto
    (or x-forwarded-proto x-forwarded-protocol x-url-scheme)
    (= "https" (lower-case-en (or x-forwarded-proto x-forwarded-protocol x-url-scheme)))

    ;; If none of those headers are present, look for presence of `X-Forwarded-Ssl` or `Frontend-End-Https`, which
    ;; will be set to `on` if the original request was over HTTPS.
    (or x-forwarded-ssl front-end-https)
    (= "on" (lower-case-en (or x-forwarded-ssl front-end-https)))

    ;; If none of the above are present, we are most not likely being accessed over a reverse proxy. Still, there's a
    ;; good chance `Origin` will be present because it should be sent with `POST` requests, and most auth requests are
    ;; `POST`. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin
    origin
    (str/starts-with? (lower-case-en origin) "https")

    ;; Last but not least, if none of the above are set (meaning there are no proxy servers such as ELBs or nginx in
    ;; front of us), we can look directly at the scheme of the request sent to Jetty.
    scheme
    (= scheme :https)))
