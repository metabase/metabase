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
