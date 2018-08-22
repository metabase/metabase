(ns metabase.query-processor.middleware.resolve-test
  (:require [expectations :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware
             [expand :as ql]
             [resolve :as resolve]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.dataset-definitions :as defs]
            [metabase.util :as u]))

(defn- resolved? [field]
  (not (#'resolve/unresolved-field-id field)))

;; Resolving already resolved fields is a noop
(expect
  {:resolved-before? true
   :fields-same?     true}
  (data/with-db (data/get-or-create-database! defs/test-data)
    (let [fields [(Field (u/get-id (data/id :venues :name)))
                  (Field (u/get-id (data/id :venues :category_id)))]]
      {:resolved-before? (every? resolved? fields)
       :fields-same?     (= fields (resolve/resolve-fields-if-needed fields))})))

;; Resolving placholders will return resolved fields
(expect
  {:resolved-before? false
   :resolved-after?  true}
  (data/with-db (data/get-or-create-database! defs/test-data)
    (let [field-placeholders [(ql/field-id (data/id :venues :name))
                              (ql/field-id (data/id :venues :category_id))]]
      {:resolved-before? (every? resolved? field-placeholders)
       :resolved-after?  (every? resolved? (resolve/resolve-fields-if-needed field-placeholders))})))

;; Resolving a mixed list of placeholders and fields will only resolve the unresolved-fields
(expect
  {:resolved-fields-count   1
   :unresolved-fields-count 1
   :all-resolved?           true
   :resolved-field-same?    true}
  (data/with-db (data/get-or-create-database! defs/test-data)
    (let [resolved-field   (Field (u/get-id (data/id :venues :category_id)))
          both-field-types [(ql/field-id (data/id :venues :name))
                            resolved-field]
          result           (resolve/resolve-fields-if-needed both-field-types)]
      {:resolved-fields-count   (count (filter resolved? both-field-types))
       :unresolved-fields-count (count (remove resolved? both-field-types))
       :all-resolved?           (every? resolved? result)
       :resolved-field-same?    (= resolved-field (second result))})))

;; Resolving the fields should include any relevant dimensions along with the field
(expect
  {:field-resolved-before? false
   :field-resolved-after?  true
   :dimension-values       [{:dimension-id true, :field-id true, :dimension-name "Foo",
                              :human-readable-field-id true, :dimension-type :external,
                              :created-at true, :updated-at true}]}
  (data/with-db (data/get-or-create-database! defs/test-data)
    (data/with-data
      (data/create-venue-category-fk-remapping "Foo")
      (let [field-with-dimension (ql/field-id (data/id :venues :category_id))
            result (resolve/resolve-fields-if-needed [field-with-dimension])]
        {:field-resolved-before? (resolved? field-with-dimension)
         :field-resolved-after?  (first (map resolved? result))
         :dimension-values       (tu/boolean-ids-and-timestamps (map :dimensions result))}))))
