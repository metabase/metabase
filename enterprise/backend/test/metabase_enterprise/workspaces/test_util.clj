(ns metabase-enterprise.workspaces.test-util
  "Shared test helpers for the workspaces module."
  (:require
   [metabase.driver :as driver]))

(defn driver-loadable?
  "True iff `engine`'s driver class is on the test classpath. Wraps
   `driver/the-initialized-driver` so tests that walk all workspace-capable
   drivers can `(when (driver-loadable? :sqlserver) ...)` to silently skip
   rows for drivers absent from the current `DRIVERS` env. Used by per-driver
   corpus / remapping tests where most drivers are off-classpath on the
   default H2-only run."
  [engine]
  (try (driver/the-initialized-driver engine) true
       (catch Throwable _ false)))
