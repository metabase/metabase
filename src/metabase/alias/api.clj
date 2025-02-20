(ns metabase.alias.api
  (:require
   [clojure.string :as str]
   [metabase.api.macros :as api.macros]
   [toucan2.core :as t2]))

(api.macros/defendpoint :get "/"
  "Fetch recent logins for the current user."
  []
  (t2/query {:union-all
             [{:select [:name [[:inline "question"] :model] :id :alias]
               :from [:report_card]
               :where [:and
                       [:not= :alias nil]
                       [:= 0 [:strpos :alias "@"]]]}
              {:select [:name [[:inline "dashboard"] :model] :id :alias]
               :from [:report_dashboard]
               :where [:and
                       [:not= :alias nil]
                       [:= 0 [:strpos :alias "@"]]]}]
             :order-by [[:id :desc]]}))

(api.macros/defendpoint :get "/:alias"
  "Fetch recent logins for the current user."
  [{:keys [alias]}]
  (when (str/includes? alias "@")
    (throw (ex-info "Cannot get draft and old aliases this way" {:alias alias})))
  (or (some-> (t2/select-one [:model/Dashboard :id :alias] :alias alias)
              (assoc :model "dashboard"))
      (some-> (t2/select-one [:model/Card :id :alias] :alias alias)
              (assoc :model "card"))))
