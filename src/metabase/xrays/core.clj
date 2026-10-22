(ns metabase.xrays.core
  "API namespace for X-Ray related stuff."
  (:require
   [metabase.xrays.api.automagic-dashboards]
   [metabase.xrays.automagic-dashboards.populate]
   [metabase.xrays.automagic-dashboards.util]
   [metabase.xrays.related]
   [potemkin :as p]))

(comment
  metabase.xrays.api.automagic-dashboards/keep-me
  metabase.xrays.automagic-dashboards.populate/keep-me
  metabase.xrays.automagic-dashboards.util/keep-me
  metabase.xrays.related/keep-me)

(p/import-vars
 [metabase.xrays.api.automagic-dashboards
  adhoc-query-read-check]
 [metabase.xrays.automagic-dashboards.populate
  get-or-create-container-collection]
 [metabase.xrays.automagic-dashboards.util
  encode-base64-json]
 [metabase.xrays.related
  related])
