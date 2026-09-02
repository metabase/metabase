(ns metabase.upload.db
  (:require
   [metabase.upload.queries :as upload.queries]))

(defn current-database
  "The database being used for uploads."
  []
  (upload.queries/uploads-database))
