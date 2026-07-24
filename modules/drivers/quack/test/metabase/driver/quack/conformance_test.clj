(ns ^:mb/driver-tests metabase.driver.quack.conformance-test
  "Tier E — opt the Quack driver into the shared Metabase SQL-driver conformance
  suites. Requiring the shared namespaces below registers their `deftest`s for
  the current driver (`DRIVERS=quack`); to actually RUN them, select those
  namespaces (or the driver-test partition), not just this one. This namespace
  itself only checks that the driver is registered correctly.

  Run the driver's full conformance suite:

     DRIVERS=quack clojure -X:dev:drivers:drivers-dev:test \\
       :namespace metabase.driver.quack.conformance-test

  Notes:
  * The shared namespaces are large and many assert driver-specific behavior
    (e.g. timezone functions) the Quack driver may not yet support — failures
    here are expected signal, not regressions, until the corresponding gaps are
    fixed (tracked in the top-level README and FEDERATION-FINDINGS.md).
  * Transforms across attached/federated catalogs have known gaps (see
    docs/FEDERATION-FINDINGS.md §6 and postgres-duckdb/docs §7b)."
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.driver :as driver]
   [metabase.driver.common-test]
   ;; SQL-driver conformance suites — required for effect; their
   ;; deftests run against the current driver (set via DRIVERS=quack).
   [metabase.driver.sql.parameters.substitute-test]
   [metabase.driver.sql.parameters.substitution-test]
   [metabase.driver.sql.query-processor-test]      ; MBQL→SQL compilation
   [metabase.driver.sql.util-test]
   ;; A focused slice of the master MBQL suite (the full
   ;; metabase.query_processor.* tree runs separately via the runner).
   [metabase.query_processor.expressions_test]
   [metabase.query_processor.filter-test]
   [metabase.query_processor.nested_queries_test]
   [metabase.test :as mt]))

(deftest e0-driver-loaded-test
  (mt/test-driver :quack
    (is (isa? driver/hierarchy :quack :sql)
        "the :quack driver is registered under :sql")
    (is (isa? driver/hierarchy :quack :sql-mbql5)
        "the :quack driver opts into MBQL5 compilation (parent :sql-mbql5)")))
