(ns metabase.explorations.models.exploration-thread
  (:require
   [clojure.edn :as edn]
   [metabase.models.interface :as mi]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ExplorationThread [_model] :exploration_thread)

(doto :model/ExplorationThread
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defn- transcript-in
  "EDN-encode the Automatic Insights transcript. EDN over JSON for the same
  reason as chart_stats: the transcript contains keyword keys, prose-mirror
  doc trees with string-keyed maps, and nested Clojure data — JSON would
  mangle the shape."
  [v]
  (cond
    (nil? v)    nil
    (string? v) v
    :else       (pr-str v)))

(defn- transcript-out
  "Decode the EDN blob, recovering nil (with a warning) on parse failure so a
  malformed transcript can't break a read of the thread."
  [s]
  (when (string? s)
    (try
      (edn/read-string s)
      (catch Throwable e
        (log/warn e "Failed to parse exploration_thread.auto_insights_transcript; returning nil")
        nil))))

(t2/deftransforms :model/ExplorationThread
  {:auto_insights_transcript {:in transcript-in :out transcript-out}})

(defmethod mi/can-read? :model/ExplorationThread
  ([instance]
   (mi/can-read? :model/Exploration (:exploration_id instance)))
  ([_model pk]
   (when-let [thread (t2/select-one [:model/ExplorationThread :exploration_id] :id pk)]
     (mi/can-read? :model/Exploration (:exploration_id thread)))))

(defmethod mi/can-write? :model/ExplorationThread
  ([instance]
   (mi/can-write? :model/Exploration (:exploration_id instance)))
  ([_model pk]
   (when-let [thread (t2/select-one [:model/ExplorationThread :exploration_id] :id pk)]
     (mi/can-write? :model/Exploration (:exploration_id thread)))))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :metrics]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/select :model/ExplorationThreadMetric
                         :exploration_thread_id [:in (map :id threads)]
                         {:order-by [[:position :asc] [:id :asc]]}))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :dimensions]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/select :model/ExplorationThreadDimension
                         :exploration_thread_id [:in (map :id threads)]
                         {:order-by [[:position :asc] [:id :asc]]}))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :timelines]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/hydrate
               (t2/select :model/ExplorationThreadTimeline
                          :exploration_thread_id [:in (map :id threads)]
                          {:order-by [[:position :asc] [:id :asc]]})
               :timeline))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :queries]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/hydrate
               (t2/select :model/ExplorationQuery
                          :exploration_thread_id [:in (map :id threads)]
                          {:order-by [[:position :asc] [:id :asc]]})
               :interestingness_score
               :contextual_interestingness_score
               :timeline_interestingness))
   :id
   {:default []}))

(methodical/defmethod t2/batched-hydrate [:model/ExplorationThread :documents]
  [_model k threads]
  (mi/instances-with-hydrated-data
   threads k
   #(group-by :exploration_thread_id
              (t2/select [:model/Document
                          :id :name :exploration_thread_id :creator_id :content_type
                          :created_at :updated_at :archived]
                         :exploration_thread_id [:in (map :id threads)]
                         :archived false
                         {:order-by [[:created_at :asc] [:id :asc]]}))
   :id
   {:default []}))
