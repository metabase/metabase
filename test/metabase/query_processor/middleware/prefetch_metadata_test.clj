(ns metabase.query-processor.middleware.prefetch-metadata-test
  ;; these tests count real app-DB calls, so they have to use the real application-database metadata provider (and
  ;; `with-temp` for source cards) rather than a mock metadata provider
  {:clj-kondo/config '{:linters {:discouraged-var {metabase.test/with-temp           {:level :off}
                                                   toucan2.tools.with-temp/with-temp {:level :off}}}}}
  (:require
   [clojure.string :as str]
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

(defn- one-table-query
  "A query of one Table."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
        (lib/limit 1))))

(defn- three-tables-query
  "A query of one Table with joins of two more."
  []
  (let [mp (mt/metadata-provider)]
    (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
        (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :products))
                                   [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                           (lib.metadata/field mp (mt/id :products :id)))]))
        (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :people))
                                   [(lib/= (lib.metadata/field mp (mt/id :orders :user_id))
                                           (lib.metadata/field mp (mt/id :people :id)))]))
        (lib/limit 1))))

(deftest prefetch-metadata-mbql-tables-call-count-test
  (testing "a query of three Tables takes as many calls as a query of one, as Tables and their columns are bulk-loaded"
    (mt/dataset test-data
      (preprocess-app-db-call-count (one-table-query))
      (is (= (preprocess-app-db-call-count (one-table-query))
             (preprocess-app-db-call-count (three-tables-query)))))))

(defn- field-filters-query
  "A native query with a field filter on each of the `venues` Fields with `field-keys`."
  [field-keys]
  (let [mp   (mt/metadata-provider)
        tags (into {} (map-indexed (fn [i field-key]
                                     (let [tag-name (str "ff" (inc i))]
                                       [tag-name {:type         :dimension
                                                  :name         tag-name
                                                  :display-name tag-name
                                                  :id           tag-name
                                                  :field-id     (mt/id :venues field-key)
                                                  :widget-type  :id}])))
                   field-keys)]
    (-> (lib/native-query mp (str "SELECT * FROM VENUES WHERE "
                                  (str/join " AND " (map #(str "{{" % "}}") (sort (keys tags))))))
        (lib/with-template-tags tags)
        (assoc :parameters [{:type   :id
                             :target [:dimension [:template-tag "ff1"]]
                             :value  [1]}]))))

(deftest prefetch-metadata-native-field-filters-call-count-test
  (testing "three field filters take as many calls as one, as all template-tag Fields are loaded with one bulk call"
    (mt/dataset test-data
      (preprocess-app-db-call-count (field-filters-query [:price]))
      (is (= (preprocess-app-db-call-count (field-filters-query [:price]))
             (preprocess-app-db-call-count (field-filters-query [:price :category_id :name])))))))

(deftest prefetch-metadata-card-source-call-count-test
  (testing "a source Card over three Tables takes as many calls as a source Card over one"
    (mt/dataset test-data
      (mt/with-temp [:model/Card small {:dataset_query (one-table-query)}
                     :model/Card large {:dataset_query (three-tables-query)}]
        (let [mp      (mt/metadata-provider)
              counted (fn [card]
                        (preprocess-app-db-call-count (-> (lib/query mp (lib.metadata/card mp (:id card)))
                                                          (lib/limit 1))))]
          (counted small)
          (is (= (counted small) (counted large))))))))

(deftest prefetch-metadata-nested-card-source-call-count-test
  (testing "a Card over a source Card over three Tables takes as many calls as a Card over a source Card over one"
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card inner-small {:dataset_query (one-table-query)}
                       :model/Card inner-large {:dataset_query (three-tables-query)}]
          (mt/with-temp [:model/Card outer-small {:dataset_query (lib/query mp (lib.metadata/card mp (:id inner-small)))}
                         :model/Card outer-large {:dataset_query (lib/query mp (lib.metadata/card mp (:id inner-large)))}]
            (let [counted (fn [card]
                            (preprocess-app-db-call-count (-> (lib/query mp (lib.metadata/card mp (:id card)))
                                                              (lib/limit 1))))]
              (counted outer-small)
              (is (= (counted outer-small) (counted outer-large))))))))))

(deftest prefetch-metadata-card-source-with-join-call-count-test
  (testing "a source Card with a joined Table takes as many calls as a plain source Card"
    (mt/dataset test-data
      (let [mp (mt/metadata-provider)]
        (mt/with-temp [:model/Card card {:dataset_query (one-table-query)}]
          (let [plain  (-> (lib/query mp (lib.metadata/card mp (:id card)))
                           (lib/limit 1))
                joined (-> (lib/query mp (lib.metadata/card mp (:id card)))
                           (lib/join (lib/join-clause (lib.metadata/table mp (mt/id :categories))
                                                      [(lib/= (lib.metadata/field mp (mt/id :venues :category_id))
                                                              (lib.metadata/field mp (mt/id :categories :id)))]))
                           (lib/limit 1))]
            (preprocess-app-db-call-count plain)
            (is (= (preprocess-app-db-call-count plain)
                   (preprocess-app-db-call-count joined)))))))))
