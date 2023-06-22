(ns build.uberjar
  (:require
   [clojure.java.io :as io]
   [clojure.tools.build.api :as b]
   [clojure.tools.build.util.zip :as build.zip]
   [clojure.tools.namespace.dependency :as ns.deps]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [hf.depstar.api :as depstar]
   [metabuild-common.core :as u])
  (:import
   (java.io OutputStream)
   (java.net URI)
   (java.nio.file Files FileSystems OpenOption StandardOpenOption)
   (java.util Collections)
   (java.util.jar Manifest)))

(def class-dir "target/classes")
(def uberjar-filename "target/uberjar/metabase.jar")

(defn do-with-duration-ms [thunk f]
  (let [start-time-ms (System/currentTimeMillis)
        result        (thunk)
        duration      (- (System/currentTimeMillis) start-time-ms)]
    (f duration)
    result))

(defmacro with-duration-ms [[duration-ms-binding] & body]
  (let [[butlast-forms last-form] ((juxt butlast last) body)]
    `(do-with-duration-ms
      (fn [] ~@butlast-forms)
      (fn [~duration-ms-binding]
        ~last-form))))

(defn create-basis [edition]
  {:pre [(#{:ee :oss} edition)]}
  (b/create-basis {:project "deps.edn", :aliases #{edition}}))

(defn all-paths [basis]
  (concat (:paths basis)
          (get-in basis [:argmap :extra-paths])))

(defn clean! []
  (u/step "Clean"
    (u/step (format "Delete %s" class-dir)
      (b/delete {:path class-dir}))
    (u/step (format "Delete %s" uberjar-filename)
      (b/delete {:path uberjar-filename}))))

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

(defn metabase-namespaces-in-topo-order [basis]
  (let [ns-decls   (mapcat
                    (comp ns.find/find-ns-decls-in-dir io/file)
                    (all-paths basis))
        ns-symbols (set (map ns.parse/name-from-ns-decl ns-decls))]
    (->> (dependencies-graph ns-decls)
         ns.deps/topo-sort
         (filter ns-symbols)
         (cons 'metabase.bootstrap))))

(defn compile-sources! [basis]
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

(defn copy-resources! [edition basis]
  (u/step "Copy resources"
    ;; technically we don't NEED to copy the Clojure source files but it doesn't really hurt anything IMO.
    (doseq [path (all-paths basis)]
      (u/step (format "Copy %s" path)
        (b/copy-dir {:target-dir class-dir, :src-dirs [path]})))))

(defn create-uberjar! [basis]
  (u/step "Create uberjar"
    (with-duration-ms [duration-ms]
      (depstar/uber {:class-dir class-dir
                     :uber-file uberjar-filename
                     :basis     basis})
      (u/announce "Created uberjar in %.1f seconds." (/ duration-ms 1000.0)))))

(def manifest-entries
  {"Manifest-Version" "1.0"
   "Multi-Release"    "true"
   "Created-By"       "Metabase build.clj"
   "Build-Jdk-Spec"   (System/getProperty "java.specification.version")
   "Main-Class"       "metabase.bootstrap"})

(defn manifest ^Manifest []
  (doto (Manifest.)
    (build.zip/fill-manifest! manifest-entries)))

(defn write-manifest! [^OutputStream os]
  (.write (manifest) os)
  (.flush os))

;; the customizations we need to make are not currently supported by tools.build -- see
;; https://ask.clojure.org/index.php/10827/ability-customize-manifest-created-clojure-tools-build-uber -- so we need
;; to do it by hand for the time being.
(defn update-manifest! []
  (u/step "Update META-INF/MANIFEST.MF"
    (with-open [fs (FileSystems/newFileSystem (URI. (str "jar:file:" (.getAbsolutePath (io/file "target/uberjar/metabase.jar"))))
                                              Collections/EMPTY_MAP)]
      (let [manifest-path (.getPath fs "META-INF" (into-array String ["MANIFEST.MF"]))]
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
        (copy-resources! edition basis)
        (create-uberjar! basis)
        (update-manifest!))
      (u/announce "Built target/uberjar/metabase.jar in %.1f seconds."
                  (/ duration-ms 1000.0)))))
