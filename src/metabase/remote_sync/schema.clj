(ns metabase.remote-sync.schema
  (:require
   [metabase.util.malli.registry :as mr]))

(mr/def ::pk
  [:or :int :string])

(mr/def ::synced-filter-opts
  "The options of a synced filter clause: with `:include-archived?`, it selects the archived rows too that it would
  select if they weren't archived."
  [:maybe [:map {:closed true}
           [:include-archived? {:optional true} :boolean]]])
