(ns metabase.server.middleware.etag-cache
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- current-etag-header []
  {"ETag" (format "\"%s\"" config/mb-version-hash)})

(defn- parse-if-none-match [s]
  (when s
    (->> (str/split s #"\s*,\s*")
         (map #(-> %
                   (str/replace-first #"^W/" "")
                   (str/replace #"^\"|\"$" "")))
         set)))

(defn- etag-matches? [if-none-match]
  (contains? (parse-if-none-match if-none-match) config/mb-version-hash))

(defn with-etag
  "Return 304 + ETag if If-None-Match matches; else 200 base + ETag.
   NOTE: does not set Cache-Control or Content-Type."
  [response request]
  (if (etag-matches? (get-in request [:headers "if-none-match"]))
    (-> (response/response "")
        (response/status 304)
        (update :headers merge (current-etag-header)))
    (-> response
        (update :headers merge (current-etag-header)))))
