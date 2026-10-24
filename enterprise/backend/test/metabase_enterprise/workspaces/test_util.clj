(ns metabase-enterprise.workspaces.test-util
  "Shared test helpers for the workspaces module."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
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

(defn with-workspace-locked-by-config
  "Flip the workspace-instance lock for the duration of `thunk`, restoring the
   prior value on exit. Reaches into the private atom via `#'` so the ws/core
   surface stays clean of test-only setters."
  [thunk]
  (let [a     @#'ws/locked-by-config?*
        prior @a]
    (reset! a true)
    (try (thunk)
         (finally (reset! a prior)))))
