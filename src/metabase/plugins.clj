(ns metabase.plugins
  "The Metabase 'plugins' system automatically adds JARs in the `./plugins/` directory (parallel to `metabase.jar`) to
  the classpath at runtime. This works great on Java 7 and 8, but never really worked properly on Java 9; as of 0.29.4
  we're planning on telling people to just add extra external dependencies with `-cp` when using Java 9."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [dynapath.util :as dynapath]
            [metabase
             [config :as config]
             [util :as u]]
            [puppetlabs.i18n.core :refer [trs]]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                   Java 7 + 8                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- plugins-dir
  "The Metabase plugins directory. This defaults to `plugins/` in the same directory as `metabase.jar`, but can be
  configured via the env var `MB_PLUGINS_DIR`."
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
  (let [sysloader (ClassLoader/getSystemClassLoader)]
    (dynapath/add-classpath-url sysloader (.toURL (.toURI jar-file)))))

(defn dynamically-add-jars!
  "Dynamically add any JARs in the `plugins-dir` to the classpath.
   This is used for things like custom plugins or the Oracle JDBC driver, which cannot be shipped alongside Metabase
  for licensing reasons."
  []
  (when-let [^java.io.File dir (plugins-dir)]
    (log/info (trs "Loading plugins in directory {0}..." dir))
    (doseq [^java.io.File file (.listFiles dir)
            :when (and (.isFile file)
                       (.canRead file)
                       (re-find #"\.jar$" (.getPath file)))]
      (log/info (u/format-color 'magenta (str (trs "Loading plugin {0}... " file) (u/emoji "🔌"))))
      (add-jar-to-classpath! file))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                     Java 9                                                     |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- show-java-9-message
  "Show a message telling people how to add external dependencies on Java 9 if they have some in the `./plugins`
  directory."
  []
  (when-let [plugins-dir (plugins-dir)]
    (when (seq (.listFiles plugins-dir))
      (log/info
       (trs "It looks like you have some external dependencies in your Metabase plugins directory.")
       (trs "With Java 9 or higher, Metabase cannot automatically add them to your classpath.")
       (trs "Instead, you should include them at launch with the -cp option. For example:")
       "\n\n    java -cp metabase.jar:plugins/* metabase.core\n\n"
       (trs "See https://metabase.com/docs/latest/operations-guide/start.html#java-versions for more details.")
       (trs "(If you're already running Metabase this way, you can ignore this message.)")))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                 load-plugins!                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn load-plugins!
  "Dynamically add JARs if we're running on Java 7 or 8. For Java 9, where this doesn't work, just display a nice
  message instead."
  []
  (if (u/is-java-9-or-higher?)
    (show-java-9-message)
    (dynamically-add-jars!)))
