(ns metabase-enterprise.representations.v0.mbql-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest export-dataset-query-test
  (let [mp (mt/metadata-provider)]
    (mt/with-temp [:model/Card card {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :users)))}]
      (doseq [query [(lib/query mp (lib.metadata/table mp (mt/id :users)))
                     (lib/query mp (lib.metadata/card mp (:id card)))
                     (lib/native-query mp "select 1")]]
        (let [exported-query (v0-mbql/export-dataset-query query)
              ref-index (v0-common/map-entity-index
                         {(v0-common/unref (:database exported-query))
                          (t2/instance :model/Database :id (:database query))
                          (v0-common/unref (v0-common/entity->ref card))
                          card})]
          (is (:database exported-query))
          (is (v0-mbql/import-dataset-query exported-query ref-index))))))
  ;; make sure we can get the query of any existing cards
  (doseq [card (t2/select :model/Card)]
    (let [query (v0-mbql/export-dataset-query (:dataset_query card))]
      (is (:database query))
      (is (:query query)))))
