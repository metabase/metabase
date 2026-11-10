(ns metabase.remote-sync.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::pk
  [:or :int :string])
