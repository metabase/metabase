(ns metabase.server.routes.static
  "Serves static resources with support for pre-compressed variants (.br, .gz).
   When the browser advertises support for Brotli or gzip via the Accept-Encoding
   header, and a pre-compressed file exists on the classpath, we serve it directly
   instead of compressing on the fly. This avoids CPU overhead at request time
   and lets us use higher compression levels during the build."
  (:require
   [clojure.string :as string]
   [compojure.core :as compojure]
   [ring.util.mime-type :as mime]
   [ring.util.response :as response]))

(set! *warn-on-reflection* true)

(def ^:private compressible-content-types
  "Content types for which we look for pre-compressed variants."
  #{"application/javascript" "text/javascript" "text/css"})

(defn- accepts-encoding?
  "Returns true if the request Accept-Encoding header includes `encoding`."
  [request encoding]
  (some-> (get-in request [:headers "accept-encoding"])
          (string/includes? encoding)))

(defn- compressed-path
  "Returns the path of the pre-compressed artifact for a given encoding."
  [resource-path encoding]
  (str resource-path "." encoding))

(defn- try-compressed-response
  "Try to serve a pre-compressed variant of `resource-path`. Returns a Ring
   response map if a compressed variant exists and the client accepts it,
   otherwise nil."
  [request resource-path encoding]
  (when (accepts-encoding? request encoding)
    (some-> (response/resource-response (compressed-path resource-path encoding))
            (response/content-type (mime/ext-mime-type resource-path))
            (assoc-in [:headers "Content-Encoding"] encoding)
            (assoc-in [:headers "Vary"] "Accept-Encoding"))))

(defn- compressed-resource
  "Serve a static resource, preferring pre-compressed variants when available."
  [request options]
  (let [root (:root options)
        request-path (:* (:route-params request))
        resource-path (str root "/" request-path)]
    (or (try-compressed-response request resource-path "br")
        (try-compressed-response request resource-path "gz")
        (response/resource-response resource-path))))

(defn- add-wildcard [path]
  (str path (if (string/ends-with? path "/") "*" "/*")))

(defn precompressed-resources
  "A Ring handler that serves classpath resources from `root`, preferring
   pre-compressed (.br, .gz) variants when the client supports them.
   Drop-in replacement for `compojure.route/resources`."
  [path options]
  (compojure/GET (add-wildcard path) request
    (compressed-resource request options)))
