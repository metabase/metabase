(ns metabase.server.routes.static
  "Serves static resources with support for pre-compressed variants (.br, .gz).
   When the browser advertises support for Brotli or gzip via the Accept-Encoding
   header, and a pre-compressed file exists on the classpath, we serve it directly
   instead of compressing on the fly. This avoids CPU overhead at request time
   and lets us use higher compression levels during the build."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [compojure.core :as compojure]
   [ring.util.io :as ring.io]
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
  (into
   {"*" :*}
   (set/map-invert encoding->header)))

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
    (pos? quality)))

(defn- compressed-path
  "Returns the path of the pre-compressed artifact for a given encoding."
  [resource-path encoding]
  (str resource-path (encoding->extension encoding)))

(defn- content-etag
  "A strong ETag for the bytes of one variant on the classpath.

   Each encoding is a separate representation and so needs its own validator,
   which hashing the bytes we actually send gives us for free."
  [variant-path]
  (with-open [stream (io/input-stream (io/resource variant-path))]
    (format "\"%s\"" (codecs/bytes->hex (buddy-hash/sha256 stream)))))

(def ^:private variant-etag
  "Static resources cannot change while the process runs, so each is hashed once."
  (memoize content-etag))

(defn- compressed-resource
  "Try to serve a pre-compressed variant of `resource-path`. Returns a Ring
   response map if a compressed variant exists and the client accepts it,
   otherwise nil.

   If encoding is :identity, we don't compress at all and serve the raw resource."
  [request resource-path encoding]
  (when (accepts-encoding? request encoding)
    (let [variant-path (compressed-path resource-path encoding)]
      ;; `resource-response` returning nil is what proves the path resolves, so only
      ;; a real file ever reaches `variant-etag` and grows its memo.
      (some-> (response/resource-response variant-path)
              (response/content-type (mime/ext-mime-type resource-path))
              (assoc-in [:headers "Content-Encoding"] (encoding->header encoding))
              (assoc-in [:headers "Vary"] "Accept-Encoding")
              (assoc-in [:headers "ETag"] (variant-etag variant-path))))))

(defn static-resource
  "Serve a static resource, preferring pre-compressed variants when available."
  [request resource-path]
  (or (compressed-resource request resource-path :brotli)
      (compressed-resource request resource-path :gzip)
      (compressed-resource request resource-path :identity)))

(defn- add-wildcard [path]
  (str path (if (str/ends-with? path "/") "*" "/*")))

(defn- parse-if-none-match
  [header-value]
  (into #{} (map str/trim) (str/split (or header-value "") #",")))

(defn- client-holds-this-resource?
  "True when the client's `If-None-Match` names the exact bytes we would send."
  [request response]
  (when-let [etag (response/get-header response "ETag")]
    (let [held (some-> (response/get-header request "if-none-match") str/trim)]
      (or (= "*" held)
          (contains? (parse-if-none-match held) etag)))))

(defn- not-modified
  [response]
  (ring.io/close! (:body response))
  (-> response
      (assoc :status 304 :body nil)
      (update :headers dissoc "Content-Length")))

(defn- wrap-etag-validation
  "Answers a 304 for a client whose `If-None-Match` names the bytes we would send.

   The validator is the content hash and is compared for equality, so the answer
   holds however the versions move. `If-Modified-Since` is deliberately not
   consulted: it is compared as an ordered date, which also answers 304 when the
   client holds a copy newer than the file on disk, and a downgraded instance
   serves exactly that. The `Last-Modified` header stays on the response because
   dropping it makes the security middleware substitute the time of the response."
  [handler]
  (letfn [(answer [response request]
            (if (and (#{:get :head} (:request-method request))
                     (= 200 (:status response))
                     (client-holds-this-resource? request response))
              (not-modified response)
              response))]
    (fn
      ([request]
       (answer (handler request) request))
      ([request respond raise]
       (handler request (fn [response] (respond (answer response request))) raise)))))

(defn precompressed-resources
  "A Ring handler that serves classpath resources from `root`, preferring
   pre-compressed (.br, .gz) variants when the client supports them.
   Drop-in replacement for `compojure.route/resources`.

   A resource the client already holds is answered with a 304 rather than its
   whole body. Everything under `/app` that carries no content hash is served
   `no-cache, must-revalidate`, which obliges the client to ask every time;
   without this it has to be sent the file every time as well."
  [path {root :root}]
  (wrap-etag-validation
   (compojure/GET (add-wildcard path) request
     (let [{{request-path :*} :route-params} request
           resource-path (str root "/" request-path)]
       (static-resource request resource-path)))))
