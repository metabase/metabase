(ns mage.fix-unused-requires-test
  (:require
   [babashka.fs :as fs]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [mage.fix-unused-requires :as fix]
   [mage.util :as u]))

(def ^:private test-dir (str u/project-root-directory "/mage/test/mage/fix_unused_requires_test_files"))

(defn- test-file [name]
  (str test-dir "/" name))

(defn- with-test-file
  "Creates a temp test file with the given content, runs f, then cleans up."
  [filename content f]
  (fs/create-dirs test-dir)
  (let [path (test-file filename)]
    (try
      (spit path content)
      (f path)
      (finally
        (fs/delete-if-exists path)
        (fs/delete-if-exists test-dir)))))

(deftest fix-single-unused-require-test
  (testing "Removes a single unused require"
    (with-test-file
      "single_unused.cljc"
      "(ns test.single-unused
  (:require
   [medley.core :as m]
   [clojure.string :as str]))

(defn foo []
  (str/upper-case \"hello\"))"
      (fn [path]
        (fix/fix-files {:arguments [path]})
        (let [result (slurp path)]
          (is (not (str/includes? result "medley.core"))
              "medley.core should be removed")
          (is (str/includes? result "clojure.string")
              "clojure.string should remain"))))))

(deftest fix-multiple-unused-requires-test
  (testing "Removes multiple unused requires"
    (with-test-file
      "multiple_unused.cljc"
      "(ns test.multiple-unused
  (:require
   [medley.core :as m]
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]))

(defn foo []
  (str/upper-case \"hello\"))"
      (fn [path]
        (fix/fix-files {:arguments [path]})
        (let [result (slurp path)]
          (is (not (str/includes? result "medley.core"))
              "medley.core should be removed")
          (is (not (str/includes? result "clojure.set"))
              "clojure.set should be removed")
          (is (not (str/includes? result "clojure.walk"))
              "clojure.walk should be removed")
          (is (str/includes? result "clojure.string")
              "clojure.string should remain"))))))

(deftest fix-all-requires-removed-test
  (testing "Removes entire :require form when all requires are unused"
    (with-test-file
      "all_unused.cljc"
      "(ns test.all-unused
  (:require
   [medley.core :as m]
   [clojure.set :as set]))

(defn foo []
  42)"
      (fn [path]
        (fix/fix-files {:arguments [path]})
        (let [result (slurp path)]
          (is (not (str/includes? result ":require"))
              ":require form should be removed entirely")
          (is (str/includes? result "(ns test.all-unused)")
              "ns form should remain"))))))

(deftest no-unused-requires-test
  (testing "Does nothing when there are no unused requires"
    (with-test-file
      "no_unused.cljc"
      "(ns test.no-unused
  (:require
   [clojure.string :as str]))

(defn foo []
  (str/upper-case \"hello\"))"
      (fn [path]
        (let [original (slurp path)]
          (fix/fix-files {:arguments [path]})
          (is (= original (slurp path))
              "File should not be modified"))))))

(deftest no-require-form-test
  (testing "Handles files without :require form"
    (with-test-file
      "no_require.cljc"
      "(ns test.no-require)

(defn foo []
  42)"
      (fn [path]
        (let [original (slurp path)]
          (fix/fix-files {:arguments [path]})
          (is (= original (slurp path))
              "File should not be modified"))))))

(deftest preserves-other-ns-forms-test
  (testing "Preserves :import and other ns forms"
    (with-test-file
      "with_import.cljc"
      "(ns test.with-import
  (:require
   [medley.core :as m]
   [clojure.string :as str])
  (:import
   [java.util UUID]))

(defn foo []
  (str/upper-case (str (UUID/randomUUID))))"
      (fn [path]
        (fix/fix-files {:arguments [path]})
        (let [result (slurp path)]
          (is (not (str/includes? result "medley.core"))
              "medley.core should be removed")
          (is (str/includes? result "clojure.string")
              "clojure.string should remain")
          (is (str/includes? result ":import")
              ":import form should remain")
          (is (str/includes? result "java.util UUID")
              "UUID import should remain"))))))

(def keep-me "Ensures this namespace is loaded by mage.core-test")
