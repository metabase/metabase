(ns metabase.revisions.test-util
  "Helpers that seed the Revisions of an entity in tests, which production records from the events of its writes."
  (:require
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.json :as json]))

(defn- comparable
  [entity object]
  (json/encode (cond-> object (= :model/Card entity) (dissoc :card_schema))))

(defn push-revision!
  "Record a Revision of the entity of `info` unless its serialized `:object` equals that of the newest one. Returns the
  object when it recorded one."
  [{:keys [id entity object] :as info}]
  (let [row       (revision/revision-row info)
        last-body (revisions.db/latest-revision-object (name entity) id)]
    (when-not (= (comparable entity (:object row)) (comparable entity last-body))
      (revision/record-revisions! [row])
      object)))
