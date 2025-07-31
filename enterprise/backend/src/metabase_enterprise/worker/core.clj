(ns metabase-enterprise.worker.core
  (:require
   [metabase-enterprise.worker.server]
   [potemkin :as p]))

(p/import-vars
 [metabase-enterprise.worker.server
  start!
  stop!])
