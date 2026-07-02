(ns metabase.jekyll
  "Phase 0 spike: Jekyll-mode boot cuts, gated on `MB_JEKYLL_CUT=B`.

  Read from the environment (not the app-db-backed `instance-workspace` setting)
  because the scheduler cut fires at `metabase.core.core/init!*` before app-db
  settings are reliably readable. ponytail: throwaway spike flag; fold into the
  real `workspace-mode?` predicate once the cut is promoted past spike."
  (:require
   [clojure.string :as str]
   [environ.core :as env]))

(defn jekyll?
  "True when Jekyll mode is active (`MB_JEKYLL_CUT=B`).

  Option B (skip scheduler init) is the resolved Phase 0 cut. Option A
  (RAMJobStore) was rejected: `quartz.properties` hardcodes JDBC-store-only keys
  that RAMJobStore reflectively refuses, so it cannot boot config-only."
  []
  (= "b" (some-> (env/env :mb-jekyll-cut) str/lower-case)))
