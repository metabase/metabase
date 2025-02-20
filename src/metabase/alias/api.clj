(ns metabase.alias.api
  (:require
   [clojure.string :as str]
   [metabase.alias.core :as alias]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.util.malli.schema :as ms]
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

(api.macros/defendpoint :post "/:id/promote"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/let-404 [dashboard (t2/select-one :model/Dashboard :id id)]
    (api/read-check dashboard)
    (when-not (alias/draft? (:alias dashboard))
      (throw (ex-info "Not a draft" {:status-code 400})))
    (let [current (alias/parent-for-draft (:alias dashboard))]
      (t2/with-transaction [_]
          (t2/update! :model/Dashboard :id (:id current) {:alias (str (:alias current) "@old")})
          (t2/update! :model/Dashboard :id (:id dashboard) {:alias (:alias current)})))
    api/generic-204-no-content))

(api.macros/defendpoint :get "/:alias"
  "Fetch recent logins for the current user."
  [{:keys [alias]}]
  (when (str/includes? alias "@")
    (throw (ex-info "Cannot get draft and old aliases this way" {:alias alias})))
  (or (some-> (t2/select-one [:model/Dashboard :id :alias] :alias alias)
              (assoc :model "dashboard"))
      (some-> (t2/select-one [:model/Card :id :alias] :alias alias)
              (assoc :model "card"))))
