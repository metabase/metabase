(ns metabase.batch-processing.core
  (:require
   [metabase.batch-processing.impl]
   [potemkin :as p]))

(comment metabase.batch-processing.impl/keep-me)

(p/import-vars
 [metabase.batch-processing.impl
  shutdown!
  start!
  submit!])
