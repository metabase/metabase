(ns metabase.models.newmetric
  (:require [metabase.mbql.normalize :as mbql.normalize]
            [metabase.models.interface :as mi]
            [metabase.models.permissions :as perms]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel Newmetric :newmetric)

(models/add-type! ::measure
  :in mi/json-in
  :out (comp mbql.normalize/normalize-tokens mi/json-out-with-keywordization))

(models/add-type! ::dimensions
  :in mi/json-in
  :out (comp #(into [] (map (fn [[name form]]
                              [name (mbql.normalize/normalize-tokens form)])
                            %))
             mi/json-out-with-keywordization))

(u/strict-extend (class Newmetric)
  models/IModel
  (merge models/IModelDefaults
         {:types (constantly {:measure             ::measure
                              :dimensions          ::dimensions
                              :granularities       :keyword-set
                              :default_granularity :keyword})
          ;; todo: pre-insert/pre-update with verifications: should
          ;; check that metrics/dimensions seem to be in the metadata
          ;; of the source card_id

          :properties (constantly {:timestamped? true
                                   :entity_id    true})})

  mi/IObjectPermissions
  perms/IObjectPermissionsForParentCollection

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:name (serdes.hash/hydrated-hash :collection)])})

;;;-------------------------------------------------------------------------------------------------------------------;;;
;;;                                                   Serialization                                                   ;;;
;;;-------------------------------------------------------------------------------------------------------------------;;;

(defmethod serdes.base/extract-query "Newmetric" [_model {:keys [user] :as _opts}]
  (serdes.base/raw-reducible-query
    "Newmetric"
    {:select    [:newmetric.*]
     :from      [:newmetric]
     :left-join [[:collection :coll] [:= :coll.id :newmetric.collection_id]]
     :where     (if user
                  [:or [:= :coll.personal_owner_id user] [:is :coll.personal_owner_id nil]]
                  [:is :coll.personal_owner_id nil])}))

(defmethod serdes.base/extract-one "Newmetric"
  [_model-name _opts metric]
  (-> (serdes.base/extract-one-basics "Newmetric" metric)
      (update :card_id       serdes.util/export-fk 'Card)
      (update :collection_id serdes.util/export-fk 'Collection)
      (update :creator_id    serdes.util/export-fk-keyed 'User :email)
      (update :measure       serdes.util/export-json-mbql)
      (update :dimensions    serdes.util/export-json-mbql)))

(defmethod serdes.base/load-xform "Newmetric"
  [card]
  (-> (serdes.base/load-xform-basics card)
      (update :card_id       serdes.util/import-fk 'Card)
      (update :collection_id serdes.util/import-fk 'Collection)
      (update :creator_id    serdes.util/import-fk-keyed 'User :email)
      (update :measure       serdes.util/import-json-mbql)
      (update :dimensions    serdes.util/import-json-mbql)))

(defmethod serdes.base/serdes-dependencies "Newmetric"
  [{:keys [card_id collection_id dimensions measure] :as _metric}]
  (-> (serdes.util/mbql-deps dimensions)
      (concat (serdes.util/mbql-deps measure))
      (concat #{[{:model "Collection" :id collection_id}]
                [{:model "Card" :id card_id}]})
      set))
