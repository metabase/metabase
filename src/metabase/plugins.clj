(ns metabase.plugins
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [environ.core :as env]
            [metabase.plugins
             [classloader :as classloader]
             [files :as files]
             [initialize :as init]
             [lazy-loaded-driver :as lazy-loaded-driver]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [yaml.core :as yaml])
  (:import java.nio.file.Path))

(defn- plugins-dir-filename ^String []
  (or (env/env :mb-plugins-dir)
      (str (System/getProperty "user.dir") "/plugins")))

(defn- ^Path plugins-dir
  "Get a `Path` to the Metabase plugins directory, creating it if needed."
  []
  (let [path (files/get-path (plugins-dir-filename))]
    (files/create-dir-if-not-exists! path)
    path))

(defn- extract-system-modules! []
  (when (io/resource "modules")
    (let [plugins-path (plugins-dir)]
      (files/with-open-path-to-resource [modules-path "modules"]
        (files/copy-files-if-not-exists! modules-path plugins-path)))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                           Check Plugin Dependencies                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- dependency-type [{classname :class}]
  (if classname
    :class
    :unknown))

(defmulti ^:private dependency-satisfied?
  {:arglists '([plugin-nane dependency])}
  (fn [_ dep] (dependency-type dep)))

(defmethod dependency-satisfied? :default [plugin-name dep]
  (log/error (u/format-color 'red
                 (trs "Plugin {0} declares a dependency that Metabase does not understand: {1}" plugin-name dep))
             (trs "Refer to the plugin manifest reference for a complete list of valid plugin dependencies:")
             "https://github.com/metabase/metabase/wiki/Metabase-Plugin-Manifest-Reference")
  false)

(defmethod dependency-satisfied? :class [plugin-name {^String classname :class, message :message, :as dep}]
  (try
    (Class/forName classname false (classloader/the-classloader))
    (catch ClassNotFoundException _
      (log/info (u/format-color 'red
                    (trs "Metabase cannot initialize plugin {0} due to required dependencies." plugin-name))
                (or message
                    (trs "Class not found: {0}" classname)))
      false)))

(defn- all-dependencies-satisfied?
  "Check whether all dependencies are satisfied for a plugin; return truthy if all are; otherwise log explanations about
  why they are not, and return falsey."
  [{{plugin-name :name, :keys [version]} :info, :keys [dependencies]}]
  (let [plugin-name (format "%s %s" plugin-name version)]
    (every? (fn [dep]
              (u/prog1 (dependency-satisfied? plugin-name dep)
                (log/debug (trs "{0} dependency {1} satisfied? {2}" plugin-name (dissoc dep :message) (boolean <>)))))
            dependencies)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                               Initialize Plugin                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- add-to-classpath! [^Path jar-path]
  (classloader/add-url-to-classpath! (-> jar-path .toUri .toURL)))

(defn- plugin-info [^Path jar-path]
  (some-> (files/slurp-file-from-archive jar-path "metabase-plugin.yaml")
          yaml/parse-string))

(defn- init-plugin-with-info!
  "Initiaize plugin using parsed info from a plugin maifest. Returns truthy if plugin was successfully initialized;
  falsey otherwise."
  [{init-steps :init, driver-or-drivers :driver, :as info}]
  (when (all-dependencies-satisfied? info)
    (doseq [{:keys [lazy-load], :or {lazy-load true}, :as driver} (u/one-or-many driver-or-drivers)]
      (if lazy-load
        (lazy-loaded-driver/register-lazy-loaded-driver! (assoc info :driver driver))
        (init/initialize! init-steps)))
    :ok))

(defn- init-plugin! [^Path jar-path]
  (when-let [info (plugin-info jar-path)]
    (init-plugin-with-info! info)))


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
                             (u/format-color 'red
                                 (trs "spark-deps.jar is no longer needed by Metabase 1.0+. You can delete it from the plugins directory.")))))]
    path))

(defn- add-plugins-to-classpath! [paths]
  (doseq [path paths]
    (add-to-classpath! path)))

(defn- init-plugins! [paths]
  (doseq [^Path path paths]
    (try
      (init-plugin! path)
      (catch Throwable e
        (log/error e (u/format-color 'red (trs "Failied to initialize plugin {0}" (.getFileName path))))))))

(defn load-plugins!
  "Load Metabase plugins. The are JARs shipped as part of Metabase itself, under the `resources/modules` directory (the
  source for these JARs is under the `modules` directory); and others manually added by users to the Metabase plugins
  directory, which defaults to `./plugins`.

  When loading plugins, Metabase performs the following steps:

  *  Metabase creates the plugins directory if it does not already exist.
  *  Any plugins that are shipped as part of Metabase itself are extracted from the Metabase uberjar (or `resources`
     directory when running with `lein`) into the plugins directory.
  *  Each JAR in the plugins directory is added to the classpath.
  *  For JARs that include a Metabase plugin manifest (a `metabase-plugin.yaml` file), "
  []
  (log/info (u/format-color 'magenta (trs "Loading plugins in {0}..." (str (plugins-dir)))))
  (extract-system-modules!)
  (let [paths (plugins-paths)]
    (add-plugins-to-classpath! paths)
    (init-plugins! paths)))
