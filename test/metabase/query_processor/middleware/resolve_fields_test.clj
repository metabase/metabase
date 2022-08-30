(ns metabase.query-processor.middleware.resolve-fields-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.resolve-fields :as resolve-fields]
            [metabase.test :as mt]
            [toucan.db :as db]))


(defn- resolve-and-return-store-contents [query]
  (mt/with-store-contents
    (resolve-fields/resolve-fields query)))

(deftest resolves-field-in-metadata-dataset-metadata-test
  ;; there are cases where FE can send a `dataset-metadata` via the POST /api/dataset
  ;; and it could contains fields that might not included in the
  ;; - selected-fields
  ;; - source card
  ;; - joined tables
  ;; - etc
  ;; We're currently allow this behavior when editing models query, so let's make sure
  ;; the `resolve-fields` find fields in it as well.
  (testing "it should looks for fields in the [:info [:metadata/dataset-metadata]]"
    (let [;; a field that is totally unrelated to the query
          unrelated-field-id (mt/id :users :id)]
      (is (= #{[nil (db/select-one-field :name Field :id unrelated-field-id)]}
             (:fields (resolve-and-return-store-contents
                        (assoc (mt/mbql-query venues)
                               :info
                               {:metadata/dataset-metadata [{:field_ref [:field unrelated-field-id nil]}]}))))))))
