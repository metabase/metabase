(ns metabase-enterprise.data-editing.core
  (:require
   ;; Loaded for side effects (defmethod)
   [metabase-enterprise.data-editing.actions]
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [potemkin :as p]))

(comment
  data-editing/keep-me)

(p/import-vars
 [data-editing
  perform-bulk-action!])
