(ns metabase-enterprise.library-branching.app-db-fixture-test
  "Each test namespace of library branching that uses the app DB, directly or through another namespace of the
  module's test directory, initializes it in a `:once` fixture, and runs its tests with the premium features of a
  production instance in another. Without the first fixture, a test that sends a statement before any `mt` helper
  initializes the app DB passes only when an earlier test in the same JVM initialized it. Without the second, the
  tests see an instance with no Library content rule, which a production instance always has."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.tools.namespace.file :as ns.file]
   [clojure.tools.namespace.find :as ns.find]
   [clojure.tools.namespace.parse :as ns.parse]
   [metabase-enterprise.library-branching.features-test-util :as features.tu]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.initialize :as initialize])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db) features.tu/with-features)

(def ^:private app-db-namespaces
  "A namespace that requires one of these namespaces uses the app DB."
  '#{metabase-enterprise.library-branching.db
     metabase.app-db.core
     metabase.collections.test-utils
     metabase.test
     toucan2.core})

(def ^:private app-db-steps
  "The initialization steps that initialize the app DB."
  #{:db :notifications :row-lock :test-users :test-users-personal-collections :web-server})

(defn- module-namespaces
  "For each namespace in the directory of this file: `:ns` its symbol, `:test?` true iff its file is a `_test.clj` file,
  and `:deps` the symbols of the namespaces that its `ns` form requires."
  []
  (let [dir (.getParentFile (io/file (io/resource "metabase_enterprise/library_branching/app_db_fixture_test.clj")))]
    (for [^File f (ns.find/find-sources-in-dir dir)
          :let    [decl (ns.file/read-file-ns-decl f)]]
      {:ns    (ns.parse/name-from-ns-decl decl)
       :test? (str/ends-with? (.getName f) "_test.clj")
       :deps  (ns.parse/deps-from-ns-decl decl)})))

(defn- uses-app-db?
  "True iff `ns-sym` requires an app-DB namespace, directly or through a chain of namespaces in `deps`. `deps` maps the
  symbol of a namespace to the symbols of the namespaces that it requires."
  [deps ns-sym]
  ;; `deps` holds only the namespaces of the test directory, so the walk follows no source namespace: a pure test can
  ;; require one that uses the app DB, for a function that sends no statement.
  (loop [todo [ns-sym] seen #{}]
    (if-let [[n & more] (seq todo)]
      (cond
        (app-db-namespaces n) true
        (seen n)              (recur more seen)
        :else                 (recur (into (vec more) (get deps n)) (conj seen n)))
      false)))

(defn- run-once-fixtures
  "`{:steps s :features fs}`: `s`, the initialization steps that the `:once` fixtures of `ns-sym` ask for, and `fs`,
  the premium features of [[features.tu/features]] that a body inside those fixtures sees. The fixtures run around a
  body that sends no statement, from an instance with no premium feature."
  [ns-sym]
  (let [steps (atom #{})
        seen  (atom nil)]
    (mt/with-premium-features #{}
      (mt/with-dynamic-fn-redefs [initialize/initialize-if-needed! (fn [& more]
                                                                     (swap! steps into (map keyword more)))]
        ((join-fixtures (:clojure.test/once-fixtures (meta (the-ns ns-sym))))
         (fn [] (reset! seen (into #{} (filter premium-features/has-feature?) features.tu/features))))))
    {:steps @steps :features @seen}))

(defn- app-db-test-namespaces
  "The symbols of the test namespaces of the module that use the app DB, each loaded."
  []
  (let [module (module-namespaces)
        deps   (into {} (map (juxt :ns :deps)) module)
        nses   (sort (map :ns (filter :test? module)))]
    (apply require nses)
    (filter (partial uses-app-db? deps) nses)))

(deftest app-db-namespaces-initialize-the-app-db-test
  (let [nses (app-db-test-namespaces)]
    (testing "the module has test namespaces that use the app DB"
      (is (seq nses)))
    (doseq [ns-sym nses]
      (testing ns-sym
        (is (some app-db-steps (:steps (run-once-fixtures ns-sym))))))))

(deftest app-db-namespaces-run-with-the-features-test
  (testing "the features fixture gives a body the features"
    (is (= features.tu/features
           (mt/with-premium-features #{}
             (features.tu/with-features #(into #{} (filter premium-features/has-feature?) features.tu/features))))))
  (doseq [ns-sym (app-db-test-namespaces)]
    (testing ns-sym
      (is (= features.tu/features (:features (run-once-fixtures ns-sym)))))))

(deftest ^:parallel uses-app-db-follows-helpers-test
  (let [deps '{lib.helper-test #{toucan2.core}
               lib.user-test   #{lib.helper-test lib.source}
               lib.pure-test   #{lib.source}}]
    (testing "a namespace that requires an app-DB namespace"
      (is (uses-app-db? deps 'lib.helper-test)))
    (testing "a namespace that requires a helper that uses the app DB"
      (is (uses-app-db? deps 'lib.user-test)))
    (testing "a namespace with no entry in deps is not followed, whatever it requires"
      (is (not (uses-app-db? deps 'lib.pure-test))))))
