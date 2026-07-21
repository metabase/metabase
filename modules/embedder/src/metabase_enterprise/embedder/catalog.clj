(ns metabase-enterprise.embedder.catalog
  "Immutable metadata for the model artifact bundled in the embedder plugin."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.classloader.core :as classloader]
   [metabase.util :as u])
  (:import
   (com.sun.jna Function NativeLibrary)
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)
   (java.util HexFormat)))

(set! *warn-on-reflection* true)

(def default-model-name
  "Canonical name of the one model bundled by this plugin."
  "Snowflake/snowflake-arctic-embed-l-v2.0")

(defn- plugin-resource
  [resource-path]
  (io/resource resource-path (classloader/the-classloader)))

(def ^:private catalog
  "Parsed model catalog bundled with the plugin."
  (delay
    (some-> "metabase/embedder-model-catalog.edn"
            plugin-resource
            slurp
            edn/read-string)))

(defn architecture
  "Bundle architecture for this JVM. The x86 bundle uses the model's unsigned INT8 export."
  []
  (case (System/getProperty "os.arch")
    ("aarch64" "arm64") "arm64"
    ("amd64" "x86_64")  "avx2"
    nil))

(defn supported-architecture?
  "Whether this JVM architecture has a bundled model export."
  []
  (some? (architecture)))

(defn- operating-system
  []
  (u/lower-case-en (System/getProperty "os.name")))

(defn- process-maps
  []
  (try
    (slurp "/proc/self/maps")
    (catch Exception _
      nil)))

(defn- detect-linux-libc
  [alpine? maps]
  (cond
    alpine?
    :musl

    (nil? maps)
    :unknown

    (str/includes? maps "ld-musl-")
    :musl

    (or (re-find #"/ld-(?:linux[^\s]*|\d+(?:\.\d+)*)\.so" maps)
        (str/includes? maps "/libc.so.6"))
    :glibc

    :else
    :unknown))

(defn- linux-libc
  []
  (detect-linux-libc (.exists (io/file "/etc/alpine-release")) (process-maps)))

(def ^:private minimum-glibc-version
  "Minimum symbol version required by the pinned DJL 0.36 tokenizer natives."
  [2 34])

(defn- glibc-version
  []
  (try
    (let [^NativeLibrary libc     (NativeLibrary/getInstance "c")
          ^Function      function (.getFunction libc "gnu_get_libc_version")]
      (.invokeString function (object-array 0) false))
    (catch Throwable _
      nil)))

(defn- supported-glibc-version?
  [version]
  (boolean
   (when-let [[_ major minor] (some->> version (re-matches #"^(\d+)\.(\d+).*$"))]
     (not (neg? (compare [(parse-long major) (parse-long minor)] minimum-glibc-version))))))

(defn runtime-readiness
  "Whether the bundled DJL/ONNX native runtime can load on this JVM platform."
  []
  (let [os-name              (operating-system)
        arch                 (architecture)
        glibc-version-string (when (= "linux" os-name) (glibc-version))
        detected-libc        (when (= "linux" os-name) (linux-libc))
        libc                 (cond
                               ;; Keep explicit Alpine/musl evidence fail-closed even if a compatibility shim exports
                               ;; the GNU version symbol. Otherwise the API probe is stronger than an inconclusive map.
                               (= :musl detected-libc) :musl
                               (some? glibc-version-string) :glibc
                               :else detected-libc)]
    (cond
      (not (or (= "linux" os-name) (= "mac os x" os-name)))
      {:ready? false :reason :unsupported-os}

      (nil? arch)
      {:ready? false :reason :unsupported-architecture}

      ;; ONNX Runtime includes osx-x64, but the pinned DJL tokenizer ships only an osx-aarch64 native.
      (and (= "mac os x" os-name) (= "avx2" arch))
      {:ready? false :reason :unsupported-platform}

      (and (= "linux" os-name) (not= :glibc libc))
      {:ready? false :reason :unsupported-libc}

      (and (= "linux" os-name) (not (supported-glibc-version? glibc-version-string)))
      {:ready? false :reason :unsupported-libc-version}

      :else
      {:ready? true})))

(defn model-spec
  "Catalog entry for `model-name`, or nil when the plugin does not provide it."
  [model-name]
  (get-in @catalog [:models model-name]))

(defn bundle-resource
  "Classpath path of the bundle for `model-name` on this JVM."
  [model-name]
  (when-let [{:keys [bundle-name]} (and (architecture) (model-spec model-name))]
    (str "metabase-embedder/" bundle-name "-" (architecture) ".zip")))

(defn bundle-present?
  "Whether the current plugin artifact contains the architecture-specific bundle for `model-name`."
  [model-name]
  (boolean (some-> model-name bundle-resource plugin-resource)))

(defn- sha256
  [^String value]
  (let [^MessageDigest digest (MessageDigest/getInstance "SHA-256")
        ^bytes bytes          (.digest digest (.getBytes value StandardCharsets/UTF_8))]
    (.formatHex (HexFormat/of) bytes)))

(defn- stable-pr-str
  [value]
  (binding [*print-dup* false
            *print-length* nil
            *print-level* nil
            *print-readably* true]
    (pr-str value)))

(defn resolved-model
  "Resolve a supported requested model to the exact bundled vector space for this architecture."
  [{:keys [provider model-name vector-dimensions]}]
  (let [model-name (or model-name default-model-name)
        arch       (architecture)
        runtime    (runtime-readiness)
        spec       (model-spec model-name)]
    (when-not (:ready? runtime)
      (throw (ex-info (format "The in-process embedder native runtime does not support %s/%s (%s)."
                              (System/getProperty "os.name")
                              (System/getProperty "os.arch")
                              (name (:reason runtime)))
                      {:provider     provider
                       :os           (System/getProperty "os.name")
                       :architecture (System/getProperty "os.arch")
                       :reason       (:reason runtime)})))
    (when-not spec
      (throw (ex-info (format "The in-process embedder does not bundle model %s." (pr-str model-name))
                      {:provider   provider
                       :model-name model-name
                       :reason     :model-not-bundled})))
    (when (and vector-dimensions (not= vector-dimensions (:vector-dimensions spec)))
      (throw (ex-info (format "The bundled model %s has %d dimensions, not %d."
                              (pr-str model-name) (:vector-dimensions spec) vector-dimensions)
                      {:provider              provider
                       :model-name            model-name
                       :configured-dimensions vector-dimensions
                       :vector-dimensions     (:vector-dimensions spec)
                       :reason                :vector-dimensions-mismatch})))
    (let [identity-input [:metabase-embedding-space-v1
                          model-name
                          (:model-revision spec)
                          (:vector-dimensions spec)
                          (into (sorted-map) (:runtime spec))
                          arch
                          (get-in spec [:architectures arch :sha256])
                          (sort (:tokenizer-files spec))]]
      {:provider          provider
       :model-name        model-name
       :vector-dimensions (:vector-dimensions spec)
       :embedding-space-id (str "emb:v1:sha256:" (sha256 (stable-pr-str identity-input)))})))
