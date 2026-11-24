(ns metabase.change-log.events
  "The change log as a consumer of the lifecycle events of tracked models (see `metabase.change-log.core`). A delete
  is captured at the write, before the database cascades it, to find the rows of tracked tables that go with it."
  (:require
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.log :as change-log.log]
   [metabase.change-log.spec :as change-log.spec]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.events :as u.events]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- capture-cascade
  "What a DELETE statement of `model` makes the database delete or null in tracked tables, as
  `[table-name row-ids action]`s, from the rows that `select-rows` selects before the delete hooks run."
  [model select-rows]
  (when (premium-features/enable-change-log?)
    (let [fks        (change-log.cascade/foreign-keys)
          table      (change-log.log/table-of model)
          referenced (change-log.cascade/referenced-columns fks table)]
      (when (seq referenced)
        (not-empty (vec (change-log.cascade/changes fks table (select-rows referenced))))))))

(defn- own-changes
  [{:keys [operation model id] :as event}]
  (when (change-log.spec/tracked? model)
    (let [table (change-log.log/table-of model)]
      (case operation
        :create [[table [id] "insert"]]
        :update (when (some #(change-log.spec/tracked-column? model %) (u.events/changed-keys event))
                  [[table [id] "update"]])
        :delete [[table [id] "delete"]]))))

(defn- log-events!
  [events _all]
  (when (premium-features/enable-change-log?)
    (let [deleted  (filter #(= :delete (:operation %)) events)
          cascaded (when (seq deleted)
                     (mapcat (fn [[model group]]
                               (capture-cascade model (fn [columns]
                                                        (mapv #(select-keys (:previous-object %)
                                                                            (into (vec (t2/primary-keys model)) columns))
                                                              group))))
                             (group-by :model deleted)))]
      (change-log.log/log! (concat (mapcat own-changes events) cascaded)))))

(events/derive! :metabase/lifecycle-event ::change-log)

(methodical/defmethod events/publish-event! ::change-log
  [topic event]
  (when-let [events (not-empty (filterv (constantly true) (u.events/row-events topic event)))]
    (log-events! events events)))
