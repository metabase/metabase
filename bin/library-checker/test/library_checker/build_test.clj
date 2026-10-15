(ns library-checker.build-test
  "Tests of the checker artifact: the `build` task makes an uberjar that runs the checker in babashka with no Metabase
  source tree, and the jar gives the result of the checker from source on each golden variant."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.golden :as golden])
  (:import
   (java.util.zip ZipFile)))

(def ^:private config "bin/library-checker/bb.edn")

(defn- bb-executable
  []
  (-> (java.lang.ProcessHandle/current) .info .command (.orElse "bb")))

(defn- bb!
  "`{:exit e :lines [line ...]}` of babashka with `args`, run in directory `dir`; the lines are those of stdout."
  [dir & args]
  (let [{:keys [exit out err]} (apply p/shell {:dir (str dir) :in "" :out :string :err :string :continue true}
                                      (bb-executable) args)]
    {:exit exit :lines (str/split-lines out) :err err}))

(def ^:dynamic ^:private *jar*
  "The jar that the `build` task made for this test namespace."
  nil)

(defn- temp-dir
  []
  (fs/file (fs/create-temp-dir {:prefix "library-checker-test-"})))

(use-fixtures :once
  (fn [run-tests]
    (let [dir (temp-dir)
          jar (fs/file dir "library-checker.jar")]
      (try
        (let [{:keys [exit err]} (bb! "." "--config" config "build" "--out" (str jar))]
          (is (= 0 exit) (str "the build task exits 0\n" err)))
        (binding [*jar* jar]
          (run-tests))
        (finally (fs/delete-tree dir))))))

(defn- entries
  [jar]
  (with-open [z (ZipFile. (str jar))]
    (set (map #(.getName ^java.util.zip.ZipEntry %) (enumeration-seq (.entries z))))))

(def ^:private module-dir "metabase_enterprise/library_branching/")

(deftest jar-holds-the-checker-closure-test
  (is (fs/exists? *jar*) "the build task writes the jar")
  (when (fs/exists? *jar*)
    (let [es     (entries *jar*)
          module (set (filter #(str/starts-with? % module-dir) es))]
      (testing "the entry point, the reader, the engine, the registry, and the resource of the collation"
        (is (every? module (map #(str module-dir %)
                                ["check.clj" "registry.cljc" "format/tree.clj" "format/claims.clj"
                                 "engine/validate.clj" "utf8mb4_unicode_ci.txt"]))))
      (testing "malli, the one library of the checker outside babashka"
        (is (contains? es "malli/core.cljc")))
      (testing "no server namespace: not the writer, the instance, the store, the API or the tasks"
        (is (= #{} (set (filter (set (map #(str module-dir %)
                                          ["format/writer.clj" "instance.clj" "store.clj" "api.clj" "tasks.clj"]))
                                module)))))
      (testing "no test namespace and no other Metabase namespace"
        (is (= #{} (set (filter #(re-find #"_test\.cljc?$|^metabase/|golden\.clj$" %) es))))))))

(defn- written-variants!
  "Writes each golden variant to a directory of its own under `dir`; returns `{name directory}`."
  [dir]
  (into (sorted-map)
        (for [[n v] (golden/variants)
              :let  [d (fs/file dir n)]]
          (do (golden/write-variant! d v)
              [n d]))))

(deftest jar-runs-with-no-source-tree-test
  (let [dir (temp-dir)]
    (try
      (let [variants (written-variants! (fs/file dir "variants"))
            cwd      (doto (fs/file dir "cwd") fs/create-dirs)]
        (testing "a green checkout exits 0"
          (is (= {:exit 0 :lines ["green"]} (dissoc (bb! cwd (str *jar*) (str (variants "green"))) :err))))
        (testing "a key clash exits 1 and names the key: the jar has the collation table"
          (let [{:keys [exit lines]} (bb! cwd (str *jar*) (str (variants "unique-key")))]
            (is (= 1 exit))
            (is (str/includes? (first lines) "\"Base filter\""))))
        (testing "no arguments: the usage line, exit 2"
          (is (= {:exit 2 :lines ["Usage: <checkout> [--manifest <file>]"]} (dissoc (bb! cwd (str *jar*)) :err))))
        (testing "each golden variant: the jar prints the lines and gives the exit code of the checker from source"
          (doseq [[n d] variants]
            (testing n
              (is (= (golden/run-result d) (dissoc (bb! cwd (str *jar*) (str d)) :err)))))))
      (finally (fs/delete-tree dir)))))
