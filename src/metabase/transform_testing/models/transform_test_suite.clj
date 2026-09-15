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

(methodical/defmethod t2/table-name :model/TransformTestSuite [_model] :transform_test_suite)

(doto :model/TransformTestSuite
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(defn- json-column
  "A Toucan transform storing a value of `schema` as JSON, normalized and validated on its way in and normalized on its
  way out."
  [schema]
  {:in  (comp mi/json-in #(mu/validate-throw schema %) #(lib/normalize schema %))
   :out (comp #(lib/normalize schema %) mi/json-out-with-keywordization)})

(t2/deftransforms :model/TransformTestSuite
  {:inputs       (json-column ::transform-testing.schema/inputs)
   :expectations (json-column ::transform-testing.schema/expectations)})

(defmethod mi/can-read? :model/TransformTestSuite
  ([instance]
   (mi/can-read? :model/Transform (:transform_id instance)))
  ([_model pk]
   (when-let [suite (transform-testing.db/test-suite pk)]
     (mi/can-read? suite))))

(defmethod mi/can-write? :model/TransformTestSuite
  ([instance]
   (mi/can-write? :model/Transform (:transform_id instance)))
  ([_model pk]
   (when-let [suite (transform-testing.db/test-suite pk)]
     (mi/can-write? suite))))

(defmethod mi/can-create? :model/TransformTestSuite
  [_model instance]
  (mi/can-write? :model/Transform (:transform_id instance)))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(defmethod serdes/make-spec "TransformTestSuite"
  [_model-name _opts]
  {:copy      [:entity_id :name :description :inputs :expectations]
   :transform {:created_at   (serdes/date)
               :transform_id (serdes/fk :model/Transform)
               :creator_id   (serdes/fk :model/User)}})

(defmethod serdes/deserialization-dependencies "TransformTestSuite"
  [{:keys [transform_id]}]
  #{[{:model "Transform" :id transform_id}]})

(defmethod serdes/storage-path "TransformTestSuite" [suite _ctx]
  [{:label "transforms"} {:label "tests"} {:label (:name suite) :key (:entity_id suite)}])
