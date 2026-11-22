(ns metabase.dashboards.models.dashboard-card-series
  (:require
   [medley.core :as m]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.dashboards.write-opts :as write-opts]
   [metabase.dependencies.core :as dependencies]
   [metabase.events.core :as events]
   [metabase.queries.models.card :as card]
   [metabase.revisions.core :as revisions]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/DashboardCardSeries [_model] :dashboardcard_series)

(doto :model/DashboardCardSeries
  (derive :metabase/model))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-update :model/DashboardCardSeries
  [series]
  (let [changes (t2/changes series)]
    (when (contains? changes :dashboardcard_id)
      (throw (ex-info (tru "You cannot move a series to another dashboard card.") {:status-code 400})))
    series))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-dashboard-card-series! :- [:sequential :map]
  "Insert the DashboardCardSeries `rows` and return the inserted instances, publishing their create event."
  ([rows :- [:sequential ::dashboards.schema/dashboard-card-series.create]]
   (create-dashboard-card-series! rows nil))
  ([rows :- [:sequential ::dashboards.schema/dashboard-card-series.create]
    opts :- ::dashboards.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [series (dashboards.db/insert-dashcard-series! rows)]
       (events/publish-event! :event/dashboard-card-series-create
                              (events/create-event series (write-opts/event-context opts)))
       series))))

(mu/defn update-dashboard-card-series! :- [:sequential :map]
  "Apply the columns of each of `rows`, each holding the `:id` of its DashboardCardSeries, publishing their update event,
  and return the rows of the series that exist."
  ([rows :- [:sequential ::dashboards.schema/dashboard-card-series.update-row]]
   (update-dashboard-card-series! rows nil))
  ([rows :- [:sequential ::dashboards.schema/dashboard-card-series.update-row]
    opts :- ::dashboards.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [stored (m/index-by :id (if (seq rows) (dashboards.db/dashcard-series-by-ids (mapv :id rows)) []))
           rows   (filterv #(contains? stored (:id %)) rows)]
       (doseq [[changes group] (group-by #(dissoc % :id) rows)]
         (dashboards.db/update-dashcard-series! (mapv :id group) changes))
       (events/publish-event! :event/dashboard-card-series-update
                              (events/update-event stored rows {:context (write-opts/event-context opts)}))
       rows))))

(mu/defn delete-dashboard-card-series! :- :nil
  "Delete the DashboardCardSeries with `series-ids`, publishing their delete event right before the statement."
  ([series-ids :- [:sequential ms/PositiveInt]]
   (delete-dashboard-card-series! series-ids nil))
  ([series-ids :- [:sequential ms/PositiveInt]
    opts       :- ::dashboards.schema/write-opts]
   (when (seq series-ids)
     (t2/with-transaction [_conn]
       (let [series (dashboards.db/dashcard-series-by-ids series-ids)]
         (events/publish-event! :event/dashboard-card-series-delete
                                (events/delete-event series (write-opts/event-context opts)))
         (dashboards.db/delete-dashcard-series! (mapv :id series)))))
   nil))

(defmethod card/delete-followers! :model/DashboardCardSeries
  [_model ids]
  (delete-dashboard-card-series! ids))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/DashboardCardSeries [_model]
  {:skip? false})

(defmethod serialization/spec :model/DashboardCardSeries [_]
  {:schema    ::dashboards.schema/external-dashboard-card-series
   :identity  [:dashboardcard_id :position]
   :copy      [:position]
   :parent    {:model :model/DashboardCard :key :dashboardcard_id :order :position}
   :insert!   #(create-dashboard-card-series! % {:writer :import})
   :update!   #(update-dashboard-card-series! % {:writer :import})
   :delete!   #(delete-dashboard-card-series! % {:writer :import})
   :transform {:dashboardcard_id serialization/import-only-transform
               :card_id (serialization/fk-transform :model/Card)}})

(defmethod revisions/spec :model/DashboardCardSeries [_model]
  {:track  [:card_id :position]
   :skip   [:dashboardcard_id]
   :parent {:model :model/DashboardCard :key :dashboardcard_id}})

(defmethod dependencies/spec :model/DashboardCardSeries [_model]
  {:part-of      {:type :dashboard :key :dashboardcard_id :via [:model/DashboardCard :dashboard_id]}
   :part-columns #{:card_id :dashboardcard_id}})
