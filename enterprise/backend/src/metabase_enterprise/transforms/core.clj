(ns metabase-enterprise.transforms.core
  "API namespace for the `metabase-enterprise.transform` module."
  (:require
   [metabase-enterprise.transforms.models.transform-run]
   [metabase-enterprise.transforms.settings]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.transforms.settings
  transform-timeout]
 [metabase-enterprise.transforms.models.transform-run
  timeout-run!])
