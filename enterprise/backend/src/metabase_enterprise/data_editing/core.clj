(ns metabase-enterprise.data-editing.core
  (:require
   [metabase-enterprise.data-editing.data-editing :as data-editing]
   [potemkin :as p]))

(p/import-vars
 [data-editing
  insert!])
