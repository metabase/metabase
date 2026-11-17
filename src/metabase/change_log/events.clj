(ns metabase.change-log.events
  "The change log as a consumer of the lifecycle events of tracked models (see `metabase.change-log.core`). A delete
  is captured at the write, before the database cascades it, to find the rows of tracked tables that go with it."
  (:require
   [metabase.change-log.cascade :as change-log.cascade]
   [metabase.change-log.log :as change-log.log]
   [metabase.events.core :as events]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.events :as u.events]))

(set! *warn-on-reflection* true)

(defn- capture-cascade
  "What the delete of a row makes the database delete or null in tracked tables, as `[table-name row-ids action]`s."
  [{:keys [operation model previous-object]}]
  (when (and (= :delete operation) (premium-features/enable-change-log?))
    (let [fks   (change-log.cascade/foreign-keys)
          table (change-log.log/table-of model)]
      (when (seq (change-log.cascade/referenced-columns fks table))
        (not-empty (vec (change-log.cascade/changes fks table [previous-object])))))))

(defn- own-changes
  [{:keys [operation model id] :as event}]
  (when (contains? change-log.log/tracked-models model)
    (let [table (change-log.log/table-of model)]
      (case operation
        :create [[table [id] "insert"]]
        :update (when-not (every? (conj (change-log.log/ignored-columns model) :updated_at) (u.events/changed-keys event))
                  [[table [id] "update"]])
        :delete [[table [id] "delete"]]))))

(defn- log-events!
  [_owner events _all]
  (when (premium-features/enable-change-log?)
    (change-log.log/log! (mapcat (fn [event]
                                   (concat (own-changes event) (get-in event [:captures :change-log])))
                                 events))))

(events/register-capture! :change-log capture-cascade)
(events/register-owned-consumer! :change-log (constantly :log) log-events!)
