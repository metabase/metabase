(ns metabase.plugins
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.util :as u])
  (:import (java.net URL URLClassLoader)))

(defn- plugins-dir
  "The Metabase plugins directory. This defaults to `plugins/` in the same directory as `metabase.jar`, but can be configured via the env var `MB_PLUGINS_DIR`."
  ^java.io.File []
  (let [dir (io/file (or (config/config-str :mb-plugins-dir)
                         (str (System/getProperty "user.dir") "/plugins")))]
    (when (and (.isDirectory dir)
               (.canRead dir))
      dir)))


(defn- add-jar-to-classpath!
  "Dynamically add a JAR file to the classpath.
   See also [this SO post](http://stackoverflow.com/questions/60764/how-should-i-load-jars-dynamically-at-runtime/60766#60766)"
  [^java.io.File jar-file]
  (let [sysloader (ClassLoader/getSystemClassLoader)
        method    (.getDeclaredMethod URLClassLoader "addURL" (into-array Class [URL]))]
    (.setAccessible method true)
    (.invoke method sysloader (into-array URL [(.toURL (.toURI jar-file))]))))

(defn load-plugins!
  "Dynamically add any JARs in the `plugins-dir` to the classpath.
   This is used for things like custom plugins or the Oracle JDBC driver, which cannot be shipped alongside Metabase for licensing reasons."
  []
  (when-let [^java.io.File dir (plugins-dir)]
    (log/info (format "Loading plugins in directory %s..." dir))
    (doseq [^java.io.File file (.listFiles dir)
            :when (and (.isFile file)
                       (.canRead file)
                       (re-find #"\.jar$" (.getPath file)))]
      (log/info (u/format-color 'magenta "Loading plugin %s... 🔌" file))
      (add-jar-to-classpath! file))))
