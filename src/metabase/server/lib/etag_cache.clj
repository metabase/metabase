(ns metabase.server.lib.etag-cache
  "ETag caching-related utilities."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.config.core :as config]
   [metabase.util.json :as json]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- format-etag [hash weak?]
  (if weak?
    (format "W/\"%s\"" hash)
    (format "\"%s\"" hash)))

(defn- current-etag-header [tag weak?]
  {"ETag" (format-etag tag weak?)})

(defn- parse-if-none-match [if-none-match]
  (->> (some-> if-none-match (str/split #"\s*,\s*"))
       (map #(-> %
                 (str/replace-first #"^W/" "")
                 (str/replace #"^\"|\"$" "")))
       set))

(defn- etag-matches? [if-none-match tag]
  (let [normalized-if-none-match (some-> if-none-match str/trim)]
    (or (= "*" normalized-if-none-match)
        (contains? (parse-if-none-match normalized-if-none-match) tag))))

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

(defn- canonicalize
  "Sort every map so that two servers holding the same content hash it the same way."
  [value]
  (walk/postwalk #(if (map? %) (into (sorted-map) %) %) value))

(defn content-tag
  "A tag derived from `value` itself, for content that can change without an upgrade: a different value
  is a different tag, whatever the build."
  ^String [value]
  (-> value canonicalize json/encode (.getBytes "UTF-8") buddy-hash/sha256 codecs/bytes->hex (subs 0 16)))

(defn with-etag
  "Return 304 + ETag if If-None-Match matches; else 200 base + ETag.

  `tag` identifies the version of the content and defaults to the build's version hash, which is right
  for anything that only changes when the instance is upgraded. Content that can change without an
  upgrade has to pass a tag of its own, such as a hash of the response."
  [response request {weak? :weak?, tag :tag, :or {tag config/mb-version-hash}}]
  (if (etag-matches? (get-in request [:headers "if-none-match"]) tag)
    (-> (response/response "")
        (response/status 304)
        (update :headers merge
                (carry-over-304-headers response)
                (current-etag-header tag weak?)))
    (-> response
        (update :headers merge (current-etag-header tag weak?)))))
