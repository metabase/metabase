(ns metabase.query-processor.middleware.prefetch-metadata-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- preprocess-app-db-call-count
  "Preprocess `query` and return the number of app-DB calls made. Binds a fresh metadata-provider cache, like the REST
  API does for each HTTP request."
  [query]
  (lib-be/with-metadata-provider-cache
    (t2/with-call-count [call-count]
      (qp.preprocess/preprocess (dissoc query :lib/metadata))
      (call-count))))

(deftest prefetch-metadata-mbql-one-table-call-count-test
  (mt/dataset test-data
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                    (lib/limit 1))]
      (is (= 6 (preprocess-app-db-call-count query))))))

(deftest prefetch-metadata-mbql-three-tables-call-count-test
  (mt/dataset test-data
    (let [mp    (mt/metadata-provider)
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products))
                                               [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                                       (lib.metadata/field mp (mt/id :products :id)))]))
                    (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :people))
                                               [(lib/= (lib.metadata/field mp (mt/id :orders :user_id))
                                                       (lib.metadata/field mp (mt/id :people :id)))]))
                    (lib/limit 1))]
      (is (= 6 (preprocess-app-db-call-count query))))))

(deftest prefetch-metadata-native-one-field-filter-call-count-test
  (mt/dataset test-data
    (let [mp    (mt/metadata-provider)
          query (-> (lib/native-query mp "SELECT * FROM VENUES WHERE {{ff1}}")
                    (lib/with-template-tags
                      {"ff1" {:type         :dimension
                              :name         "ff1"
                              :display-name "ff1"
                              :id           "id1"
                              :dimension    (lib/ref (lib.metadata/field mp (mt/id :venues :price)))
                              :widget-type  :id}})
                    (assoc :parameters [{:type   :id
                                         :target [:dimension [:template-tag "ff1"]]
                                         :value  [1]}]))]
      (is (= 7 (preprocess-app-db-call-count query))))))

(deftest prefetch-metadata-native-three-field-filters-call-count-test
  (mt/dataset test-data
    (let [mp    (mt/metadata-provider)
          tag   (fn [tag-name field-id]
                  {:type         :dimension
                   :name         tag-name
                   :display-name tag-name
                   :id           tag-name
                   :dimension    (lib/ref (lib.metadata/field mp field-id))
                   :widget-type  :id})
          query (-> (lib/native-query mp "SELECT * FROM VENUES WHERE {{ff1}} AND {{ff2}} AND {{ff3}}")
                    (lib/with-template-tags
                      {"ff1" (tag "ff1" (mt/id :venues :price))
                       "ff2" (tag "ff2" (mt/id :venues :category_id))
                       "ff3" (tag "ff3" (mt/id :venues :name))})
                    (assoc :parameters [{:type   :id
                                         :target [:dimension [:template-tag "ff1"]]
                                         :value  [1]}]))]
      (is (= 7 (preprocess-app-db-call-count query))))))
