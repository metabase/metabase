(ns metabase-enterprise.transforms-base.util
  "Shared utilities for transform execution (enterprise edition).

   Re-exports all functions from the OSS transforms-base.util and adds enterprise-specific
   implementations (e.g., is-temp-transform-table? with feature gating)."
  (:require
   [metabase.transforms-base.util :as transforms-base.util]
   [potemkin :as p]))

(set! *warn-on-reflection* true)

;; Re-export all base utility functions from OSS module
(p/import-vars
 [metabase.transforms-base.util
  ;; Constants
  transform-temp-table-prefix
  ;; Type predicates
  transform-type
  query-transform?
  native-query-transform?
  python-transform?
  transform-source-database
  ;; Normalization
  normalize-transform
  transform-source-type
  ;; Feature checks
  required-database-features
  ;; Table names & DDL
  qualified-table-name
  temp-table-name
  create-table-from-schema!
  drop-table!
  rename-tables!
  ;; Query compilation
  massage-sql-query
  supported-incremental-filter-type?
  preprocess-incremental-query
  validate-transform-query
  compile-source
  ;; Incremental query support
  next-checkpoint
  ;; Target table management
  target-table
  target-table-exists?
  activate-table-and-mark-computed!
  sync-target!
  deactivate-table!
  delete-target-table!
  delete-target-table-by-id!
  ;; Source table resolution
  batch-lookup-table-ids
  normalize-source-tables
  resolve-source-tables
  ;; Timestamps & filters
  ->instant
  utc-timestamp-string
  localize-run-timestamps
  ->date-field-filter-xf
  ->status-filter-xf
  ->tag-filter-xf
  ;; Misc
  is-temp-transform-table?
  db-routing-enabled?])
