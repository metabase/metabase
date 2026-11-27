(ns metabase.api.docs.regenerate
  "Writing `openapi.json` to disk, and the debounced scheduler that requests a rewrite.

  Split out of [[metabase.api.docs]] so that [[metabase.api.macros]] can name
  [[request-spec-regeneration!]] directly: `metabase.api.docs` reaches `metabase.api.macros` through
  [[metabase.api.util.handlers]], and nothing here does."
  (:require
   [clojure.java.io :as io]
   [metabase.api.open-api :as open-api]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.match :as match])
  (:import
   (java.nio.file CopyOption Files StandardCopyOption)))

(set! *warn-on-reflection* true)

(def openapi-file-path
  "Path to the local OpenAPI specification file."
  ".tmp/openapi/openapi.json")

(defn- sort-keys
  "Sort maps and sets alphabetically to reduce diff noise on openapi.json"
  [data]
  (match/replace-all data
    #'map? (into (sorted-map) &match)
    #'set? (into (sorted-set) &match)))

(defn open-api-object
  "The complete API document for the routes mounted on `root-handler`."
  [root-handler]
  (assoc (open-api/root-open-api-object root-handler) :servers [{:url "" :description "Metabase API"}]))

(defn write-openapi-spec-to-file!
  "Write the complete spec to `output-path`, defaulting to [[openapi-file-path]] for local regeneration."
  ([root-handler]
   (write-openapi-spec-to-file! root-handler openapi-file-path))
  ([root-handler output-path]
   (let [spec (sort-keys (open-api-object root-handler))
         file (.getAbsoluteFile (io/file output-path))]
     (io/make-parents file)
     (let [temp (java.io.File/createTempFile ".openapi-" ".json" (.getParentFile file))]
       (try
         (with-open [writer (io/writer temp)]
           (json/encode-to spec writer {:pretty true}))
         (Files/move (.toPath temp) (.toPath file)
                     (into-array CopyOption [StandardCopyOption/ATOMIC_MOVE StandardCopyOption/REPLACE_EXISTING]))
         (finally
           (Files/deleteIfExists (.toPath temp)))))
     (log/info "OpenAPI specification written to" output-path))))

(defonce ^:private openapi-regen-state
  (atom {:executing? false
         :needs-regen? false}))

(def ^:private debounce-delay-ms
  "Delay in milliseconds before starting regeneration to allow multiple rapid requests to coalesce."
  200)

(defn request-spec-regeneration!
  "Request OpenAPI spec regeneration. Multiple rapid requests are coalesced into one execution.
  Uses a debounce delay to batch requests that arrive in quick succession (e.g., when re-evaling a file with multiple endpoints)."
  [routes]
  (let [[before] (swap-vals! openapi-regen-state assoc :executing? true :needs-regen? true)]
    (when-not (:executing? before)
      (future
        (Thread/sleep ^Long debounce-delay-ms)
        (loop []
          (swap! openapi-regen-state assoc :needs-regen? false)
          (try
            (write-openapi-spec-to-file! routes)
            (catch Throwable e
              (log/error e "Error regenerating OpenAPI specification")))
          ;; Release the worker only if nobody queued another generation during the write.
          (when (:executing? (swap! openapi-regen-state #(assoc % :executing? (:needs-regen? %))))
            (recur)))))))
