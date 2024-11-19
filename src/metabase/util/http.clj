(ns metabase.util.http
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [medley.core :as m]))

(defn- parse-http-headers [headers]
  (json/parse-string headers))

(defn ^:dynamic *fetch-as-json*
  "Fetches url and parses body as json, returning it."
  [url headers]
  (let [headers (cond-> headers
                  (string? headers) parse-http-headers)
        response (http/get url (m/assoc-some {:as :json} :headers headers))]
    (:body response)))
