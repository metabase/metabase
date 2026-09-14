(ns metabase.task.secure-delegate
  "Metabase's Quartz `DriverDelegate`s and their installation.

  Quartz's stock delegate reads BLOB columns with a bare `ObjectInputStream`, which reconstructs any
  serializable class the bytes name. Job data is only ever EDN-shaped data in Quartz's own map/trigger
  classes, so we override `getObjectFromBlob` to read through a class allow-list
  ([[metabase.util.deserialization-allowlist]]) — everything outside that set is treated as unreadable.

  The override on the delegate is the only place to do this: `getObjectFromBlob` is `protected` and its
  `ObjectInputStream` is a local, so the filter can't be attached from outside. Scoping it here means
  nothing else in the JVM is touched (drivers, query cache).

  The delegate classes are `gen-class`. [[install!]] loads the one matching the app DB and sets it as
  Quartz's `driverDelegateClass`; it must run before the scheduler initializes (see
  `metabase.task.bootstrap`)."
  (:require
   [clojure.java.io :as io]
   [metabase.classloader.core :as classloader]
   [metabase.config.core :as config]
   [metabase.util.deserialization-allowlist :as deserialization-allowlist]
   [metabase.util.log :as log])
  (:import
   (java.net URL)
   (java.sql Blob ResultSet)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ the blob reads ------------------------------------------------

(def blob-allowed-prefixes
  "Classes job data serializes to: the EDN value space plus Quartz's own wrappers (`org.quartz.*`,
  e.g. `JobDataMap`)."
  (conj deserialization-allowlist/clojure-data-prefixes "org.quartz."))

(defn object-from-blob-std
  "`getObjectFromBlob` for `StdJDBCDelegate` (H2/MySQL) — reads via `getBlob` like the base class, but
  through the allow-list."
  [^ResultSet rs ^String col]
  (let [^Blob blob (.getBlob rs col)]
    (when (and blob (pos? (.length blob)))
      (deserialization-allowlist/read-object (.getBinaryStream blob) blob-allowed-prefixes))))

(defn object-from-blob-postgres
  "`getObjectFromBlob` for `PostgreSQLDelegate` — reads via `getBytes` like the base class, but through
  the allow-list."
  [^ResultSet rs ^String col]
  (deserialization-allowlist/read-object-bytes (.getBytes rs col) blob-allowed-prefixes))

;;; ------------------------------------------------ installation ------------------------------------------------
;;;
;;; The invariant: a jar contains everything. From a jar the gen-class is AOT-compiled and present, so we
;;; never compile at runtime — a missing class there is a build failure we throw on. From source (dev,
;;; test) there's no AOT, so we compile the gen-class on demand ([[dev-compile-delegate!]]) — the only
;;; runtime bytecode/classpath work here, fenced to source only. Jar-vs-source is [[config/jar?]], not
;;; `run-mode` (e2e runs a jar but isn't prod).

(def ^:private driver-delegate-property "org.quartz.jobStore.driverDelegateClass")

;; Postgres uses PostgreSQLDelegate (byte-based BLOB handling); everything else uses StdJDBCDelegate.
(def ^:private delegate
  {:postgres {:class "metabase.task.SecurePostgresDelegate" :ns 'metabase.task.secure-delegate-postgres}
   :default  {:class "metabase.task.SecureStdDelegate"      :ns 'metabase.task.secure-delegate-std}})

(defn- class-loadable? [^String class-name]
  (try
    (boolean (Class/forName class-name false (classloader/the-classloader)))
    (catch ClassNotFoundException _ false)))

(defn- dev-compile-delegate!
  "SOURCE-ONLY. Compile the gen-class `ns-sym` to a temp dir and add that dir to the classpath so
  `the-classloader` can find the class by name. A plain `require` won't do — it defines the class into a
  *child* of `the-classloader` that Quartz can't see. Asserts we're not in a jar, so this never compiles
  bytecode or mutates the classpath in a shipped uberjar (there the class is AOT-compiled)."
  [ns-sym]
  (assert (not (config/jar?)) "dev-compile-delegate! must not run from a jar")
  (let [dir (io/file (System/getProperty "java.io.tmpdir") "mb-quartz-secure-delegate")]
    (.mkdirs dir)
    (classloader/add-url-to-classpath! ^URL (-> dir .toURI .toURL))
    (binding [*compile-path* (str dir)]
      (compile ns-sym))))

(defn install!
  "Set Quartz's `driverDelegateClass` to the secure delegate for `db-type`. Must run before the
  scheduler initializes. Returns the installed class name.

  From a jar (prod, e2e) the class is AOT-compiled and already present. From source (dev, test) it is
  compiled on demand ([[dev-compile-delegate!]]). If it's missing from a jar, that's an AOT build
  problem, so we throw rather than compile at runtime."
  [db-type]
  (let [{:keys [class ns]} (get delegate db-type (:default delegate))]
    (when-not (class-loadable? class)
      (when (config/jar?)
        (throw (ex-info (str "Quartz secure delegate " class " is missing from the jar; it should be "
                             "AOT-compiled at build time. This is a build problem.")
                        {:class class})))
      (log/infof "Compiling Quartz secure delegate %s (running from source, no AOT)" class)
      (dev-compile-delegate! ns))
    (System/setProperty driver-delegate-property class)
    class))
