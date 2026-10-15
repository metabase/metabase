(ns metabase.server.lib.etag-cache
  "ETag caching-related utilities."
  (:require
   [clojure.string :as str]
   [metabase.config.core :as config]
   [ring.util.io :as ring.io]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(defn- format-etag [hash weak?]
  (if weak?
    (format "W/\"%s\"" hash)
    (format "\"%s\"" hash)))

(defn- current-etag-header [etag weak?]
  {"ETag" (format-etag etag weak?)})

(defn- parse-if-none-match [if-none-match]
  (->> (some-> if-none-match (str/split #"\s*,\s*"))
       (map #(-> %
                 (str/replace-first #"^W/" "")
                 (str/replace #"^\"|\"$" "")))
       set))

(defn- etag-matches? [if-none-match etag]
  (let [normalized-if-none-match (some-> if-none-match str/trim)]
    (or (= "*" normalized-if-none-match)
        (contains? (parse-if-none-match normalized-if-none-match) etag))))

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
  "Return 304 + ETag if If-None-Match matches; else 200 base + ETag.

   Validates against the running version's hash unless `:etag` names one. A caller
   that can identify a single representation should pass its own, so that the
   validator tracks the bytes rather than the build."
  [response request {weak? :weak?, etag :etag, :or {etag config/mb-version-hash}}]
  (if (etag-matches? (get-in request [:headers "if-none-match"]) etag)
    (do
      ;; the 304 carries no body, so the one we are dropping has to be released
      (ring.io/close! (:body response))
      (-> (response/response "")
          (response/status 304)
          (update :headers merge
                  (carry-over-304-headers response)
                  (current-etag-header etag weak?))))
    (-> response
        (update :headers merge (current-etag-header etag weak?)))))
