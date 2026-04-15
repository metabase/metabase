(ns metabase.server.lib.etag-cache
  "ETag caching-related utilities."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- format-etag [hash weak?]
  (if weak?
    (format "W/\"%s\"" hash)
    (format "\"%s\"" hash)))

(defn- current-etag-header [weak?]
  {"ETag" (format-etag config/mb-version-hash weak?)})

(defn- parse-if-none-match [if-none-match]
  (->> (some-> if-none-match (str/split #"\s*,\s*"))
       (map #(-> %
                 (str/replace-first #"^W/" "")
                 (str/replace #"^\"|\"$" "")))
       set))

(defn- etag-matches? [if-none-match]
  (let [normalized-if-none-match (some-> if-none-match str/trim)]
    (or (= "*" normalized-if-none-match)
        (contains? (parse-if-none-match normalized-if-none-match) config/mb-version-hash))))

(defn with-etag
  "Return 304 + ETag if If-None-Match matches; else 200 base + ETag."
  [response request {weak? :weak?}]
  (if (etag-matches? (get-in request [:headers "if-none-match"]))
    (-> (response/response "")
        (response/status 304)
        (update :headers merge (current-etag-header weak?)))
    (-> response
        (update :headers merge (current-etag-header weak?)))))
