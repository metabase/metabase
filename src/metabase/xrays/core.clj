(ns metabase.xrays.core
  "API namespace for X-Ray related stuff."
  (:require
   [metabase.xrays.automagic-dashboards.populate]
   [metabase.xrays.related]
   [potemkin :as p]))

(comment
  metabase.xrays.automagic-dashboards.populate/keep-me
  metabase.xrays.related/keep-me)

(p/import-vars
 [metabase.xrays.automagic-dashboards.populate
  get-or-create-container-collection]
 [metabase.xrays.related
  related])
