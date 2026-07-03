(ns metabase.transforms.dependency-warming
  "Background warming of the transform `table_dependencies` cache, so job/plan reads don't pay the
  cold-cache cost of computing dependencies live."
  (:require
   [metabase.events.core :as events]
   [metabase.task.core :as task]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.util.jvm :as u.jvm]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- warmed-deps
  "`[id raw-deps]` to cache for `transform`, or nil if it's already cached, reads through a
  card/snippet (whose deps drift independently), or fails to compute."
  [{:keys [id table_dependencies] :as transform}]
  (when (and (nil? table_dependencies)
             (not (transforms-base.ordering/references-card-or-snippet? transform)))
    (try
      [id (transforms-base.ordering/stored-or-live-deps transform)]
      (catch Throwable e
        (log/warnf e "Failed to warm table-dependencies for transform %s" id)))))

(defn warm-transform-dependencies!
  "Compute and persist `:table_dependencies` for transform `id`."
  [id]
  (when-let [entry (some-> (t2/select-one [:model/Transform :id :source :table_dependencies] id)
                           warmed-deps)]
    (transforms-base.ordering/persist-table-dependencies! (conj {} entry))))

(defn warm-all-table-dependencies!
  "Warm every transform whose `:table_dependencies` is still `nil`. Returns the number warmed."
  []
  (let [warmed (into {}
                     (keep warmed-deps)
                     (t2/select [:model/Transform :id :source :table_dependencies] :table_dependencies nil))]
    (transforms-base.ordering/persist-table-dependencies! warmed)
    (count warmed)))

;; Warm off the request thread on API create/update. Subscribe to the crud-layer events (not the
;; model-layer ones) so raw inserts and bulk serdes imports don't each spawn a warm.
(derive ::warm-transform :metabase/event)
(derive :event/transform-create ::warm-transform)
(derive :event/transform-update ::warm-transform)

(methodical/defmethod events/publish-event! ::warm-transform
  [_topic {transform :object}]
  (when-let [id (:id transform)]
    (u.jvm/in-virtual-thread*
     (try
       (warm-transform-dependencies! id)
       (catch Throwable e
         (log/warnf e "Failed to warm table-dependencies for transform %s" id))))))

;; One-shot backfill of pre-existing `nil` rows, in the background so startup isn't blocked.
(defmethod task/init! ::WarmTransformDependencies [_]
  (u.jvm/in-virtual-thread*
   (try
     (warm-all-table-dependencies!)
     (catch Throwable e
       (log/warn e "Failed to warm transform table-dependencies on startup")))))
