(ns metabase-enterprise.transforms.models.transform
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/Transform [_model] :transforms)

(doto :model/Transform
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(t2/deftransforms :model/Transform
  {:source mi/transform-json
   :target mi/transform-json})

(t2/define-before-insert :model/Transform
  [transform]
  (let [source-db (-> transform :source :query :database)]
    (cond-> transform
      (pos-int? source-db) (assoc :database_id source-db))))

(doseq [event ["transform-create" "transform-update" "transform-delete"]
        :let [local-kw (keyword (str *ns*) event)
              global-kw (keyword "event" event)]]
  (derive local-kw :metabase/event)
  (derive global-kw local-kw))

(t2/define-after-insert :model/Transform
  [transform]
  (events/publish-event! :event/transform-create {:object transform
                                                  :user-id api/*current-user-id*}))

(t2/define-before-update :model/Transform
  [transform]
  (let [source-db (-> (t2/changes transform) :source :query :database)
        transform (cond-> transform
                    (pos-int? source-db) (assoc :database_id source-db))]
    (events/publish-event! :event/transform-update {:object transform
                                                    :user-id api/*current-user-id*})
    transform))

(t2/define-before-delete :model/Transform
  [transform]
  (events/publish-event! :event/transform-delete {:object transform
                                                  :user-id api/*current-user-id*}))
