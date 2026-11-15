(ns metabase.lib.schema.actions
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.literal :as lib.schema.literal]
   [metabase.util.malli.registry :as mr]))

;;; only for Actions. Column name => value. A column name is technically allowed to be blank.
(mr/def ::row
  [:map-of
   [:string {:decode/normalize lib.schema.common/normalize-string-key}]
   [:ref ::lib.schema.literal/literal]])
