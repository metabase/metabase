(ns metabase.transforms-rest.schema
  "Malli schemas shared by the transforms REST API namespaces."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::async-run-response
  "The `202` response of a request that started a run in the background: its body carries a message and the ID of the
  run it started, when there is one."
  [:map {:closed true}
   [:status  [:= 202]]
   [:headers [:map-of :string :string]]
   [:body    [:map-of :keyword [:maybe [:or :string mu/localized-string-schema ms/PositiveInt]]]]])
