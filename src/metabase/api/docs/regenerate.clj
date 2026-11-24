(ns metabase.api.docs.regenerate
  "Writing `openapi.json` to disk, and the debounced scheduler that requests a rewrite.

  Split out of [[metabase.api.docs]] so that [[metabase.api.macros]] can name
  [[request-spec-regeneration!]] directly: `metabase.api.docs` reaches `metabase.api.macros` through
  [[metabase.api.util.handlers]], and nothing here does."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.api.open-api :as open-api]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.match :as match]))

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

(def ^:private non-public-path-prefixes
  ["/api/testing" "/api/dev"])

(defn- public-path?
  [path]
  (not-any? #(or (= path %) (str/starts-with? path (str % "/"))) non-public-path-prefixes))

(defn- schema-refs
  [x]
  (into #{}
        (keep #(let [ref (when (map? %) (:$ref %))]
                 (when (string? ref)
                   (second (re-matches #"#/components/schemas/(.+)" ref)))))
        (tree-seq coll? seq x)))

(defn- reachable-schemas
  [schemas roots]
  (loop [seen #{}, stack (vec roots)]
    (if-let [schema-name (peek stack)]
      (if (or (contains? seen schema-name) (not (contains? schemas schema-name)))
        (recur seen (pop stack))
        (recur (conj seen schema-name)
               (into (pop stack) (schema-refs (get schemas schema-name)))))
      seen)))

(defn open-api-object
  "The public API document for `root-handler`, excluding development routes and unreachable schemas."
  [root-handler]
  (let [spec    (open-api/root-open-api-object root-handler)
        paths   (into {} (filter (comp public-path? key)) (:paths spec))
        schemas (get-in spec [:components :schemas])]
    (-> spec
        (assoc :paths   paths
               :servers [{:url "" :description "Metabase API"}])
        (assoc-in [:components :schemas]
                  (select-keys schemas (reachable-schemas schemas (schema-refs paths)))))))

(defn write-openapi-spec-to-file!
  "Write the [[open-api-object]] for `root-handler` to [[openapi-file-path]]. Throws if the file can't be written."
  [root-handler]
  (let [file (io/file openapi-file-path)]
    (io/make-parents file)
    (with-open [writer (io/writer file)]
      (json/encode-to (sort-keys (open-api-object root-handler)) writer {:pretty true}))
    (log/info "OpenAPI specification written to" openapi-file-path)))

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
