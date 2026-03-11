(ns metabase.transforms.core
  "API namespace for the `metabase.transforms` module."
  (:require
   [metabase.models.transforms.transform]
   [metabase.models.transforms.transform-job]
   [metabase.models.transforms.transform-run]
   [metabase.models.transforms.transform-run-cancelation]
   [metabase.models.transforms.transform-tag]
   [metabase.transforms.settings]
   [metabase.transforms.util]
   [potemkin :as p]))

(p/import-vars
 [metabase.transforms.settings
  transform-timeout]
 [metabase.transforms.util
  add-source-readable
  native-query-transform?
  python-transform?
  query-transform?
  transform-source-database
  transform-source-type
  transform-type
  is-temp-transform-table?]
 [metabase.models.transforms.transform-run
  timeout-run!
  paged-runs
  running-run-for-transform-id]
 [metabase.models.transforms.transform-run-cancelation
  mark-cancel-started-run!]
 [metabase.models.transforms.transform
  update-transform-tags!]
 [metabase.models.transforms.transform-job
  update-job-tags!]
 [metabase.models.transforms.transform-tag
  tag-name-exists?
  tag-name-exists-excluding?])
