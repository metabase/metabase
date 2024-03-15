(ns metabase.lib.schema.actions
  (:require [metabase.util.malli.registry :as mr]))

;;; only for Actions. Column name => value. A column name is technically allowed to be blank.
(mr/def ::row
  [:map-of
   {:decode/normalize identity}
   :string
   :any])
