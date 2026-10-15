(ns library-checker.build
  "Builds the babashka artifact of the checker: an uberjar of the namespaces that the checker loads, the resources of
  its module, and the dependencies of the checker config. `bb <jar> <checkout> [--manifest <file>]` runs it, with no
  Metabase source tree."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.edn :as edn]
   [clojure.string :as str]))

(def entry-point
  "The namespace of the checker's `-main`."
  'metabase-enterprise.library-branching.check)

(def ^:private module-prefix "metabase-enterprise.library-branching.")

(def ^:private module-dir "metabase_enterprise/library_branching")

(defn- config-file
  []
  (fs/path (System/getProperty "babashka.config")))

(defn repository-root
  "The root of the Metabase repository that holds the checker config."
  []
  (fs/normalize (fs/absolutize (fs/path (fs/parent (config-file)) "../.."))))

(defn- source-root
  []
  (fs/path (repository-root) "enterprise/backend/src"))

(def default-jar
  "The path of the jar, relative to the repository root."
  "target/library-checker/library-checker.jar")

(defn- source-file
  "The path of the source of `ns-sym`, relative to the source root."
  [ns-sym]
  (let [base (-> (name ns-sym) (str/replace "-" "_") (str/replace "." "/"))]
    (or (first (filter #(fs/exists? (fs/path (source-root) %)) [(str base ".clj") (str base ".cljc")]))
        (throw (ex-info (str "No source for " ns-sym) {:ns ns-sym})))))

(defn closure
  "The sorted source paths, relative to the source root, of the module namespaces that [[entry-point]] loads."
  []
  (require entry-point)
  (sort (for [n     (all-ns)
              :let  [s (name (ns-name n))]
              :when (str/starts-with? s module-prefix)]
          (source-file (symbol s)))))

(defn resources
  "The sorted paths, relative to the source root, of the files of the module that are not Clojure source. A namespace
  of the checker can read any of them as a resource."
  []
  (let [root (source-root)]
    (sort (for [f     (fs/glob (fs/path root module-dir) "**")
                :when (and (fs/regular-file? f) (not (re-find #"\.clj[cs]?$" (str f))))]
            (str (fs/relativize root f))))))

(defn- bb-executable
  []
  (-> (java.lang.ProcessHandle/current) .info .command (.orElse "bb")))

(defn build!
  "Writes the uberjar of the checker to `jar`, and returns its path."
  [jar]
  (let [jar   (fs/absolutize jar)
        stage (fs/create-temp-dir {:prefix "library-checker-"})]
    (try
      (doseq [rel (concat (closure) (resources))
              :let [to (fs/path stage "src" rel)]]
        (fs/create-dirs (fs/parent to))
        (fs/copy (fs/path (source-root) rel) to))
      ;; The jar takes the dependencies of the checker config, so the version of malli is set in one place.
      (spit (fs/file stage "bb.edn") (pr-str {:paths ["src"] :deps (:deps (edn/read-string (slurp (fs/file (config-file)))))}))
      (fs/create-dirs (fs/parent jar))
      (fs/delete-if-exists jar)
      (p/shell {:dir (str stage)} (bb-executable) "uberjar" (str jar) "-m" (str entry-point))
      (str jar)
      (finally (fs/delete-tree stage)))))

(defn -main
  "`[--out <jar>]`: builds the jar at `<jar>`, or at [[default-jar]] under the repository root."
  [& args]
  (let [[flag out & more] args]
    (when-not (or (empty? args) (and (= "--out" flag) out (empty? more)))
      (binding [*out* *err*] (println "Usage: build [--out <jar>]"))
      (System/exit 2))
    (println (build! (or out (fs/path (repository-root) default-jar))))))
