(ns metabase-enterprise.representations.v0.mbql-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.representations.core :as rep]
   [metabase-enterprise.representations.export :as export]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase-enterprise.representations.yaml :as yaml]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- has-one-key? [mp keys]
  (and (= 1 (count (select-keys mp keys)))
       ;; check that it's not nil
       (some mp keys)))

(deftest export-dataset-query-test
  (let [query-keys [:query :mbql_query :lib_query]]
    ;; make some queries to check each type
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card card {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :users)))}]
        (doseq [[key query] [[:query      (mt/native-query {:query "select 1"})]
                             [:mbql_query (mt/mbql-query users)]
                             [:lib_query  (lib/query mp (lib.metadata/table mp (mt/id :users)))]
                             [:lib_query  (lib/query mp (lib.metadata/card mp (:id card)))]
                             [:query      (lib/native-query mp "select 1")]]]
          (let [exported-query (v0-mbql/export-dataset-query query)]
            (is (get exported-query key))
            (is (:database exported-query))
            (is (has-one-key? exported-query query-keys))
            (is (v0-mbql/import-dataset-query exported-query (v0-common/map-entity-index
                                                              {(v0-common/unref (:database exported-query))
                                                               (t2/instance :model/Database :id (:database query))})))))))
    ;; make sure we can get the query of any existing cards
    (doseq [card (t2/select :model/Card)]
      (let [query (v0-mbql/export-dataset-query (:dataset_query card))]
        (is (:database query))
        (is (has-one-key? query query-keys))))))
