(ns metabase-enterprise.checker.format.hybrid-test
  "Tests for format detection and hybrid source."
  (:require
   [clojure.java.io :as io]
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.checker.format.hybrid :as hybrid]
   [metabase-enterprise.checker.source :as source]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Test Fixtures - Create temp directories with different formats
;;; ===========================================================================

(def ^:private ^:dynamic *temp-dir* nil)

(defn- create-temp-dir []
  (let [dir (io/file (System/getProperty "java.io.tmpdir")
                     (str "hybrid-test-" (System/currentTimeMillis)))]
    (.mkdirs dir)
    dir))

(defn- delete-recursively [^java.io.File f]
  (when (.isDirectory f)
    (doseq [child (.listFiles f)]
      (delete-recursively child)))
  (.delete f))

(defn- with-temp-dir-fixture [f]
  (let [dir (create-temp-dir)]
    (try
      (binding [*temp-dir* dir]
        (f))
      (finally
        (delete-recursively dir)))))

(use-fixtures :each with-temp-dir-fixture)

;;; ===========================================================================
;;; Format Detection Tests
;;; ===========================================================================

(deftest detect-concise-format-test
  (testing "Concise format is detected when databases/ contains .yaml files"
    (let [db-dir (io/file *temp-dir* "databases")]
      (.mkdirs db-dir)
      (spit (io/file db-dir "my_db.yaml") "name: my_db\nengine: sqlite\ntables: {}")
      (is (= :concise (hybrid/detect-database-format *temp-dir*))))))

(deftest detect-serdes-format-test
  (testing "Serdes format is detected when databases/ contains subdirectories"
    (let [db-dir (io/file *temp-dir* "databases" "my_db")]
      (.mkdirs db-dir)
      (spit (io/file db-dir "my_db.yaml") "name: my_db\nengine: sqlite")
      (is (= :serdes (hybrid/detect-database-format *temp-dir*))))))

(deftest detect-no-databases-test
  (testing "Nil is returned when no databases directory exists"
    (is (nil? (hybrid/detect-database-format *temp-dir*)))))

(deftest detect-format-with-collections-test
  (testing "Collections directory indicates serdes cards"
    (let [collections-dir (io/file *temp-dir* "collections")]
      (.mkdirs collections-dir)
      (is (= :serdes (:cards (hybrid/detect-format *temp-dir*)))))))

;;; ===========================================================================
;;; Hybrid Source Tests
;;; ===========================================================================

(deftest hybrid-source-resolves-from-concise-test
  (testing "Hybrid source resolves databases/tables/fields from concise format"
    (let [db-dir (io/file *temp-dir* "databases")]
      (.mkdirs db-dir)
      (spit (io/file db-dir "test_db.yaml")
            "name: test_db\nengine: sqlite\ntables:\n  users:\n    fields: [id, name]")
      ;; Create empty collections dir for serdes cards
      (.mkdirs (io/file *temp-dir* "collections"))
      (let [{:keys [source type]} (hybrid/make-source *temp-dir*)]
        (is (= :hybrid type))
        ;; Test resolution
        (is (= {:name "test_db" :engine "sqlite"}
               (source/resolve-database source "test_db")))
        (is (= {:name "users" :schema nil}
               (source/resolve-table source ["test_db" nil "users"])))
        (is (some? (source/resolve-field source ["test_db" nil "users" "id"])))))))

;;; ===========================================================================
;;; Make-source Auto-detection Tests
;;; ===========================================================================

(deftest make-source-concise-only-test
  (testing "Pure concise format (databases as files, cards in cards/)"
    (let [db-dir (io/file *temp-dir* "databases")
          cards-dir (io/file *temp-dir* "cards")]
      (.mkdirs db-dir)
      (.mkdirs cards-dir)
      (spit (io/file db-dir "my_db.yaml")
            "name: my_db\nengine: sqlite\ntables:\n  t1:\n    fields: [id]")
      (let [{:keys [type format]} (hybrid/make-source *temp-dir*)]
        (is (= :concise type))
        (is (= :concise (:databases format)))))))

(deftest make-source-hybrid-test
  (testing "Hybrid format (concise databases, serdes cards in collections/)"
    (let [db-dir (io/file *temp-dir* "databases")
          collections-dir (io/file *temp-dir* "collections")]
      (.mkdirs db-dir)
      (.mkdirs collections-dir)
      (spit (io/file db-dir "my_db.yaml")
            "name: my_db\nengine: sqlite\ntables:\n  t1:\n    fields: [id]")
      (let [{:keys [type format]} (hybrid/make-source *temp-dir*)]
        (is (= :hybrid type))
        (is (= :concise (:databases format)))
        (is (= :serdes (:cards format)))))))

(deftest make-source-serdes-test
  (testing "Pure serdes format (databases as directories)"
    (let [db-subdir (io/file *temp-dir* "databases" "my_db")]
      (.mkdirs db-subdir)
      (spit (io/file db-subdir "my_db.yaml") "name: my_db\nengine: sqlite")
      (let [{:keys [type format]} (hybrid/make-source *temp-dir*)]
        (is (= :serdes type))
        (is (= :serdes (:databases format)))))))

;;; ===========================================================================
;;; REPL Helpers
;;; ===========================================================================

(comment
  ;; Run all tests
  (clojure.test/run-tests 'metabase-enterprise.checker.format.hybrid-test))
