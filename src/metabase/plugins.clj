(ns metabase.plugins
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [environ.core :as env]
            [metabase.config :as config]
            [metabase.plugins
             [classloader :as classloader]
             [initialize :as initialize]]
            [metabase.util
             [files :as files]
             [i18n :refer [trs]]]
            [yaml.core :as yaml])
  (:import [java.nio.file Files Path]))

(defn- plugins-dir-filename ^String []
  (or (env/env :mb-plugins-dir)
      (.getAbsolutePath (io/file "plugins"))))

;; logic for determining plugins dir -- see below
(defonce ^:private plugins-dir*
  (delay
    (let [filename (plugins-dir-filename)]
      (try
        ;; attempt to create <current-dir>/plugins if it doesn't already exist. Check that the directory is readable.
        (let [path (files/get-path filename)]
          (files/create-dir-if-not-exists! path)
          (assert (Files/isWritable path)
            (trs "Metabase does not have permissions to write to plugins directory {0}" filename))
          path)
        ;; If we couldn't create the directory, or the directory is not writable, fall back to a temporary directory
        ;; rather than failing to launch entirely. Log instructions for what should be done to fix the problem.
        (catch Throwable e
          (log/warn
           e
           (trs "Metabase cannot use the plugins directory {0}" filename)
           "\n"
           (trs "Please make sure the directory exists and that Metabase has permission to write to it.")
           (trs "You can change the directory Metabase uses for modules by setting the environment variable MB_PLUGINS_DIR.")
           (trs "Falling back to a temporary directory for now."))
          ;; Check whether the fallback temporary directory is writable. If it's not, there's no way for us to
          ;; gracefully proceed here. Throw an Exception detailing the critical issues.
          (let [path (files/get-path (System/getProperty "java.io.tmpdir"))]
            (assert (Files/isWritable path)
              (trs "Metabase cannot write to temporary directory. Please set MB_PLUGINS_DIR to a writable directory and restart Metabase."))
            path))))))

;; Actual logic is wrapped in a delay rather than a normal function so we don't log the error messages more than once
;; in cases where we have to fall back to the system temporary directory
(defn- plugins-dir
  "Get a `Path` to the Metabase plugins directory, creating it if needed. If it cannot be created for one reason or
  another, or if we do not have write permissions for it, use a temporary directory instead."
  ^Path []
  @plugins-dir*)

(defn- extract-system-modules! []
  (when (io/resource "modules")
    (let [plugins-path (plugins-dir)]
      (files/with-open-path-to-resource [modules-path "modules"]
        (files/copy-files! modules-path plugins-path)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          loading/initializing plugins                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- add-to-classpath! [^Path jar-path]
  (classloader/add-url-to-classpath! (-> jar-path .toUri .toURL)))

(defn- plugin-info [^Path jar-path]
  (some-> (files/slurp-file-from-archive jar-path "metabase-plugin.yaml")
          yaml/parse-string))

(defn- init-plugin-with-info!
  "Initiaize plugin using parsed info from a plugin maifest. Returns truthy if plugin was successfully initialized;
  falsey otherwise."
  [info]
  (initialize/init-plugin-with-info! info))

(defn- init-plugin!
  "Init plugin JAR file; returns truthy if plugin initialization was successful."
  [^Path jar-path]
  (if-let [info (plugin-info jar-path)]
    ;; for plugins that include a metabase-plugin.yaml manifest run the normal init steps, don't add to classpath yet
    (init-plugin-with-info! (assoc info :add-to-classpath! #(add-to-classpath! jar-path)))
    ;; for all other JARs just add to classpath and call it a day
    (add-to-classpath! jar-path)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 load-plugins!                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- plugins-paths []
  (for [^Path path (files/files-seq (plugins-dir))
        :when      (and (files/regular-file? path)
                        (files/readable? path)
                        (str/ends-with? (.getFileName path) ".jar")
                        (or (not (str/ends-with? (.getFileName path) "spark-deps.jar"))
                            ;; if the JAR in question is the spark deps JAR we cannot load it because it's signed, and
                            ;; the Metabase JAR itself as well as plugins no longer are; Java will throw an Exception
                            ;; if different JARs with `metabase` packages have different signing keys. Go ahead and
                            ;; ignore it but let people know they can get rid of it.
                            (log/warn
                             (trs "spark-deps.jar is no longer needed by Metabase 0.32.0+. You can delete it from the plugins directory."))))]
    path))

(when (or config/is-dev? config/is-test?)
  (defn- load-local-plugin-manifest! [^Path path]
    (some-> (slurp (str path)) yaml.core/parse-string initialize/init-plugin-with-info!))

  (defn- load-local-plugin-manifests!
    "Load local plugin manifest files when running in dev or test mode, to simulate what would happen when loading those
  same plugins from the uberjar. This is needed because some plugin manifests define driver methods and the like that
  aren't defined elsewhere."
    []
    ;; TODO - this should probably do an actual search in case we ever add any additional directories
    (doseq [path  (files/files-seq (files/get-path "modules/drivers/"))
            :let  [manifest-path (files/get-path (str path) "/resources/metabase-plugin.yaml")]
            :when (files/exists? manifest-path)]
      (log/info (trs "Loading local plugin manifest at {0}" (str manifest-path)))
      (load-local-plugin-manifest! manifest-path))))

(defn- has-manifest? ^Boolean [^Path path]
  (boolean (files/file-exists-in-archive? path "metabase-plugin.yaml")))

(defn- init-plugins! [paths]
  ;; sort paths so that ones that correspond to JARs with no plugin manifest (e.g. a dependency like the Oracle JDBC
  ;; driver `ojdbc8.jar`) always get initialized (i.e., added to the classpath) first; that way, Metabase drivers that
  ;; depend on them (such as Oracle) can be initialized the first time we see them.
  ;;
  ;; In Clojure world at least `false` < `true` so we can use `sort-by` to get non-Metabase-plugin JARs in front
  (doseq [^Path path (sort-by has-manifest? paths)]
    (try
      (init-plugin! path)
      (catch Throwable e
        (log/error e (trs "Failied to initialize plugin {0}" (.getFileName path)))))))

(defn- load! []
  (log/info (trs "Loading plugins in {0}..." (str (plugins-dir))))
  (extract-system-modules!)
  (let [paths (plugins-paths)]
    (init-plugins! paths))
  (when (or config/is-dev? config/is-test?)
    (load-local-plugin-manifests!)))

(defonce ^:private load!* (delay (load!)))

(defn load-plugins!
  "Load Metabase plugins. The are JARs shipped as part of Metabase itself, under the `resources/modules` directory (the
  source for these JARs is under the `modules` directory); and others manually added by users to the Metabase plugins
  directory, which defaults to `./plugins`.

  When loading plugins, Metabase performs the following steps:

  *  Metabase creates the plugins directory if it does not already exist.
  *  Any plugins that are shipped as part of Metabase itself are extracted from the Metabase uberjar (or `resources`
     directory when running with `lein`) into the plugins directory.
  *  Each JAR in the plugins directory that *does not* include a Metabase plugin manifest is added to the classpath.
  *  For JARs that include a Metabase plugin manifest (a `metabase-plugin.yaml` file), a lazy-loading Metabase driver
     is registered; when the driver is initialized (automatically, when certain methods are called) the JAR is added
     to the classpath and the driver namespace is loaded

  This function will only perform loading steps the first time it is called — it is safe to call this function more
  than once."
  []
  @load!*)
