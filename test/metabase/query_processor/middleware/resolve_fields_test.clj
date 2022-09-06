(ns metabase.query-processor.middleware.resolve-fields-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Field]]
            [metabase.query-processor.middleware.resolve-fields :as qp.resolve-fields]
            [metabase.test :as mt]
            [toucan.db :as db]))

(defn- resolve-and-return-store-contents [query]
  (mt/with-store-contents
    (qp.resolve-fields/resolve-fields query)))

(deftest resolves-field-in-metadata-dataset-metadata-test
  ;; there are cases where FE can send a `dataset-metadata` via the POST /api/dataset
  ;; containing fields that are not present in
  ;; - selected-fields
  ;; - source card
  ;; - joined tables
  ;; - etc
  ;; We allow this behavior for editing models query, so let's make sure
  ;; `resolve-fields` can find fields in [:info :metadata/dataset-metadata] as well.
  (testing "`resolve-fields` finds fields in [:info :metadata/dataset-metadata] (more context in #25000)"
    (let [;; a field that is totally unrelated to the query
          unrelated-field-id (mt/id :users :id)]
      (is (= #{[nil (db/select-one-field :name Field :id unrelated-field-id)]}
             (:fields (resolve-and-return-store-contents
                        (assoc (mt/mbql-query venues)
                               :info
                               {:metadata/dataset-metadata [{:field_ref [:field unrelated-field-id nil]}]}))))))))
