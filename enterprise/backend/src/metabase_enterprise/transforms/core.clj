(ns metabase-enterprise.transforms.core
  "API namespace for the `metabase-enterprise.transform` module."
  (:require
   [metabase-enterprise.transforms.execute]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.transforms.execute
  execute-transform!])
