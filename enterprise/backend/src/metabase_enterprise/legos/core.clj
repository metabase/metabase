(ns metabase-enterprise.legos.core
  (:require
   [metabase-enterprise.legos.actions]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.legos.actions
  execute!
  execute-plan!])
