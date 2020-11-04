(ns metabase.middleware.util
  "Ring middleware utility functions."
  (:require [clojure.string :as str]))

(def response-unauthentic "Generic `401 (Unauthenticated)` Ring response map." {:status 401, :body "Unauthenticated"})
(def response-forbidden   "Generic `403 (Forbidden)` Ring response map."       {:status 403, :body "Forbidden"})

(defn api-call?
  "Is this ring request an API call (does path start with `/api`)?"
  [{:keys [^String uri]}]
  (str/starts-with? uri "/api"))

(defn public?
  "Is this ring request one that will serve `public.html`?"
  [{:keys [uri]}]
  (re-matches #"^/public/.*$" uri))

(defn embed?
  "Is this ring request one that will serve `public.html`?"
  [{:keys [uri]}]
  (re-matches #"^/embed/.*$" uri))

(defn cacheable?
  "Can the ring request be permanently cached?"
  [{:keys [request-method uri query-string], :as request}]
  (and (= request-method :get)
       (or
        ;; match requests that are js/css and have a cache-busting query string
        (and query-string
             (re-matches #"^/app/dist/.*\.(js|css)$" uri))
        ;; GeoJSON proxy requests should also be cached
        (re-matches #"^/api/geojson/.*" uri))))

(defn https-request?
  "True if the original request made by the frontend client (i.e., browser) was made over HTTPS.

  In many production instances, a reverse proxy such as an ELB or nginx will handle SSL termination, and the actual
  request handled by Jetty will be over HTTP."
  [{{:strs [x-forwarded-proto x-forwarded-protocol x-url-scheme x-forwarded-ssl front-end-https origin]} :headers
    :keys                                                                                                [scheme]}]
  (cond
    ;; If `X-Forwarded-Proto` is present use that. There are several alternate headers that mean the same thing. See
    ;; https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto
    (or x-forwarded-proto x-forwarded-protocol x-url-scheme)
    (= "https" (str/lower-case (or x-forwarded-proto x-forwarded-protocol x-url-scheme)))

    ;; If none of those headers are present, look for presence of `X-Forwarded-Ssl` or `Frontend-End-Https`, which
    ;; will be set to `on` if the original request was over HTTPS.
    (or x-forwarded-ssl front-end-https)
    (= "on" (str/lower-case (or x-forwarded-ssl front-end-https)))

    ;; If none of the above are present, we are most not likely being accessed over a reverse proxy. Still, there's a
    ;; good chance `Origin` will be present because it should be sent with `POST` requests, and most auth requests are
    ;; `POST`. See https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Origin
    origin
    (str/starts-with? (str/lower-case origin) "https")

    ;; Last but not least, if none of the above are set (meaning there are no proxy servers such as ELBs or nginx in
    ;; front of us), we can look directly at the scheme of the request sent to Jetty.
    scheme
    (= scheme :https)))

(defn request-protocol
  "Protocol of this request, either `:http` or `:https`."
  [request]
  (if (https-request? request) :https :http))

(defn embedded?
  "Whether this frontend client that made this request is embedded inside an `<iframe>`."
  [request]
  (some-> request (get-in [:headers "x-metabase-embedded"]) Boolean/parseBoolean))
