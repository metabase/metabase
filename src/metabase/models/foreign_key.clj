(ns metabase.models.foreign-key
  (:require [korma.core :refer :all]))

(defentity ForeignKey
  (table :metabase_foreignkey))
