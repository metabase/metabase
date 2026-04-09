(ns metabase.server.routes.static
  "Serves static resources with support for pre-compressed variants (.br, .gz).
   When the browser advertises support for Brotli or gzip via the Accept-Encoding
   header, and a pre-compressed file exists on the classpath, we serve it directly
   instead of compressing on the fly. This avoids CPU overhead at request time
   and lets us use higher compression levels during the build."
  (:require
   [clojure.string :as str]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private compressible-file-extensions
  "Content types for which we look for pre-compressed variants."
  #{"application/javascript" "text/javascript" "text/css"})

(defn- extension->content-type
  "Map file extension to content type. Only covers the types we pre-compress."
  [path]
  (cond
    (str/ends-with? path ".js")  "application/javascript"
    (str/ends-with? path ".css") "text/css"
    :else                        nil))

(defn- compressible-resource?
  "Returns true if the resource at `path` is compressible."
  [resource-path]
  (compressible-content-types (extension->content-type resource-path)))

(defn- accepts-encoding?
  "Returns true if the request Accept-Encoding header includes `encoding`."
  [request encoding]
  (some-> (get-in request [:headers "accept-encoding"])
          (str/includes? encoding)))

(defn- try-compressed-response
  "Try to serve a pre-compressed variant of `resource-path`. Returns a Ring
   response map if a compressed variant exists and the client accepts it,
   otherwise nil."
  [request resource-path]
  (when (compressible-resource? resource-path)
    ;; Prefer Brotli over gzip — better compression ratio
    (or (when (accepts-encoding? request "br")
          (when-let [resp (response/resource-response (str resource-path ".br"))]
            (-> resp
                (response/content-type content-type)
                (assoc-in [:headers "Content-Encoding"] "br")
                (assoc-in [:headers "Vary"] "Accept-Encoding"))))
        (when (accepts-encoding? request "gzip")
          (when-let [resp (response/resource-response (str resource-path ".gz"))]
            (-> resp
                (response/content-type content-type)
                (assoc-in [:headers "Content-Encoding"] "gzip")
                (assoc-in [:headers "Vary"] "Accept-Encoding")))))))

(defn- serve-resource
  "Serve a static resource, preferring pre-compressed variants when available."
  [request root path]
  (let [resource-path (str root "/" path)]
    (or (try-compressed-response request resource-path)
        (response/resource-response resource-path))))

(defn precompressed-resources-handler
  "A Ring handler that serves classpath resources from `root`, preferring
   pre-compressed (.br, .gz) variants when the client supports them.
   Drop-in replacement for `compojure.route/resources`."
  [root]
  (fn [{:keys [uri] :as request} respond _raise]
    ;; Strip leading slash to get the relative path
    (let [path (str/replace-first uri #"^/" "")]
      (if-let [resp (serve-resource request root path)]
        (respond resp)
        (respond {:status 404 :body "Not found."})))))
