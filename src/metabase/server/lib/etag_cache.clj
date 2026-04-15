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

(def ^:private cacheable-304-headers
  "Headers that a 304 response MUST echo from the corresponding 200 response
   per RFC 9110 §15.4.5. ETag is always set separately."
  #{"Cache-Control" "Content-Location" "Expires" "Vary"})

(defn- carry-over-304-headers
  "Extract cacheable headers from `response` using case-insensitive lookup."
  [response]
  (into {}
        (keep (fn [header-name]
                (when-let [v (response/get-header response header-name)]
                  [header-name v])))
        cacheable-304-headers))

(defn with-etag
  "Return 304 + ETag if If-None-Match matches; else 200 base + ETag."
  [response request {weak? :weak?}]
  (if (etag-matches? (get-in request [:headers "if-none-match"]))
    (-> (response/response "")
        (response/status 304)
        (update :headers merge
                (carry-over-304-headers response)
                (current-etag-header weak?)))
    (-> response
        (update :headers merge (current-etag-header weak?)))))
