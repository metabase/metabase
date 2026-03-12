(ns metabase.revisions.impl.card
  (:require
   [metabase.queries.core :as queries]
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-card-revision
  #{:cache_invalidated_at
    :created_at
    :creator_id
    :dimension_mappings
    :dimensions
    :document_id
    :entity_id
    :id
    :initially_published_at
    :last_used_at
    :legacy_query
    :made_public_by_id
    :metabase_version
    :public_uuid
    :updated_at
    :view_count})

(defmethod revision/revert-to-revision! :model/Card
  [model id user-id serialized-card]
  ;; make sure we handle < 50 cards that had `:dataset` instead of `:type`
  (let [serialized-card (cond-> serialized-card
                          (contains? serialized-card :dataset) (-> (dissoc :dataset)
                                                                   (assoc :type (if (:dataset serialized-card) :model :question)))
                          ;; Add the default `:card_schema` if it's missing.
                          (not (:card_schema serialized-card)) (assoc :card_schema queries/starting-card-schema-version))]
    ((get-method revision/revert-to-revision! :default) model id user-id serialized-card)))

(defn- model?
  "Returns true if `card` is a model."
  [card]
  (= (keyword (:type card)) :model))

(defmethod revision/serialize-instance :model/Card
  ([instance]
   (revision/serialize-instance :model/Card nil instance))
  ([_model _id instance]
   (cond-> (apply dissoc instance excluded-columns-for-card-revision)
     ;; datasets should preserve edits to metadata
     ;; the type check only needed in tests because most test object does not include `type` key
     (and (some? (:type instance)) (not (model? instance)))
     (dissoc :result_metadata))))
