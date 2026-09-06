(ns metabase.driver.quack.remaining-features-test
  "Tests for the four 'remaining work' items:
  1. Views in describe-database* (table_type → :visibility-type)
  2. Foreign keys (describe-fks via duckdb_constraints())
  3. FSST vector handling (throws a clean error)
  4. :set-timezone feature flag (true + DuckDB honors SET TimeZone)"
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.driver :as driver]
   [metabase.driver.quack.client :as client]
   [metabase.driver.quack.codec :as c]
   [metabase.driver.quack.wire :as wire]
   [metabase.test.data.quack :as qtd])
  (:import [java.net Socket]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

(def details qtd/default-details)
(def fake-db {:lib/type :metadata/database :details details})

(defn- reachable? []
  (try (with-open [_ (Socket. ^String (:host details) ^int (:port details))] true)
       (catch Exception _ false)))

(defn- run-sql [sql]
  (let [{:keys [rows]} (client/execute-query details sql)]
    (reduce conj [] rows)))

(defn- catb [^bytes a ^bytes b]
  (let [out (byte-array (+ (alength a) (alength b)))]
    (System/arraycopy a 0 out 0 (alength a))
    (System/arraycopy b 0 out (alength a) (alength b))
    out))

(use-fixtures :once (fn [t] (when (reachable?) (t))))

;;; ===========================================================================
;;; 1. Views — describe-database* surfaces table_type
;;; ===========================================================================

(deftest views-get-visibility-type-test
  (testing "describe-database* marks views with :visibility-type :hidden"
    (let [tables (:tables (driver/describe-database* :quack fake-db))
          by-name (zipmap (map (juxt :schema :name) tables) tables)
          view   (get by-name ["samples" "fk_view"])]
      (is (some? view) "the fk_view is discovered")
      (is (= :hidden (:visibility-type view))
          "views get :visibility-type :hidden")
      (is (nil? (:visibility-type (get by-name ["samples" "ints"])))
          "base tables do NOT get a visibility-type"))))

;;; ===========================================================================
;;; 2. Foreign keys — describe-fks via duckdb_constraints()
;;; ===========================================================================

(deftest foreign-keys-discovered-test
  (testing "describe-fks returns the fk_child → fk_parent relationship"
    (let [fks (driver/describe-fks :quack fake-db)
          fk  (some #(and (= "fk_child" (:fk-table-name %))
                          (= "fk_parent" (:pk-table-name %))
                          %) fks)]
      (is (some? fk) "found the fk_child → fk_parent FK")
      (is (= "parent_id" (:fk-column-name fk)))
      (is (= "id" (:pk-column-name fk)))
      (is (= "samples" (:fk-table-schema fk)))
      (is (= "samples" (:pk-table-schema fk))))))

(deftest metadata-key-constraints-enabled-test
  (testing "the :metadata/key-constraints feature is enabled"
    (is (true? (driver/database-supports? :quack :metadata/key-constraints fake-db)))))

;;; ===========================================================================
;;; 3. FSST vector — throws a clean error, not a misparse
;;; ===========================================================================

(deftest fsst-vector-throws-clean-error-test
  (testing "an FSST vector raises a clear ex-info, not an NPE/IndexOOB/misparse"
    (let [lt        (c/object (c/field 100 (c/varuint 25)))  ; VARCHAR
          fsst-vec  (c/object (c/field 90 (c/varuint 1))     ; vector_type = FSST
                              (c/terminator))
          chunk     (c/object
                     (c/field 100 (c/varuint 1))
                     (catb (c/field 101 (c/varuint 1)) lt)
                     (catb (c/field 102 (c/varuint 1)) fsst-vec))
          wrapper   (catb (byte-array [(byte 1)]) (c/object (c/field 300 chunk)))
          body      (c/object
                     (c/field 1 (catb (c/varuint 1) lt))
                     (c/field 2 (catb (c/varuint 1) (c/string "x")))
                     (c/field 3 (c/bool false))
                     (c/field 4 (catb (c/varuint 1) wrapper)))
          buf       (catb (c/header c/type-prepare-response) body)]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"FSST"
           (wire/decode-response buf))))))

;;; ===========================================================================
;;; 4. :set-timezone feature + DuckDB honors SET TimeZone
;;; ===========================================================================

(deftest set-timezone-feature-enabled-test
  (testing "the :set-timezone feature is enabled"
    (is (true? (driver/database-supports? :quack :set-timezone fake-db)))))

(deftest ^:live duckdb-honors-set-timezone-test
  (when (reachable?)
    (testing "SET TimeZone works in a multi-statement query (persists within the connection)"
      (let [rows (run-sql "SET TimeZone='America/New_York'; SELECT current_setting('TimeZone') AS tz")]
        (is (= "America/New_York" (ffirst rows)))))))
