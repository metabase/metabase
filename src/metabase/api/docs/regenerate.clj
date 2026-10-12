(ns metabase.api.docs.regenerate
  "Writing `openapi.json` to disk, and the debounced scheduler that requests a rewrite.

  Split out of [[metabase.api.docs]] so that [[metabase.api.macros]] can name
  [[request-spec-regeneration!]] directly: `metabase.api.docs` reaches `metabase.api.macros` through
  [[metabase.api.util.handlers]], and nothing here does."
  (:require
   [clojure.java.io :as io]
   [clojure.walk :as walk]
   [metabase.api.open-api :as open-api]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def openapi-file-path
  "Path to the local OpenAPI specification file."
  "resources/openapi/openapi.json")

(defn- sort-keys
  "Sort maps and sets alphabetically to reduce diff noise on openapi.json"
  [data]
  (walk/postwalk
   (fn [x]
     (cond
       (map? x) (into (sorted-map) x)
       (set? x) (into (sorted-set) x)
       :else    x))
   data))

(defn write-openapi-spec-to-file!
  "Generate and write the OpenAPI specification to a local file.
  Takes the root handler and generates the complete OpenAPI spec, writing it to [[openapi-file-path]]."
  [root-handler]
  (try
    (let [spec (merge
                (open-api/root-open-api-object root-handler)
                {:servers [{:url         ""
                            :description "Metabase API"}]})
          file (io/file openapi-file-path)]
      ;; Create parent directory if it doesn't exist
      (when-let [parent-dir (.getParentFile file)]
        (.mkdirs parent-dir))
      (json/encode-to (sort-keys spec) (io/writer file) {:pretty true})
      (log/info "OpenAPI specification written to" openapi-file-path))
    (catch Throwable e
      (log/errorf "Failed to write OpenAPI specification to file: %s" (ex-message e)))))

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
  (swap! openapi-regen-state assoc :needs-regen? true)

  (when-not (:executing? @openapi-regen-state)
    (swap! openapi-regen-state assoc :executing? true)
    (future
      (try
        ;; Wait for debounce period to let multiple requests coalesce
        (Thread/sleep ^Long debounce-delay-ms)
        (loop []
          (when (:needs-regen? @openapi-regen-state)
            (swap! openapi-regen-state assoc :needs-regen? false)
            (log/info "Regenerating OpenAPI specification...")
            (write-openapi-spec-to-file! routes)
            (log/info "OpenAPI specification regenerated successfully")
            ;; Check if more requests came in while we were working
            (recur)))
        (catch Throwable e
          (log/errorf "Error regenerating OpenAPI specification: %s" (ex-message e)))
        (finally
          (swap! openapi-regen-state assoc :executing? false))))))
