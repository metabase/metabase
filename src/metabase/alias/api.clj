(ns metabase.alias.api
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/"
  "Fetch recent logins for the current user."
  []
  (t2/query {:union-all
             [{:select [:name [[:inline "question"] :model] :id :alias]
               :from [:report_card]
               :where [:not= :alias nil]}
              {:select [:name [[:inline "dashboard"] :model] :id :alias]
               :from [:report_dashboard]
               :where [:not= :alias nil]}]
             :order-by [[:id :desc]]}))

(api.macros/defendpoint :get "/:alias"
  "Fetch recent logins for the current user."
  [{:keys [alias]}]
  (or (some-> (t2/select-one [:model/Dashboard :id :alias] :alias alias)
              (assoc :model "dashboard"))
      (some-> (t2/select-one [:model/Card :id :alias] :alias alias)
              (assoc :model "card"))))
