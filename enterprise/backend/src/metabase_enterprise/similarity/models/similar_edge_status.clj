(ns metabase-enterprise.similarity.models.similar-edge-status
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as app-db]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/SimilarEdgeStatus [_model] :similar_edge_status)

(derive :model/SimilarEdgeStatus :metabase/model)

(t2/deftransforms :model/SimilarEdgeStatus
  {:view   mi/transform-keyword
   :status mi/transform-keyword})

(def ^:private last-error-max-chars
  "Truncation limit for `last_error`. The column is `${text.type}` on disk; this
   bound prevents pathological stack traces from blowing up the row."
  4000)

(defn- truncate-error [^Throwable t]
  (let [msg (str (.getName (class t)) ": " (.getMessage t))]
    (subs msg 0 (min (count msg) last-error-max-chars))))

(defn mark-running!
  "Atomically upsert this view's status row to `:running`, clearing any prior
   error message."
  [view]
  (app-db/update-or-insert!
   :model/SimilarEdgeStatus
   {:view view}
   (fn [_existing]
     {:status :running, :last_error nil})))

(defn mark-ok!
  "Mark this view's status as `:ok` and stamp `last_full_run_at` to now. Caller
   is responsible for ensuring this only runs after edges are committed."
  [view]
  (app-db/update-or-insert!
   :model/SimilarEdgeStatus
   {:view view}
   (fn [_existing]
     {:status           :ok
      :last_full_run_at (t/offset-date-time)
      :last_error       nil})))

(defn record-error!
  "Mark this view's status as `:error` with the truncated exception message."
  [view ex]
  (app-db/update-or-insert!
   :model/SimilarEdgeStatus
   {:view view}
   (fn [_existing]
     {:status     :error
      :last_error (truncate-error ex)})))
