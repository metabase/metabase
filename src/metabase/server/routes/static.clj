(ns metabase.server.routes.static
  "Serves static resources with support for pre-compressed variants (.br, .gz).
   When the browser advertises support for Brotli or gzip via the Accept-Encoding
   header, and a pre-compressed file exists on the classpath, we serve it directly
   instead of compressing on the fly. This avoids CPU overhead at request time
   and lets us use higher compression levels during the build."
  (:require
   [clojure.string :as str]
   [compojure.core :as compojure]
   [ring.util.mime-type :as mime]
   [ring.util.response :as response]))

(def ^:private encoding->extension
  {:gzip     ".gz"
   :brotli   ".br"
   :identity nil})

(def ^:private encoding->header
  {:gzip     "gzip"
   :brotli   "br"
   :identity "identity"})

(def ^:private header->encoding
  {"gzip"     :gzip
   "br"       :brotli
   "identity" :identity
   "*"        :*})

(defn- parse-quality
  [str]
  (when-let [[_ q] (re-matches #"(?i)q\s*=\s*(\d+(?:\.\d+)?)" (or str ""))]
    (parse-double q)))

(defn- parse-encoding-part
  [part]
  (let [tokens   (str/split (str/trim part) #"\s*;\s*")
        encoding (some-> (first tokens) str/trim header->encoding)
        q-value  (or (parse-quality (second tokens)) 1.0)]
    (when encoding
      [encoding q-value])))

(defn- parse-accept-encoding
  "Parses an Accept-Encoding header value into a map of encoding name to quality
   value (a double between 0.0 and 1.0). Encodings without an explicit q parameter
   default to 1.0.

   Example:
     (parse-accept-encoding \"gzip, br;q=1.0, identity;q=0.5\")
     ;; => {\"gzip\" 1.0, \"br\" 1.0, \"identity\" 0.5}"
  [header-value]
  (let [header-value (-> (or header-value "") str/trim)
        parts        (str/split header-value #",")]
    (into {:identity 1.0 :* 0.0} (keep parse-encoding-part parts))))

(defn- accepts-encoding?
  "Returns true if the request Accept-Encoding header includes `encoding` with a
   quality value greater than 0."
  [request encoding]
  (let [accepted (-> request
                     (response/get-header "accept-encoding")
                     parse-accept-encoding)
        quality  (or (get accepted encoding)
                     (get accepted :*))]
    (> quality 0.0)))

(defn- compressed-path
  "Returns the path of the pre-compressed artifact for a given encoding."
  [resource-path encoding]
  (str resource-path (encoding->extension encoding)))

(defn- compressed-resource
  "Try to serve a pre-compressed variant of `resource-path`. Returns a Ring
   response map if a compressed variant exists and the client accepts it,
   otherwise nil."
  [request resource-path encoding]
  (when (accepts-encoding? request encoding)
    (some-> (response/resource-response (compressed-path resource-path encoding))
            (response/content-type (mime/ext-mime-type resource-path))
            (assoc-in [:headers "Content-Encoding"] (encoding->header encoding))
            (assoc-in [:headers "Vary"] "Accept-Encoding"))))

(defn static-resource
  "Serve a static resource, preferring pre-compressed variants when available."
  [request resource-path]
  (or (compressed-resource request resource-path :brotli)
      (compressed-resource request resource-path :gzip)
      (compressed-resource request resource-path :identity)))

(defn- add-wildcard [path]
  (str path (if (str/ends-with? path "/") "*" "/*")))

(defn precompressed-resources
  "A Ring handler that serves classpath resources from `root`, preferring
   pre-compressed (.br, .gz) variants when the client supports them.
   Drop-in replacement for `compojure.route/resources`."
  [path {root :root}]
  (compojure/GET (add-wildcard path) request
    (let [{{request-path :*} :route-params} request
          resource-path (str root "/" request-path)]
      (static-resource request resource-path))))
