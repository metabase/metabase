(ns metabase.plugins
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [environ.core :as env]
   [metabase.config :as config]
   [metabase.plugins.classloader :as classloader]
   [metabase.plugins.initialize :as plugins.init]
   [metabase.util.files :as u.files]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.yaml :as yaml])
  (:import
   (java.io File)
   (java.nio.file Files Path)))

(set! *warn-on-reflection* true)

(defn- plugins-dir-filename ^String []
  (or (env/env :mb-plugins-dir)
      (.getAbsolutePath (io/file "plugins"))))

(def ^:private plugins-dir*
  ;; Memoized so we don't log the error messages multiple times if the plugins directory doesn't change
  (memoize/memo
   (fn [filename]
     (try
       ;; attempt to create <current-dir>/plugins if it doesn't already exist. Check that the directory is readable.
       (let [path (u.files/get-path filename)]
         (u.files/create-dir-if-not-exists! path)
         (assert (Files/isWritable path)
           (trs "Metabase does not have permissions to write to plugins directory {0}" filename))
         {:path  path, :temp false})
       ;; If we couldn't create the directory, or the directory is not writable, fall back to a temporary directory
       ;; rather than failing to launch entirely. Log instructions for what should be done to fix the problem.
       (catch Throwable e
         (log/warn
          e
          (format "Metabase cannot use the plugins directory %s" filename)
          "\n"
          "Please make sure the directory exists and that Metabase has permission to write to it."
          "You can change the directory Metabase uses for modules by setting the environment variable MB_PLUGINS_DIR."
          "Falling back to a temporary directory for now.")
         ;; Check whether the fallback temporary directory is writable. If it's not, there's no way for us to
         ;; gracefully proceed here. Throw an Exception detailing the critical issues.
         (let [path (u.files/get-path (System/getProperty "java.io.tmpdir"))]
           (assert (Files/isWritable path)
             (trs "Metabase cannot write to temporary directory. Please set MB_PLUGINS_DIR to a writable directory and restart Metabase."))
           {:path path, :temp true}))))))

(defn plugins-dir-info
  "Map with a :path key containing the `Path` to the Metabase plugins directory, and a :temp key indicating whether a
  temporary directory was used."
  ^Path []
  (plugins-dir* (plugins-dir-filename)))

(defn plugins-dir
  "Get a `Path` to the Metabase plugins directory, creating it if needed. If it cannot be created for one reason or
  another, or if we do not have write permissions for it, use a temporary directory instead.

  This is a wrapper around `plugins-dir-info` which also contains a :temp key indicating whether a temporary directory
  was used."
  []
  (:path (plugins-dir-info)))

(defn- extract-system-modules! []
  (when (io/resource "modules")
    (let [plugins-path (plugins-dir)]
      (u.files/with-open-path-to-resource [modules-path "modules"]
        (u.files/copy-files! modules-path plugins-path)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          loading/initializing plugins                                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- add-to-classpath! [^Path jar-path]
  (classloader/add-url-to-classpath! (-> jar-path .toUri .toURL)))

(defn- plugin-info [^Path jar-path]
  (some-> (u.files/slurp-file-from-archive jar-path "metabase-plugin.yaml")
          yaml/parse-string))

(defn- init-plugin-with-info!
  "Initiaize plugin using parsed info from a plugin maifest. Returns truthy if plugin was successfully initialized;
  falsey otherwise."
  [info]
  (plugins.init/init-plugin-with-info! info))

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
  (for [^Path path (u.files/files-seq (plugins-dir))
        :when      (and (u.files/regular-file? path)
                        (u.files/readable? path)
                        (str/ends-with? (.getFileName path) ".jar")
                        (or (not (str/ends-with? (.getFileName path) "spark-deps.jar"))
                            ;; if the JAR in question is the spark deps JAR we cannot load it because it's signed, and
                            ;; the Metabase JAR itself as well as plugins no longer are; Java will throw an Exception
                            ;; if different JARs with `metabase` packages have different signing keys. Go ahead and
                            ;; ignore it but let people know they can get rid of it.
                            (log/warn
                             "spark-deps.jar is no longer needed by Metabase 0.32.0+. You can delete it from the plugins directory.")))]
    path))

(when (or config/is-dev? config/is-test?)
  (defn- load-local-plugin-manifest! [^Path path]
    (some-> (slurp (str path)) yaml/parse-string plugins.init/init-plugin-with-info!))

  (defn- driver-manifest-paths
    "Return a sequence of [[java.io.File]] paths for `metabase-plugin.yaml` plugin manifests for drivers on the classpath."
    []
    ;; only include plugin manifests if they're on the system classpath.
    (concat
     (for [^File file (classpath/system-classpath)
           :when      (and (.isDirectory file)
                           (not (.isHidden file))
                           (str/includes? (str file) "modules/drivers")
                           (or (str/ends-with? (str file) "resources")
                               (str/ends-with? (str file) "resources-ee")))
           :let       [manifest-file (io/file file "metabase-plugin.yaml")]
           :when      (.exists manifest-file)]
       manifest-file)
     ;; for hacking on 3rd-party drivers locally: set
     ;; `-Dmb.dev.additional.driver.manifest.paths=/path/to/whatever/metabase-plugin.yaml` or
     ;; `MB_DEV_ADDITIONAL_DRIVER_MANIFEST_PATHS=...` to have that plugin manifest get loaded during startup. Specify
     ;; multiple plugin manifests by comma-separating them.
     (when-let [additional-paths (env/env :mb-dev-additional-driver-manifest-paths)]
       (map u.files/get-path (str/split additional-paths #",")))))

  (defn- load-local-plugin-manifests!
    "Load local plugin manifest files when running in dev or test mode, to simulate what would happen when loading those
  same plugins from the uberjar. This is needed because some plugin manifests define driver methods and the like that
  aren't defined elsewhere."
    []
    ;; TODO - this should probably do an actual search in case we ever add any additional directories
    (doseq [manifest-path (driver-manifest-paths)]
      (log/infof "Loading local plugin manifest at %s" (str manifest-path))
      (load-local-plugin-manifest! manifest-path))))

(defn- has-manifest? ^Boolean [^Path path]
  (boolean (u.files/file-exists-in-archive? path "metabase-plugin.yaml")))

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
        (log/errorf e "Failied to initialize plugin %s" (.getFileName path))))))

(defn- load! []
  (log/infof "Loading plugins in %s..." (str (plugins-dir)))
  (extract-system-modules!)
  (let [paths (plugins-paths)]
    (init-plugins! paths))
  (when (or config/is-dev? config/is-test?)
    (load-local-plugin-manifests!)))

(defonce ^:private loaded? (atom false))

(defn load-plugins!
  "Load Metabase plugins. The are JARs shipped as part of Metabase itself, under the `resources/modules` directory (the
  source for these JARs is under the `modules` directory); and others manually added by users to the Metabase plugins
  directory, which defaults to `./plugins`.

  When loading plugins, Metabase performs the following steps:

  *  Metabase creates the plugins directory if it does not already exist.
  *  Any plugins that are shipped as part of Metabase itself are extracted from the Metabase uberjar (or `resources`
     directory when running with the Clojure CLI) into the plugins directory.
  *  Each JAR in the plugins directory that *does not* include a Metabase plugin manifest is added to the classpath.
  *  For JARs that include a Metabase plugin manifest (a `metabase-plugin.yaml` file), a lazy-loading Metabase driver
     is registered; when the driver is initialized (automatically, when certain methods are called) the JAR is added
     to the classpath and the driver namespace is loaded

  This function will only perform loading steps the first time it is called — it is safe to call this function more
  than once."
  []
  (when-not @loaded?
    (locking loaded?
      (when-not @loaded?
        (load!)
        (reset! loaded? true)))))
