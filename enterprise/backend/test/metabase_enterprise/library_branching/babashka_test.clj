(ns metabase-enterprise.library-branching.babashka-test
  "The checker loads in babashka. Babashka has a fixed set of Java classes and loads Clojure namespaces from source,
  so the namespaces of the checker may require only other such namespaces, libraries that babashka has or loads, and
  classes that babashka has. A new require or import must first load in babashka; then it goes in the lists below."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.parse :as ns.parse])
  (:import
   (java.io PushbackReader)))

(set! *warn-on-reflection* true)

(def ^:private entry-point 'metabase-enterprise.library-branching.check)

(def ^:private module-prefix "metabase-enterprise.library-branching.")

(def ^:private allowed-libraries
  "Namespaces outside the module that babashka has, or loads from the classpath of the checker (malli)."
  '#{clj-yaml.core clojure.java.io clojure.set clojure.string malli.core malli.error malli.registry})

(def ^:private allowed-classes
  "Classes that babashka 1.12.212 has, each checked with `bb -e \"(import 'the.Class)\"`."
  '#{java.io.File
     java.nio.ByteBuffer
     java.nio.charset.CharacterCodingException
     java.nio.charset.CodingErrorAction
     java.nio.charset.StandardCharsets
     java.nio.file.Files
     java.nio.file.Path
     java.text.Normalizer
     java.text.Normalizer$Form
     java.util.Locale})

(defn- source
  [ns-sym]
  (let [base (-> (name ns-sym) (str/replace "-" "_") (str/replace "." "/"))]
    (or (io/resource (str base ".cljc"))
        (io/resource (str base ".clj"))
        (throw (ex-info (str "No source for " ns-sym) {:ns ns-sym})))))

(defn- ns-decl
  "The ns form of `ns-sym` as babashka reads it: the `:bb` branch of each reader conditional."
  [ns-sym]
  (with-open [r (PushbackReader. (io/reader (source ns-sym)))]
    (ns.parse/read-ns-decl r {:read-cond :allow :features #{:bb}})))

(defn- imports
  [decl]
  (set (for [clause decl
             :when  (and (seq? clause) (= :import (first clause)))
             spec   (rest clause)
             class  (if (symbol? spec)
                      [spec]
                      (map #(symbol (str (first spec) "." %)) (rest spec)))]
         class)))

(defn- closure
  "`{ns {:requires #{ns} :imports #{class}}}` of the module namespaces that `start` loads."
  [start]
  (loop [todo [start], seen {}]
    (if-let [[n & more] (seq todo)]
      (if (contains? seen n)
        (recur more seen)
        (let [decl     (ns-decl n)
              requires (ns.parse/deps-from-ns-decl decl)]
          (recur (concat more (filter #(str/starts-with? (name %) module-prefix) requires))
                 (assoc seen n {:requires requires :imports (imports decl)}))))
      seen)))

(deftest checker-loads-in-babashka-test
  (let [nss (closure entry-point)]
    (testing "the checker loads the reader, the codecs, the manifest reader and the engine"
      (is (every? (set (keys nss))
                  '[metabase-enterprise.library-branching.format.tree
                    metabase-enterprise.library-branching.format.kinds
                    metabase-enterprise.library-branching.format.manifest
                    metabase-enterprise.library-branching.engine.validate
                    metabase-enterprise.library-branching.engine.semantic
                    metabase-enterprise.library-branching.registry])))
    (testing "the checker does not load the writer, which needs SnakeYAML classes that babashka does not have"
      (is (not (contains? nss 'metabase-enterprise.library-branching.format.writer))))
    (doseq [[n {:keys [requires imports]}] nss]
      (testing (str n " requires only module namespaces and libraries that babashka can load")
        (is (= #{} (set (remove #(or (str/starts-with? (name %) module-prefix) (allowed-libraries %)) requires)))))
      (testing (str n " imports only classes that babashka has")
        (is (= #{} (set (remove allowed-classes imports))))))))
