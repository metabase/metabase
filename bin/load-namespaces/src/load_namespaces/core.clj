(ns load-namespaces.core
  "Loads every namespace under the given source paths, with reflection warnings on, so that CI catches
   namespaces that only fail against a shipped classpath -- one without the `:dev` dependencies. Circular
   dependencies and compilation errors surface here too, since both make a namespace fail to load."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (java.io File PrintWriter Writer)))

(set! *warn-on-reflection* true)

(defn- loadable-paths
  "Extension-stripped, `root`-relative paths of every JVM-loadable source file under `root`, which is the
   form [[clojure.core/load]] wants. `root` must also be a classpath root, or `load` cannot resolve them.
   `.cljs` is skipped: it cannot be loaded on the JVM."
  [root]
  (let [^File root-file (io/file root)]
    ;; a nonexistent root scans as an empty directory, so a rename would silently drop a whole source tree
    (when-not (.isDirectory root-file)
      (throw (ex-info (str "Not a source directory: " root)
                      {:root root})))
    (let [strip (inc (count (.getPath root-file)))]
      (sort
       (for [^File file (file-seq root-file)
             :when      (.isFile file)
             :let       [path (.getPath file)]
             :when      (or (str/ends-with? path ".clj")
                            (str/ends-with? path ".cljc"))]
         (subs path strip (str/last-index-of path ".")))))))

(defn- path->lib
  "The namespace a source file at `path` is expected to declare."
  [path]
  (symbol (-> path (str/replace "/" ".") (str/replace "_" "-"))))

(defn- load-path
  "Loads `path`, returning the Throwable it threw, or nil if it loaded or was already loaded."
  [path]
  (let [lib (path->lib path)]
    ;; Namespaces this one already required must not be loaded a second time: reloading a namespace
    ;; redefines its protocols, and every implementation compiled against the previous definition breaks.
    (when-not (contains? (loaded-libs) lib)
      (binding [*out* *err*]
        (println "Loading namespace" lib))
      (try
        (binding [*warn-on-reflection* true]
          ;; leading slash: without it `load` resolves the path against the *calling* namespace's directory
          (load (str "/" path)))
        nil
        (catch Throwable e
          (binding [*out* *err*]
            (println "Failed to load" lib))
          (.printStackTrace e (PrintWriter. ^Writer *err* true))
          e)))))

(defn- load-namespaces
  "Loads every namespace under `source-paths`, returning how many of them failed."
  [source-paths]
  (->> source-paths
       (mapcat loadable-paths)
       (map load-path)
       (filter some?)
       count))

(defn -main
  "Loads every namespace under `source-paths`, or under `src` if none are given, and exits non-zero if any
   of them failed."
  [& source-paths]
  (let [failures (load-namespaces (or (seq source-paths) ["src"]))]
    (shutdown-agents)
    (when (pos? failures)
      (binding [*out* *err*]
        (println failures "namespace(s) failed to load"))
      ;; exiting with `failures` would wrap past 255 and could be read as success
      (System/exit 1))))
