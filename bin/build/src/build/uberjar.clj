(ns build.uberjar
  (:require
   [clojure.java.io :as io]
   [clojure.tools.build.api :as b]
   [clojure.tools.build.util.zip :as build.zip]
   [clojure.tools.namespace.dependency :as ns.deps]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [metabuild-common.core :as u]
   [org.corfield.log4j2-conflict-handler :refer [log4j2-conflict-handler]])
  (:import
   (java.io OutputStream)
   (java.nio.file Files OpenOption StandardOpenOption)
   (java.util.jar Manifest)))

(set! *warn-on-reflection* true)

(def ^:private class-dir
  (u/filename u/project-root-directory "target" "classes"))

(def uberjar-filename
  "Target filename for the Metabase uberjar."
  (u/filename u/project-root-directory "target" "uberjar" "metabase.jar"))

(defn- do-with-duration-ms [thunk f]
  (let [start-time-ms (System/currentTimeMillis)
        result        (thunk)
        duration      (- (System/currentTimeMillis) start-time-ms)]
    (f duration)
    result))

(defmacro ^:private with-duration-ms [[duration-ms-binding] & body]
  (let [[butlast-forms last-form] ((juxt butlast last) body)]
    `(do-with-duration-ms
      (fn [] ~@butlast-forms)
      (fn [~duration-ms-binding]
        ~last-form))))

(defn- create-basis [edition]
  {:pre [(#{:ee :oss} edition)]}
  (b/create-basis {:project "deps.edn", :aliases #{edition}}))

(defn- all-paths [basis]
  (concat (:paths basis)
          (get-in basis [:argmap :extra-paths])))

(defn- delete! [path]
  (u/step (format "Delete %s" path)
    (b/delete {:path path})))

(defn- clean! []
  (u/step "Clean"
    (delete! class-dir)
    (delete! uberjar-filename)))

;; this topo sort order stuff is required for stuff to work correctly... I copied it from my Cloverage PR
;; https://github.com/cloverage/cloverage/pull/303
(defn- dependencies-graph
  "Return a `clojure.tools.namespace` dependency graph of namespaces named by `ns-symbol`."
  [ns-decls]
  (reduce
   (fn [graph ns-decl]
     (let [ns-symbol (ns.parse/name-from-ns-decl ns-decl)]
       (reduce
        (fn [graph dep]
          (ns.deps/depend graph ns-symbol dep))
        graph
        (ns.parse/deps-from-ns-decl ns-decl))))
   (ns.deps/graph)
   ns-decls))

(defn- metabase-namespaces-in-topo-order [basis]
  (let [ns-decls   (into []
                         (comp (map io/file)
                               (mapcat ns.find/find-ns-decls-in-dir))
                         (all-paths basis))
        ns-symbols (into #{} (map ns.parse/name-from-ns-decl) ns-decls)
        sorted     (->> (dependencies-graph ns-decls)
                        ns.deps/topo-sort
                        (filter ns-symbols))
        orphans    (remove (set sorted) ns-symbols)
        all        (concat orphans sorted)]
    (assert (contains? (set all) 'metabase.core.bootstrap))
    (when (contains? ns-symbols 'metabase-enterprise.core)
      (assert (contains? (set all) 'metabase-enterprise.core)))
    all))

(defn- compile-sources! [basis]
  (u/step "Compile Clojure source files"
    (let [paths    (all-paths basis)
          _        (u/announce "Compiling Clojure files in %s" (pr-str paths))
          ns-decls (u/step "Determine compilation order for Metabase files"
                     (metabase-namespaces-in-topo-order basis))]
      (with-duration-ms [duration-ms]
        (b/compile-clj {:basis      basis
                        :src-dirs   paths
                        :class-dir  class-dir
                        :ns-compile ns-decls})
        (u/announce "Finished compilation in %.1f seconds." (/ duration-ms 1000.0))))))

(def ^:private resource-ignore-patterns
  "Files to ignore when copying resources from source directories (`src` and `enterprise/backend/src`) and resource
  directories (`resources`)."
  [#"\.clj[c|s]?$"
   #""
   ;; ignore .~undo-tree~ or other nonsense files created by editors. I was considering using
   ;;
   ;;    git ls-files --ignored --exclude-from=.gitignore --others
   ;;
   ;; to find ALL the files to ignore here but then we run into problems accidentally ignoring build artifacts like
   ;; translation files. This should be good enough for now -- we don't really NEED to do this stuff since we build in a
   ;; clean Docker env, so it's more of a nice to have to keep the clutter in our JARs down when building locally.
   #"\~$"
   #"^\.?#"
   #"\.rej$"])

(defn- copy-resources! [basis]
  (u/step "Copy resources"
    (doseq [path (all-paths basis)]
      (u/step (format "Copy resources from %s" path)
        (b/copy-dir {:target-dir class-dir
                     :src-dirs   [path]
                     :ignores    resource-ignore-patterns})))))

(def ^:private dependency-ignore-patterns
  "Files to ignore when copying resources from our dependencies."
  [#".*metabase.*\.clj[c|s]?$"
   ;; ignore module-info files inside META-INF because we don't have a modular JAR and they can break tools like `jar
   ;; tf` -- see Slacc thread
   ;; https://metaboat.slack.com/archives/C5XHN8GLW/p1731633690703149?thread_ts=1731504670.951389&cid=C5XHN8GLW
   #".*module-info\.class"
   #"^LICENSE$"])

(defn- create-uberjar! [basis]
  (u/step "Create uberjar"
    (with-duration-ms [duration-ms]
      (b/uber {:class-dir         class-dir
               :uber-file         uberjar-filename
               ;; merge Log4j2Plugins.dat files. (#50721)
               :conflict-handlers log4j2-conflict-handler
               :basis             basis
               :exclude           dependency-ignore-patterns})
      (u/announce "Created uberjar in %.1f seconds." (/ duration-ms 1000.0)))))

(def ^:private manifest-entries
  {"Manifest-Version" "1.0"
   "Multi-Release"    "true"
   "Created-By"       "Metabase build.clj"
   "Build-Jdk-Spec"   (System/getProperty "java.specification.version")
   "Main-Class"       "metabase.core.bootstrap"})

(defn- manifest ^Manifest []
  (doto (Manifest.)
    (build.zip/fill-manifest! manifest-entries)))

(defn- write-manifest! [^OutputStream os]
  (.write (manifest) os)
  (.flush os))

(defn update-manifest!
  "Start a build step that updates the manifest.
  The customizations we need to make are not currently supported by tools.build -- see
  https://ask.clojure.org/index.php/10827/ability-customize-manifest-created-clojure-tools-build-uber -- so we need
  to do it by hand for the time being."
  []
  (u/step "Update META-INF/MANIFEST.MF"
    (u/with-open-jar-file-system [fs "target/uberjar/metabase.jar"]
      (let [manifest-path (u/get-path-in-filesystem fs "META-INF" "MANIFEST.MF")]
        (with-open [os (Files/newOutputStream manifest-path (into-array OpenOption [StandardOpenOption/WRITE
                                                                                    StandardOpenOption/TRUNCATE_EXISTING]))]
          (write-manifest! os))))))

(defn uberjar
  "Build just the uberjar (no i18n, FE, or anything else). You can run this from the CLI like:

    clojure -X:build:build/uberjar
    clojure -X:build:build/uberjar :edition :ee"
  [{:keys [edition], :or {edition :oss}}]
  (u/step (format "Build %s uberjar" edition)
    (with-duration-ms [duration-ms]
      (clean!)
      (let [basis (create-basis edition)]
        (compile-sources! basis)
        (copy-resources! basis)
        (create-uberjar! basis)
        (update-manifest!))
      (u/announce "Built target/uberjar/metabase.jar in %.1f seconds."
                  (/ duration-ms 1000.0)))))
