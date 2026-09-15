(ns metabase.transform-testing.models.transform-test-suite
  (:require
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.transform-testing.db :as transform-testing.db]
   [metabase.transform-testing.schema :as transform-testing.schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTest [_model] :transform_test)

(doto :model/TransformTest
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(defn- json-column
  "A Toucan transform storing a value of `schema` as JSON, normalized and validated on its way in and normalized on its
  way out."
  [schema]
  {:in  (comp mi/json-in #(mu/validate-throw schema %) #(lib/normalize schema %))
   :out (comp #(lib/normalize schema %) mi/json-out-with-keywordization)})

(t2/deftransforms :model/TransformTest
  {:inputs       (json-column ::transform-testing.schema/inputs)
   :expectations (json-column ::transform-testing.schema/expectations)})

;;; ------------------------------------------------- Permissions --------------------------------------------------

(defmethod mi/can-read? :model/TransformTest
  ([instance]
   (mi/can-read? :model/Transform (:transform_id instance)))
  ([_model pk]
   (when-let [transform-test (transform-testing.db/transform-test pk)]
     (mi/can-read? transform-test))))

(defmethod mi/can-write? :model/TransformTest
  ([instance]
   (mi/can-write? :model/Transform (:transform_id instance)))
  ([_model pk]
   (when-let [transform-test (transform-testing.db/transform-test pk)]
     (mi/can-write? transform-test))))

(defmethod mi/can-create? :model/TransformTest
  [_model instance]
  (mi/can-write? :model/Transform (:transform_id instance)))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serdes/make-spec "TransformTest"
  [_model-name _opts]
  {:copy      [:entity_id :name :description :inputs :expectations]
   :transform {:created_at   (serdes/date)
               :transform_id (serdes/fk :model/Transform)
               :creator_id   (serdes/fk :model/User)}})

(defmethod serdes/deserialization-dependencies "TransformTest"
  [{:keys [transform_id]}]
  #{[{:model "Transform" :id transform_id}]})

(defmethod serdes/storage-path "TransformTest" [transform-test ctx]
  (let [{:keys [name entity_id collection_entity_id]} (transform-testing.db/transform-storage-summary
                                                       (:transform_id transform-test))]
    (conj (serdes/storage-path {:serdes/meta   [{:model "Transform" :id entity_id}]
                                :name          name
                                :entity_id     entity_id
                                :collection_id collection_entity_id}
                               ctx)
          {:label (:name transform-test) :key (:entity_id transform-test)})))
