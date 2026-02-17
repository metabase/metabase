(ns metabase.upload.db
  (:require
   [toucan2.core :as t2]))

(defn current-database
  "The database being used for uploads."
  []
  (t2/select-one :model/Database :uploads_enabled true))
