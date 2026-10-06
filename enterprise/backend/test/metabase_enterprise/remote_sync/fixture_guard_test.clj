(ns metabase-enterprise.remote-sync.fixture-guard-test
  "Every test namespace of the remote-sync module that uses the app DB has the shared fixture as its outermost `:each`
  fixture, and no `^:parallel` test."
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]))

(def ^:private exemptions
  "The module test namespaces that do not use the shared fixture, each with its reason."
  '{metabase-enterprise.remote-sync.fixture-guard-test          "no app DB: reads namespace metadata"
    metabase-enterprise.remote-sync.merge-test                  "no app DB"
    metabase-enterprise.remote-sync.source.wrapping-source-test "no app DB"
    metabase-enterprise.remote-sync.source.git-progress-test    "no app DB"
    metabase-enterprise.remote-sync.core-test                   "its own clean-object fixture; binds no remote-sync setting"
    metabase-enterprise.remote-sync.guards-test                 "its own clean-task-table fixture; binds no remote-sync setting"
    metabase-enterprise.remote-sync.task.table-cleanup-test     "its own task-table cleanup; binds no remote-sync setting"
    metabase-enterprise.remote-sync.test-helpers-test           "tests the shared fixture"
    metabase-enterprise.remote-sync.test-isolation-test         "runs test vars of other namespaces with their fixtures"
    metabase-enterprise.remote-sync.cost-test-util-test         "tests the cost helpers"})

(defn- module-test-namespaces
  "The namespace of each `*_test.clj` file in the directory of this file and its subdirectories."
  []
  ;; from the files, not from `all-ns`: when this test runs alone, `all-ns` holds only the namespaces that are loaded
  (let [this-file  "metabase_enterprise/remote_sync/fixture_guard_test.clj"
        module-dir (.getParentFile (io/file (io/resource this-file)))
        root       (-> module-dir .getParentFile .getParentFile)]
    (sort
     (for [^java.io.File f (file-seq module-dir)
           :let  [path (str (.relativize (.toPath root) (.toPath f)))]
           :when (str/ends-with? path "_test.clj")]
       (-> path
           (str/replace #"\.clj$" "")
           (str/replace java.io.File/separator ".")
           (str/replace "_" "-")
           symbol)))))

(defn- shared-fixture-first?
  "Whether the first `:each` fixture of `ns-sym` carries the shared-fixture marker."
  [ns-sym]
  (-> (find-ns ns-sym) meta :clojure.test/each-fixtures first meta ::rs.test/shared-fixture true?))

(defn- parallel-vars
  "The vars of `ns-sym` with `:parallel` metadata."
  [ns-sym]
  (sort (for [[_ v] (ns-interns ns-sym)
              :when (:parallel (meta v))]
          (symbol v))))

(deftest module-namespaces-use-the-shared-fixture-test
  (let [namespaces (module-test-namespaces)
        checked    (remove exemptions namespaces)]
    (testing "the file lookup finds the module test namespaces"
      (is (some #{'metabase-enterprise.remote-sync.source.git-test} namespaces)))
    (testing "every exemption names a module test namespace"
      (is (= #{} (set/difference (set (keys exemptions)) (set namespaces)))))
    (apply require checked)
    (testing "the first :each fixture of each namespace is the shared fixture"
      (is (= [] (remove shared-fixture-first? checked))))
    (testing "no namespace with the shared fixture has a ^:parallel test"
      (is (= [] (mapcat parallel-vars checked))))))
