(ns metabase.interestingness.core
  "Public entry point for the interestingness engine.

   This namespace is a thin facade — it only re-exports the user-facing
   `compute interestingness for X` functions from their role-specific
   implementation namespaces. If you need scorers, weight profiles, or the
   composition machinery, depend on the specific namespace directly:

   - `metabase.interestingness.chart`     — chart-level scoring + stats helpers
   - `metabase.interestingness.dimension` — dimension scorers + canonical weights
   - `metabase.interestingness.measure`   — measure weight profile
   - `metabase.interestingness.impl`      — shared composition machinery (internal)"
  (:require
   [metabase.interestingness.chart]
   [metabase.interestingness.dimension]
   [metabase.interestingness.measure]
   [potemkin :as p]))

(p/import-vars
 [metabase.interestingness.chart
  chart-interestingness]
 [metabase.interestingness.dimension
  dimension-interestingness]
 [metabase.interestingness.measure
  measure-interestingness])
