(ns build
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.build.api :as b]
            [clojure.tools.build.util.zip :as b.zip]
            [clojure.tools.namespace.dependency :as ns.deps]
            [clojure.tools.namespace.find :as ns.find]
            [clojure.tools.namespace.parse :as ns.parse]
            [metabuild-common.core :as c])
  (:import java.io.OutputStream
           java.net.URI
           [java.nio.file Files FileSystems OpenOption StandardOpenOption]
           java.util.Collections
           java.util.jar.Manifest))

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
          (get-in basis [:classpath-args :extra-paths])))

(defn clean! []
  (c/step "Clean"
    (c/step (format "Delete %s" class-dir)
      (b/delete {:path class-dir}))
    (c/step (format "Delete %s" uberjar-filename)
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
         (filter ns-symbols))))

(defn compile-sources! [basis]
  (c/step "Compile Clojure source files"
    (let [paths    (all-paths basis)
          _        (c/announce "Compiling Clojure files in %s" (pr-str paths))
          ns-decls (c/step "Determine compilation order for Metabase files"
                     (metabase-namespaces-in-topo-order basis))]
      (with-duration-ms [duration-ms]
        (b/compile-clj {:basis      basis
                        :src-dirs   paths
                        :class-dir  class-dir
                        :ns-compile ns-decls})
        (c/announce "Finished compilation in %.1f seconds." (/ duration-ms 1000.0))))))

(defn copy-resources! [edition basis]
  (c/step "Copy resources"
    ;; technically we don't NEED to copy the Clojure source files but it doesn't really hurt anything IMO.
    (doseq [path (all-paths basis)]
      (c/step (format "Copy %s" path)
        (b/copy-dir {:target-dir class-dir, :src-dirs [path]})))))

(def manifest-entries
  {"Manifest-Version" "1.0"
   "Created-By"       "Metabase build.clj"
   "Build-Jdk-Spec"   (System/getProperty "java.specification.version")
   "Main-Class"       "metabase.core"
   ;; important to have this here #17002. Tools.build will automatically infer this is a multi-release jar so we must
   ;; place false here so it merges on top.
   "Multi-Release"    "false"
   "Liquibase-Package" (str/join ","
                                 ["liquibase.change"
                                  "liquibase.changelog"
                                  "liquibase.database"
                                  "liquibase.datatype"
                                  "liquibase.diff"
                                  "liquibase.executor"
                                  "liquibase.ext"
                                  "liquibase.lockservice"
                                  "liquibase.logging"
                                  "liquibase.parser"
                                  "liquibase.precondition"
                                  "liquibase.sdk"
                                  "liquibase.serializer"
                                  "liquibase.snapshot"
                                  "liquibase.sqlgenerator"
                                  "liquibase.structure"
                                  "liquibase.structurecompare"])})
(defn create-uberjar! [basis]
  (c/step "Create uberjar"
    (with-duration-ms [duration-ms]
      (b/uber {:class-dir class-dir
               :uber-file uberjar-filename
               :basis     basis
               :manifest manifest-entries

               ;; exclude license.* from jar. We compile 3rd party licenses elsewhere and run into issues on osx due
               ;; to case insensitive collisions with META-INF/license and META-INF/LICENSE/license.txt
               :exclude [#"license.*"]})
      (c/announce "Created uberjar in %.1f seconds." (/ duration-ms 1000.0)))))

;; clojure -T:build uberjar :edition <edition>
(defn uberjar [{:keys [edition], :or {edition :oss}}]
  (c/step (format "Build %s uberjar" edition)
    (with-duration-ms [duration-ms]
      (clean!)
      (let [basis (create-basis edition)]
        (compile-sources! basis)
        (copy-resources! edition basis)
        (create-uberjar! basis))
      (c/announce "Built target/uberjar/metabase.jar in %.1f seconds."
                  (/ duration-ms 1000.0)))))

;; TODO -- add `jar` and `install` commands to install Metabase to the local Maven repo (?) could make it easier to
;; build 3rd-party drivers the old way
