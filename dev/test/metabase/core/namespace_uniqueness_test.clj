(ns metabase.core.namespace-uniqueness-test
  "Tests that no namespace is declared by more than one file on a single platform's classpath.

  When two files declare the same namespace, `require` loads whichever the classpath reaches first and
  the other file's vars never exist. Nothing fails: the shadowed file's tests simply never run.

  An EE test that would otherwise take the same `metabase.*` name as its OSS counterpart is named with an
  `-ee-test` suffix -- see [[metabase.notification.payload.core-ee-test]] and
  [[metabase.notification.payload.execute-ee-test]]."
  (:require
   [clojure.java.classpath :as classpath]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private project-root
  (str (.getCanonicalPath (io/file ".")) "/"))

(defn- relative-path [^java.io.File file]
  (let [path (.getCanonicalPath file)]
    (if (str/starts-with? path project-root)
      (subs path (count project-root))
      path)))

(defn- declarations
  "Every `[namespace relative-path]` pair `platform` can load from the classpath directories.

  `platform` is [[ns.find/clj]] or [[ns.find/cljs]]; each includes `.cljc`, so a `.cljc` file is
  reported under both. `local/src` is skipped: the `:dev` profile puts it on the classpath precisely so a
  developer can shadow a project namespace locally."
  [platform]
  (for [dir  (remove #(str/starts-with? (relative-path %) "local/")
                     (classpath/classpath-directories))
        file (ns.find/find-sources-in-dir dir platform)
        ;; The classpath includes source directories we do not control.
        :let [decl (try
                     (ns.file/read-file-ns-decl file (:read-opts platform))
                     (catch Exception _ nil))]
        ;; Some classpath .clj files have no ns form, e.g. resources/data_readers.clj.
        :when decl]
    [(ns.parse/name-from-ns-decl decl) (relative-path file)]))

(defn- collisions
  "Namespaces `platform` can load from more than one file, as `{namespace [path ...]}`."
  [platform]
  (into (sorted-map)
        (keep (fn [[ns-symb paths]]
                (when (next paths)
                  [ns-symb (vec (sort paths))])))
        (u/group-by first second (declarations platform))))

(deftest ^:parallel no-duplicate-namespaces-test
  (doseq [[platform-name platform] {"clj" ns.find/clj, "cljs" ns.find/cljs}]
    (testing (str "no namespace is declared by two " platform-name " files\n"
                  "Rename one of them -- see this namespace's docstring for the convention used when an"
                  " EE test shadows its OSS counterpart.")
      (is (= {} (collisions platform))))))
