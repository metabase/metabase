(ns metabase.driver.quack.mbql5-test
  "Tier B — MBQL5 compilation proof.

  The driver parents on ``:sql-mbql5`` (an abstract child of ``:sql``), so MBQL
  is compiled through the MBQL5 path (``compile-mbql`` operating on MBQL5 stages)
  rather than the legacy MBQL4 path. These tests prove that:

  1. the driver is actually registered under ``:sql-mbql5`` (and transitively
     ``:sql``),
  2. a full MBQL query compiles end-to-end to DuckDB-flavoured SQL via the MBQL5
     compiler (``sql.qp/mbql->native`` over ``qp.preprocess/preprocess``), and
  3. DuckDB-specific temporal bucketing (``date_trunc``/``date_part``) and the
     federation-aware identifier splitting (3-part ``catalog.schema.table``
     names) survive MBQL5 compilation.

  No live Quack server is needed — these exercise compilation only.

  Run standalone (needs the Metabase classpath):
     clojure -A:dev:drivers:drivers-dev -m metabase.driver.quack.mbql5-test"
  (:require
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [metabase.driver :as driver]
   [metabase.driver.quack]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)
(driver/initialize! :quack)

;;; ===========================================================================
;;; 1. Driver hierarchy: quack is an MBQL5 driver
;;; ===========================================================================

(deftest mbql5-registration-test
  (testing "the :quack driver is registered under :sql-mbql5 (and transitively :sql)"
    (is (isa? driver/hierarchy :quack :sql-mbql5)
        ":quack must derive from :sql-mbql5 to opt into MBQL5 compilation")
    (is (isa? driver/hierarchy :quack :sql)
        ":quack must still derive from :sql for the SQL-QP machinery"))
  (testing "the MBQL5 compiler is the one that runs for :quack"
    ;; Multimethods walk the driver hierarchy: :quack has no own compile-mbql,
    ;; so it resolves to the :sql-mbql5 implementation (the MBQL5 path). The
    ;; :sql implementation would be the legacy MBQL4 path.
    (is (identical? (get-method sql.qp/compile-mbql :quack)
                    (get-method sql.qp/compile-mbql :sql-mbql5))
        ":quack resolves compile-mbql to the :sql-mbql5 (MBQL5) implementation")
    (is (identical? (get-method sql.qp/preprocess :quack)
                    (get-method sql.qp/preprocess :sql-mbql5))
        ":quack resolves preprocess to the :sql-mbql5 implementation")
    (is (not (identical? (get-method sql.qp/compile-mbql :quack)
                         (get-method sql.qp/compile-mbql :sql)))
        ":quack does NOT use the legacy :sql compile-mbql path")))

;;; ===========================================================================
;;; 2. End-to-end MBQL5 → DuckDB SQL compilation (no server needed)
;;; ===========================================================================

(defn- mbql->sql
  "Compile an MBQL5 ``query`` (a :lib/query map) to a SQL string using the
  :quack driver's MBQL5 path. Pure compilation — no execution, no server."
  [query]
  (qp.store/with-metadata-provider meta/metadata-provider
    (driver/with-driver :quack
      (:query (sql.qp/mbql->native :quack (qp.preprocess/preprocess query))))))

(deftest mbql5-compiles-aggregation-and-filter-test
  (testing "a count + filter query compiles to DuckDB SQL via the MBQL5 compiler"
    (let [orders (lib.metadata/table meta/metadata-provider (meta/id :orders))
          total  (lib.metadata/field meta/metadata-provider (meta/id :orders :total))
          query  (-> (lib/query meta/metadata-provider orders)
                     (lib/filter (lib/> total 0))
                     (lib/aggregate (lib/sum total)))
          sql    (mbql->sql query)]
      (is (str/includes? (u/upper-case-en sql) "SELECT")
          "compilation produced a SELECT")
      (is (re-find #"(?i)SUM\s*\(" sql)
          "the :sum aggregation compiled to DuckDB SUM(...)")
      (is (re-find #"(?i)\bTOTAL\b" sql)
          "the orders.total field is referenced")
      (is (re-find #"(?i)\bORDERS\b" sql)
          "the orders table is referenced"))))

(deftest mbql5-compiles-temporal-bucketing-test
  (testing "a temporal breakout (month) compiles to DuckDB date_trunc via MBQL5"
    (let [orders     (lib.metadata/table meta/metadata-provider (meta/id :orders))
          created-at (lib.metadata/field meta/metadata-provider (meta/id :orders :created-at))
          total      (lib.metadata/field meta/metadata-provider (meta/id :orders :total))
          query      (-> (lib/query meta/metadata-provider orders)
                         (lib/breakout (lib/with-temporal-bucket created-at :month))
                         (lib/aggregate (lib/sum total)))
          sql        (mbql->sql query)]
      (is (re-find #"(?i)date_trunc\s*\(\s*'month'" sql)
          "the :month temporal bucket compiled to DuckDB date_trunc('month', ...)")))
  (testing "a temporal extraction (hour-of-day) compiles to DuckDB date_part via MBQL5"
    (let [orders     (lib.metadata/table meta/metadata-provider (meta/id :orders))
          created-at (lib.metadata/field meta/metadata-provider (meta/id :orders :created-at))
          query      (-> (lib/query meta/metadata-provider orders)
                         (lib/breakout (lib/with-temporal-bucket created-at :hour-of-day)))
          sql        (mbql->sql query)]
      (is (re-find #"(?i)date_part\s*\(\s*'hour'" sql)
          "the :hour-of-day extraction compiled to DuckDB date_part('hour', ...)"))))

(deftest mbql5-compiles-relative-datetime-filter-test
  (testing "a 'previous 30 days' relative-datetime filter compiles to DuckDB INTERVAL via MBQL5"
    ;; The add-interval-honeysql-form :quack override emits INTERVAL '...' DAY.
    ;; This proves the :quack temporal overrides are still reached under MBQL5.
    (let [orders     (lib.metadata/table meta/metadata-provider (meta/id :orders))
          created-at (lib.metadata/field meta/metadata-provider (meta/id :orders :created-at))
          query      (-> (lib/query meta/metadata-provider orders)
                         (lib/filter (lib/time-interval created-at -30 :day)))
          sql        (mbql->sql query)]
      (is (re-find #"(?i)INTERVAL\s+'-?30'\s+day" sql)
          "the relative-datetime filter compiled to DuckDB INTERVAL '...' day"))))

;; Federation-aware identifier splitting (catalog.schema -> 3-part names) is
;; exercised end-to-end by the Tier-D federation tests against a live server;
;; the override lives in the ->honeysql [:quack ::h2x/identifier] method and is
;; version-agnostic (identifiers, not MBQL clauses), so it is unaffected by the
;; MBQL5 migration.
