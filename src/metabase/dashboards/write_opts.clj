(ns metabase.dashboards.write-opts
  "What the write functions of a Dashboard and of its parts do with their `opts`, see
  `:metabase.dashboards.schema/write-opts`."
  (:require
   [metabase.dashboards.db :as dashboards.db]
   [metabase.events.core :as events]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn event-context :- [:maybe :map]
  "The context of the events of a write with `opts`: its `:context`, and `:reverting?` for the writes of a revert."
  [opts :- :metabase.dashboards.schema/write-opts]
  (let [{:keys [context writer]} opts]
    (not-empty (cond-> context
                 (= :revert writer) (assoc :reverting? true)))))

(mu/defn touch-dashboards!
  "Publish, as the last step of a write of the parts of the Dashboards with `dashboard-ids`, the update event of each
  Dashboard that none of its columns changed in, so that its records, as its Revision, are made once; nothing when `opts`
  say that the caller publishes it."
  [dashboard-ids :- [:sequential pos-int?]
   opts          :- :metabase.dashboards.schema/write-opts]
  (when (and (not (false? (:owner-event? opts))) (seq dashboard-ids))
    (events/publish-event! :event/dashboard-update
                           (events/touch-event (dashboards.db/dashboards (vec (distinct dashboard-ids)))
                                               (event-context opts))))
  nil)

(mu/defn publish-dashboard-event!
  "Publish, as the last step of a write of a Dashboard and of its parts that left their own events to this call, the
  update event of the Dashboard of `stored`, a map from id to the row before the write, that the columns of `rows`,
  those the write set, make; when they change none and `parts-changed?`, its touch event."
  [stored         :- [:map-of pos-int? :map]
   rows           :- [:sequential :map]
   parts-changed? :- :boolean
   opts           :- :metabase.dashboards.schema/write-opts]
  (let [context (event-context opts)
        event   (events/update-event stored rows {:context context})]
    (cond
      (seq (:changes event)) (events/publish-event! :event/dashboard-update event)
      parts-changed?         (touch-dashboards! (vec (keys stored)) nil)))
  nil)
