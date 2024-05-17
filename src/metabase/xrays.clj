(ns metabase.xrays
  "API namespace for X-Ray related stuff."
  (:require
   [metabase.xrays.automagic-dashboards.comparison]
   [metabase.xrays.automagic-dashboards.core]
   [metabase.xrays.automagic-dashboards.dashboard-templates]
   [metabase.xrays.automagic-dashboards.populate]
   [metabase.xrays.transforms.dashboard]
   [metabase.xrays.transforms.materialize]
   [potemkin :as p]))

(comment
  metabase.xrays.automagic-dashboards.comparison/keep-me
  metabase.xrays.automagic-dashboards.core/keep-me
  metabase.xrays.automagic-dashboards.dashboard-templates/keep-me
  metabase.xrays.automagic-dashboards.populate/keep-me
  metabase.xrays.transforms.dashboard/keep-me
  metabase.xrays.transforms.materialize/keep-me)

(p/import-vars
  [metabase.xrays.automagic-dashboards.comparison
   comparison-dashboard]
  [metabase.xrays.automagic-dashboards.core
   automagic-analysis
   candidate-tables]
  [metabase.xrays.automagic-dashboards.dashboard-templates
   get-dashboard-template
   get-dashboard-templates]
  [metabase.xrays.automagic-dashboards.populate
   create-collection!
   get-or-create-root-container-collection]
  [metabase.xrays.transforms.dashboard
   dashboard]
  [metabase.xrays.transforms.materialize
   get-collection])
