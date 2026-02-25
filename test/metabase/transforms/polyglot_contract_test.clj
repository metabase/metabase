(ns metabase.transforms.polyglot-contract-test
  "Contract equivalence tests: all runner-based languages must implement the
  transforms.interface multimethods identically given the same transform shape.
  Also covers transforms.util pure functions for all language types."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase-enterprise.transforms-clojure.impl]
   [metabase-enterprise.transforms-javascript.impl]
   [metabase-enterprise.transforms-julia.impl]
   [metabase-enterprise.transforms-python.impl]
   [metabase-enterprise.transforms-r.impl]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.util :as transforms.util]))

(set! *warn-on-reflection* true)

(def ^:private runner-languages
  "All registered runner-based language dispatch values."
  [:python :javascript :clojure :r :julia])

;;; ------------------------------------------------ Generators ----------------------------------------------------

(def ^:private gen-source-table-int
  "Generator for integer table IDs."
  (gen/fmap inc gen/nat))

(def ^:private gen-source-table-ref
  "Generator for source table reference maps."
  (gen/let [db-id (gen/fmap inc gen/nat)
            schema (gen/one-of [(gen/return nil) gen/string-alphanumeric])
            table gen/string-alphanumeric
            table-id (gen/one-of [(gen/return nil) (gen/fmap inc gen/nat)])]
    (cond-> {:database_id db-id :schema schema :table table}
      table-id (assoc :table_id table-id))))

(def ^:private gen-source-table-value
  "Generator for either int or ref source table values."
  (gen/one-of [gen-source-table-int gen-source-table-ref]))

(def ^:private gen-source-tables
  "Generator for source-tables maps (string keys -> source table values)."
  (gen/let [entries (gen/vector
                     (gen/tuple gen/string-alphanumeric gen-source-table-value)
                     0 5)]
    (into {} entries)))

(defn- gen-runner-transform
  "Generator for a runner transform with a specific language type."
  [lang]
  (gen/let [source-db (gen/fmap inc gen/nat)
            target-db (gen/fmap inc gen/nat)
            source-tables gen-source-tables
            body gen/string-alphanumeric]
    {:source {:type (name lang)
              :source-database source-db
              :source-tables source-tables
              :body body}
     :target {:database target-db
              :type "table"
              :name "output"
              :schema "public"}}))

;;; --------------------------------- Contract: target-db-id is language-independent --------------------------------

(deftest target-db-id-contract-test
  (testing "all runner languages extract target-db-id identically"
    (let [transform {:source {:type "python" :source-database 1 :source-tables {} :body "x"}
                     :target {:database 99 :type "table" :name "out" :schema "s"}}]
      (doseq [lang runner-languages]
        (testing (str "language: " lang)
          (is (= 99 (transforms.i/target-db-id
                     (assoc-in transform [:source :type] (name lang))))))))))

(defspec target-db-id-equivalence-prop 50
  (prop/for-all [transform (gen-runner-transform :python)]
    (let [expected (transforms.i/target-db-id transform)]
      (every? (fn [lang]
                (= expected
                   (transforms.i/target-db-id
                    (assoc-in transform [:source :type] (name lang)))))
              runner-languages))))

;;; --------------------------------- Contract: source-db-id is language-independent --------------------------------

(deftest source-db-id-contract-test
  (testing "all runner languages extract source-db-id identically"
    (let [transform {:source {:type "python" :source-database 42 :source-tables {} :body "x"}
                     :target {:database 1 :type "table" :name "out" :schema "s"}}]
      (doseq [lang runner-languages]
        (testing (str "language: " lang)
          (is (= 42 (transforms.i/source-db-id
                     (assoc-in transform [:source :type] (name lang))))))))))

(defspec source-db-id-equivalence-prop 50
  (prop/for-all [transform (gen-runner-transform :python)]
    (let [expected (transforms.i/source-db-id transform)]
      (every? (fn [lang]
                (= expected
                   (transforms.i/source-db-id
                    (assoc-in transform [:source :type] (name lang)))))
              runner-languages))))

;;; --------------------------------- Contract: table-dependencies is language-independent --------------------------

(deftest table-dependencies-contract-test
  (testing "all runner languages compute table-dependencies identically"
    (let [transform {:source {:type "python"
                              :source-database 1
                              :source-tables {"a" 100
                                              "b" {:database_id 1 :schema "s" :table "t"}
                                              "c" {:database_id 2 :schema nil :table "u" :table_id 200}}
                              :body "x"}
                     :target {:database 1 :type "table" :name "out" :schema "s"}}
          expected (transforms.i/table-dependencies transform)]
      (doseq [lang runner-languages]
        (testing (str "language: " lang)
          (is (= expected
                 (transforms.i/table-dependencies
                  (assoc-in transform [:source :type] (name lang))))))))))

(defspec table-dependencies-equivalence-prop 50
  (prop/for-all [transform (gen-runner-transform :python)]
    (let [expected (transforms.i/table-dependencies transform)]
      (every? (fn [lang]
                (= expected
                   (transforms.i/table-dependencies
                    (assoc-in transform [:source :type] (name lang)))))
              runner-languages))))

;;; --------------------------------- transforms.util pure functions ------------------------------------------------

(deftest transform-type-test
  (doseq [lang runner-languages]
    (testing (str "transform-type returns " lang " for runner transform")
      (is (= lang (transforms.util/transform-type
                   {:source {:type (name lang)}}))))))

(deftest runner-transform?-test
  (doseq [lang runner-languages]
    (testing (str lang " is a runner transform")
      (is (true? (transforms.util/runner-transform?
                  {:source {:type (name lang)}})))))
  (testing "query is not a runner transform"
    (is (false? (transforms.util/runner-transform?
                 {:source {:type "query"}})))))

(deftest transform-source-database-test
  (testing "runner transforms get source-database from :source"
    (doseq [lang runner-languages]
      (testing (str "language: " lang)
        (is (= 42 (transforms.util/transform-source-database
                   {:source {:type (name lang) :source-database 42}}))))))
  (testing "query transforms get database from :query"
    (is (= 99 (transforms.util/transform-source-database
               {:source {:type "query" :query {:database 99}}})))))

(deftest transform-source-type-test
  (testing "runner types return themselves"
    (doseq [lang runner-languages]
      (testing (str "language: " lang)
        (is (= lang (transforms.util/transform-source-type
                     {:type (name lang)}))))))
  (testing "unknown type throws"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Unknown transform source type"
                          (transforms.util/transform-source-type {:type "cobol"})))))

(deftest required-database-features-test
  (testing "all runner transforms require :transforms/python"
    (doseq [lang runner-languages]
      (testing (str "language: " lang)
        (is (= [:transforms/python]
               (transforms.util/required-database-features
                {:source {:type (name lang)}}))))))
  (testing "query transforms require :transforms/table"
    (is (= [:transforms/table]
           (transforms.util/required-database-features
            {:source {:type "query"}})))))
