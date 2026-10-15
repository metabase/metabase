(ns metabase-enterprise.library-branching.app-db-fixture-test
  "Each test namespace of library branching that uses the app DB initializes it in a `:once` fixture. Without the
  fixture, a test that sends a statement before any `mt` helper initializes the app DB passes only when an earlier test
  in the same JVM initialized it."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.initialize :as initialize])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private app-db-namespaces
  "A test namespace that refers to one of these namespaces uses the app DB."
  '#{metabase.app-db.core
     metabase.collections.test-utils
     metabase.test
     toucan2.core})

(def ^:private app-db-steps
  "The initialization steps that initialize the app DB."
  #{:db :notifications :row-lock :test-users :test-users-personal-collections :web-server})

(defn- module-test-namespaces
  "The symbols of the test namespaces of the module: the `_test.clj` files in the directory of this file."
  []
  (let [dir (.getParentFile (io/file (io/resource "metabase_enterprise/library_branching/app_db_fixture_test.clj")))]
    (sort
     (for [^File f (file-seq dir)
           :let    [path (str (.relativize (.toPath dir) (.toPath f)))]
           :when   (str/ends-with? path "_test.clj")]
       (symbol (str "metabase-enterprise.library-branching."
                    (-> path
                        (str/replace #"\.clj$" "")
                        (str/replace "/" ".")
                        (str/replace "_" "-"))))))))

(defn- uses-app-db? [ns-sym]
  (let [n (the-ns ns-sym)]
    (boolean (some (comp app-db-namespaces ns-name)
                   (concat (vals (ns-aliases n))
                           (keep (comp :ns meta) (filter var? (vals (ns-refers n)))))))))

(defn- once-fixture-steps
  "The initialization steps that the `:once` fixtures of `ns-sym` ask for, around a body that does nothing."
  [ns-sym]
  (let [steps (atom #{})]
    (mt/with-dynamic-fn-redefs [initialize/initialize-if-needed! (fn [& more]
                                                                   (swap! steps into (map keyword more)))]
      ((join-fixtures (:clojure.test/once-fixtures (meta (the-ns ns-sym)))) (fn [])))
    @steps))

(deftest app-db-namespaces-initialize-the-app-db-test
  (let [nses (module-test-namespaces)]
    (apply require nses)
    (testing "the module has test namespaces that use the app DB"
      (is (some uses-app-db? nses)))
    (doseq [ns-sym nses
            :when  (uses-app-db? ns-sym)]
      (testing ns-sym
        (is (some app-db-steps (once-fixture-steps ns-sym)))))))
