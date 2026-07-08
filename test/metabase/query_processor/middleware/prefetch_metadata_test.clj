(ns metabase.query-processor.middleware.prefetch-metadata-test
  ;; these tests count real app-DB calls, so they have to use the real application-database metadata provider (and
  ;; `with-temp` for source cards) rather than a mock metadata provider
  {:clj-kondo/config '{:linters {:discouraged-var {metabase.test/with-temp           {:level :off}
                                                   toucan2.tools.with-temp/with-temp {:level :off}}}}}
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
      ;; the baseline:
      ;; - fetch the Database
      ;; - fetch the Tables in bulk
      ;; - fetch the Tables' columns in bulk
      ;; - the permissions check (EE only)
      ;; - the database-routing check (EE only)
      ;; - the table-remapping check (EE only)
      (is (<= (preprocess-app-db-call-count query) 6)))))

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
      ;; the same number of calls as for a single-table query: all the referenced tables and their columns are
      ;; bulk-loaded, so the count does not depend on the number of tables
      (is (<= (preprocess-app-db-call-count query) 6)))))

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
      ;; one more call than for MBQL queries: the fields referenced by the template tags are bulk-loaded by ID, which
      ;; is also how their tables are discovered
      (is (<= (preprocess-app-db-call-count query) 7)))))

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
      ;; the same calls as with a single field filter: all the template-tag Fields are loaded with a single bulk
      ;; call, while without prefetching parameter substitution would resolve them one at a time
      (is (<= (preprocess-app-db-call-count query) 7)))))

(deftest prefetch-metadata-card-source-call-count-test
  (mt/dataset test-data
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card card {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}]
        (let [query (-> (lib/query mp (lib.metadata/card mp (:id card)))
                        (lib/limit 1))]
          ;; the baseline calls, plus:
          ;; - one bulk fetch of the referenced Cards; resolving the source card afterwards hits the cache, and the
          ;;   card's table and columns are folded into the baseline bulk loads
          (is (<= (preprocess-app-db-call-count query) 7)))))))

(deftest prefetch-metadata-nested-card-source-call-count-test
  (mt/dataset test-data
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card inner-card {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}]
        (mt/with-temp [:model/Card outer-card {:dataset_query (lib/query mp (lib.metadata/card mp (:id inner-card)))}]
          (let [query (-> (lib/query mp (lib.metadata/card mp (:id outer-card)))
                          (lib/limit 1))]
            ;; one more call than for a single source card: referenced Cards are prefetched with one bulk fetch per
            ;; level of nesting, and both cards' tables and columns are folded into the same bulk loads
            (is (<= (preprocess-app-db-call-count query) 8))))))))

(deftest prefetch-metadata-card-source-with-join-call-count-test
  (mt/dataset test-data
    (let [mp (mt/metadata-provider)]
      (mt/with-temp [:model/Card card {:dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))}]
        (let [query (-> (lib/query mp (lib.metadata/card mp (:id card)))
                        (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :categories))
                                                   [(lib/= (lib.metadata/field mp (mt/id :venues :category_id))
                                                           (lib.metadata/field mp (mt/id :categories :id)))]))
                        (lib/limit 1))]
          ;; the same calls as for a plain source card: the joined Table and its columns are folded into the same
          ;; bulk loads
          (is (<= (preprocess-app-db-call-count query) 7)))))))
