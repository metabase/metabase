(ns metabase.warehouse-index-manager.events
  "Replay Metabase-managed indexes after a transform run.

  Some transform execution strategies drop and recreate the target table
  (`run-with-drop-create-fallback-strategy!` in `metabase.driver.sql`).
  When that happens any indexes on the old table are lost. We listen for
  `:event/transform-run-complete` and, for every `IndexRequest` row owned
  by the transform that was in `:succeeded` state but is no longer
  present in the warehouse, re-queue the create.

  We never replay `:failed`, `:pending`, or `:running` rows. A user
  drop deletes the row entirely, so it's also not replayed (by construction)."
  (:require
   [metabase.events.core :as events]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.quick-task :as quick-task]
   [metabase.warehouse-index-manager.ddl-execute :as ddl-execute]
   [metabase.warehouse-index-manager.introspection :as introspection]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(derive ::event :metabase/event)
(derive :event/transform-run-complete ::event)

(defn- existing-index-names
  "Lower-cased names of indexes the warehouse currently has for `[schema name]`."
  [driver-kw database schema table]
  (->> (introspection/fetch-indexes driver-kw database [schema table])
       (map (comp u/lower-case-en :name))
       set))

(defn- replay-one! [driver-kw database request]
  (try
    (t2/update! :model/IndexRequest (:id request) {:status :running})
    (let [result (ddl-execute/execute! driver-kw database (:statement request))
          [s msg] (case (:status result)
                    :executed [:succeeded nil]
                    :failed   [:failed    (:error-message result)]
                    :skipped  [:failed    (:error-message result)])]
      (t2/update! :model/IndexRequest (:id request)
                  {:status           s
                   :error_message    msg
                   :last_executed_at (OffsetDateTime/now)}))
    (catch Throwable e
      (log/warnf e "Index replay failed for request %s (transform %s)"
                 (:id request) (:transform_id request))
      (try
        (t2/update! :model/IndexRequest (:id request)
                    {:status        :failed
                     :error_message (or (ex-message e) "replay error")
                     :last_executed_at (OffsetDateTime/now)})
        (catch Throwable _)))))

(defn- replay-for-transform! [transform-id]
  (let [rows (t2/select :model/IndexRequest :transform_id transform-id :status :succeeded)]
    (when (seq rows)
      (let [target-table (t2/select-one :model/Table :transform_id transform-id)
            db-id        (some-> target-table :db_id)
            database     (when db-id (t2/select-one :model/Database :id db-id))
            driver-kw    (some-> database :engine keyword)]
        (cond
          (nil? database)
          (log/warnf "Transform %s: no target table found for index replay" transform-id)

          :else
          (let [existing  (existing-index-names driver-kw database
                                                (:schema target-table)
                                                (:name target-table))
                ;; Re-queue rows whose index isn't present in the warehouse anymore.
                missing   (filter (fn [r]
                                    (not (existing (u/lower-case-en (:index_name r)))))
                                  rows)]
            (doseq [req missing]
              (t2/update! :model/IndexRequest (:id req)
                          {:status :pending :error_message nil})
              (quick-task/submit-task!
               #(replay-one! driver-kw database req)))))))))

(methodical/defmethod events/publish-event! ::event
  [_topic {{:keys [transform-id]} :object}]
  (when transform-id
    (try
      (replay-for-transform! transform-id)
      (catch Throwable e
        (log/warnf e "Index manager: replay handler crashed for transform %s" transform-id)))))
