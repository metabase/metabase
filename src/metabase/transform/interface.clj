(ns metabase.transform.interface
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::view-validation-issue
  [:map
   [:type :keyword]                    ; e.g. :order-by-without-limit
   [:severity [:enum :warning :error]]
   [:message :string]])

(mr/def ::view-validation-result
  [:map
   [:status [:enum :valid :warning :error]]
   [:issues [:sequential ::view-validation-issue]]])
