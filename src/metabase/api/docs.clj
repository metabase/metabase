(ns metabase.api.docs
  "OpenAPI documentation for our API."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [compojure.core :refer [GET]]
   [metabase.api.open-api :as open-api]
   [metabase.api.util.handlers :as handlers]
   [metabase.config.core :as config]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [ring.middleware.content-type :as content-type]
   [ring.util.response :as response])
  (:import
   (java.io File)
   (java.nio.file CopyOption Files StandardCopyOption)))

(set! *warn-on-reflection* true)

(def openapi-file-path
  "Path to the generated OpenAPI specification."
  ".tmp/openapi/openapi.json")

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

(def ^:private non-public-path-prefixes
  ["/api/testing" "/api/dev"])

(defn- public-path?
  [path]
  (not-any? #(str/starts-with? path %) non-public-path-prefixes))

(defn- schema-refs
  "Set of `#/components/schemas/*` names referenced anywhere inside `x`."
  [x]
  (let [names (volatile! #{})]
    (walk/postwalk
     (fn [node]
       (when-let [ref (when (map? node) (:$ref node))]
         (when-let [[_ schema-name] (re-matches #"#/components/schemas/(.+)" ref)]
           (vswap! names conj schema-name)))
       node)
     x)
    @names))

(defn- reachable-schemas
  "Transitive closure of the schema names reachable from `roots`."
  [schemas roots]
  (loop [seen #{}, queue (vec roots)]
    (if-let [schema-name (peek queue)]
      (if (or (contains? seen schema-name) (not (contains? schemas schema-name)))
        (recur seen (pop queue))
        (recur (conj seen schema-name)
               (into (pop queue) (schema-refs (get schemas schema-name)))))
      seen)))

(defn open-api-object
  "The OpenAPI document describing the public API of `root-handler`.

  Normalizes [[metabase.api.open-api/root-open-api-object]]: environment-dependent routes are dropped and unreachable schemas pruned.
  Callers add `:info`/`:servers`."
  [root-handler]
  (let [spec    (open-api/root-open-api-object root-handler)
        paths   (into {} (filter (comp public-path? key)) (:paths spec))
        schemas (get-in spec [:components :schemas])]
    (-> spec
        (assoc :paths paths)
        (assoc-in [:components :schemas]
                  (select-keys schemas (reachable-schemas schemas (schema-refs paths)))))))

(defn- move-file-atomically!
  [^File source ^File destination]
  (Files/move (.toPath source)
              (.toPath destination)
              (into-array CopyOption [StandardCopyOption/ATOMIC_MOVE
                                      StandardCopyOption/REPLACE_EXISTING])))

(defn- temporary-sibling
  ^File [^File destination]
  (File/createTempFile (str "." (.getName destination) ".")
                       ".tmp"
                       (.getParentFile destination)))

(defn write-openapi-spec-to-file!
  "Generate and write the OpenAPI specification to a local file.
  Takes the root handler and generates the complete OpenAPI spec, writing it to [[openapi-file-path]]."
  [root-handler]
  (let [spec (merge
              (open-api-object root-handler)
              {:servers [{:url         ""
                          :description "Metabase API"}]})
        ^File file (.getAbsoluteFile (io/file openapi-file-path))
        ^File parent-dir (.getParentFile file)]
    (.mkdirs parent-dir)
    (let [^File temp-file (temporary-sibling file)]
      (try
        (with-open [writer (io/writer temp-file)]
          (json/encode-to (sort-keys spec) writer {:pretty true}))
        (move-file-atomically! temp-file file)
        (finally
          (Files/deleteIfExists (.toPath temp-file)))))
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

(defn- read-openapi-spec-from-file
  "Read the OpenAPI specification from the local file.
  Returns the parsed JSON content, or nil if the file doesn't exist or can't be read."
  []
  (try
    (let [file (io/file openapi-file-path)]
      (when (.exists ^java.io.File file)
        (with-open [f (io/reader file)]
          (json/decode+kw f))))
    (catch Throwable e
      (log/errorf "Failed to read OpenAPI specification from file: %s" (ex-message e))
      nil)))

(defn- index-handler
  "OpenAPI 3.1.0 JSON and UI

  https://spec.openapis.org/oas/latest.html"
  ([{:keys [uri], :as _request}]
   ;; /api/docs (no trailing slash) needs to redirect to /api/docs/ (with trailing slash) for the JS to work
   ;; correctly... returning `nil` here will cause the request to fall thru to [[redirect-handler]]
   (when (str/ends-with? uri "/")
     (-> (response/resource-response "openapi/index.html")
         (content-type/content-type-response {:uri "index.html"})
         ;; Better would be to append this to our CSP, but there is no good way right now and it's just a single page.
         ;; Necessary for Scalar to work, script injects styles in runtime.
         (assoc-in [:headers "Content-Security-Policy"] "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net"))))

  ([request respond raise]
   (try
     (respond (index-handler request))
     (catch Throwable e
       (raise e)))))

(defn- json-handler
  "Given the [[metabase.api-routes.core/routes]] handler, return a Ring handler that returns `openapi.json`.
  Attempts to read from the local file first; if not available, generates on-the-fly."
  [root-handler]
  (fn handler*
    ([_request]
     (let [spec (or (when (config/config-bool :mb-enable-openapi-auto-regen)
                      (read-openapi-spec-from-file))
                    (do
                      (log/warn "OpenAPI spec file not found, generating on-the-fly")
                      (merge
                       (open-api-object root-handler)
                       {:servers [{:url         ""
                                   :description "Metabase API"}]})))]
       {:status 200
        :body   spec}))

    ([request respond raise]
     (try
       (respond (handler* request))
       (catch Throwable e
         (raise e))))))

(defn- redirect-handler
  ([_request]
   {:status  302
    :headers {"Location" "/api/docs/"}
    :body    ""})

  ([request respond raise]
   (try
     (respond (redirect-handler request))
     (catch Throwable e
       (raise e)))))

(defn make-routes
  "/api/docs routes. Takes the [[metabase.api-routes.core/routes]] handler and returns a Ring handler with the signature

    (handler request respond raise)"
  [root-handler]
  (open-api/handler-with-open-api-spec
   (handlers/routes
    (GET "/" [] #'index-handler)
    (GET "/openapi.json" [] (json-handler root-handler))
    #'redirect-handler)
   ;; don't generate a spec for these routes
   (fn [_prefix]
     nil)))
