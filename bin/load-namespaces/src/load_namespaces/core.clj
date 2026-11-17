(ns load-namespaces.core
  "Loads every namespace under the given source paths, with reflection warnings on, so that CI catches
   namespaces that only fail against a shipped classpath -- one without the `:dev` dependencies. Circular
   dependencies and compilation errors surface here too, since both make a namespace fail to load.

   A reflection warning in a file under one of the source paths also fails the run. Warnings in libraries
   don't: `load` turns reflection warnings on for everything it pulls in, and libraries are not ours to fix."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str])
  (:import
   (java.io File PrintWriter StringWriter Writer)))

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

(defn- reflection-warnings
  "The reflection warnings in compiler `output` that point into one of `owned-paths`. The compiler names the
   file by its classpath-relative path, which is the form [[loadable-paths]] returns, plus an extension."
  [output owned-paths]
  (for [[line path] (re-seq #"(?m)^Reflection warning, (.+?)\.cljc?:\d+:\d+ - .*$" output)
        :when       (contains? owned-paths path)]
    line))

(defn- load-path
  "Loads `path`, returning the problems it caused: `:error`, the Throwable it threw, and `:reflection`, the
   warnings it caused in `owned-paths`. Returns nil if it was already loaded."
  [path owned-paths]
  (let [lib (path->lib path)]
    ;; Namespaces this one already required must not be loaded a second time: reloading a namespace
    ;; redefines its protocols, and every implementation compiled against the previous definition breaks.
    (when-not (contains? (loaded-libs) lib)
      (binding [*out* *err*]
        (println "Loading namespace" lib))
      ;; the compiler prints its warnings to `*err*`; collect them for this load, then pass them on
      (let [captured (StringWriter.)
            error    (binding [*err* (PrintWriter. captured true)]
                       (try
                         (binding [*warn-on-reflection* true]
                           ;; leading slash: without it `load` resolves the path against the *calling*
                           ;; namespace's directory
                           (load (str "/" path)))
                         nil
                         (catch Throwable e
                           (binding [*out* *err*]
                             (println "Failed to load" lib))
                           (.printStackTrace e (PrintWriter. ^Writer *err* true))
                           e)))
            output   (str captured)]
        (binding [*out* *err*]
          (print output)
          (flush))
        {:error      error
         :reflection (reflection-warnings output owned-paths)}))))

(defn- load-namespaces
  "Loads every namespace under `source-paths`, returning `:failures`, how many of them failed to load, and
   `:reflection`, the reflection warnings in files under `source-paths`."
  [source-paths]
  (let [paths    (mapcat loadable-paths source-paths)
        owned    (set paths)
        problems (doall (map #(load-path % owned) paths))]
    {:failures   (count (filter :error problems))
     :reflection (vec (mapcat :reflection problems))}))

(defn -main
  "Loads every namespace under `source-paths`, or under `src` if none are given, and exits non-zero if any of
   them failed or caused a reflection warning in one of our files."
  [& source-paths]
  (let [{:keys [failures reflection]} (load-namespaces (or (seq source-paths) ["src"]))]
    (shutdown-agents)
    (binding [*out* *err*]
      (when (pos? failures)
        (println failures "namespace(s) failed to load"))
      (when (seq reflection)
        (println (count reflection) "reflection warning(s) in our code; add type hints to fix them:")
        (run! println reflection)))
    (when (or (pos? failures) (seq reflection))
      ;; exiting with `failures` would wrap past 255 and could be read as success
      (System/exit 1))))
