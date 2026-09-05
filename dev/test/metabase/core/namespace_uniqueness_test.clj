(ns metabase.core.namespace-uniqueness-test
  "Tests that no namespace is declared by more than one file on a single platform's classpath.

  When two files declare the same namespace, `require` loads whichever the classpath reaches first and
  the other file's vars never exist. Nothing fails: the shadowed file's tests simply never run."
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.find :as ns.find]))

(set! *warn-on-reflection* true)

(def ^:private project-root
  (str (.getCanonicalPath (io/file ".")) "/"))

(defn- relative-path [^java.io.File file]
  (let [path (.getCanonicalPath file)]
    (if (str/starts-with? path project-root)
      (subs path (count project-root))
      path)))

(defn- declarations
  "Every `[namespace file]` pair `platform` can load from the classpath directories.

  `platform` is [[ns.find/clj]] or [[ns.find/cljs]]; each includes `.cljc`, so a `.cljc` file is
  reported under both."
  [platform]
  (for [dir  (classpath/classpath-directories)
        file (ns.find/find-sources-in-dir dir platform)
        :let [decl (ns.file/read-file-ns-decl file (:read-opts platform))]
        :when decl]
    [(second decl) file]))

(defn- collisions
  "Namespaces `platform` can load from more than one file, as `{namespace [path ...]}`."
  [platform]
  (into (sorted-map)
        (keep (fn [[ns-symb pairs]]
                (let [paths (sort (map (comp relative-path second) pairs))]
                  (when (next paths)
                    [ns-symb (vec paths)]))))
        (group-by first (declarations platform))))

(deftest ^:parallel no-duplicate-namespaces-test
  (doseq [[platform-name platform] {"clj" ns.find/clj, "cljs" ns.find/cljs}]
    (testing (str "no namespace is declared by two " platform-name " files\n"
                  "Rename one of them -- see metabase.notification.payload.core-ee-test for the"
                  " convention used when an EE test shadows its OSS counterpart.")
      (is (= {} (collisions platform))))))
