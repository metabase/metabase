(ns metabase.measures.models.measure-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- measure-definition
  "Create an MBQL5 measure definition with the given aggregation clause.
   Uses lib/aggregate to create a proper MBQL5 query."
  [aggregation-clause]
  (let [mp (mt/metadata-provider)
        table-metadata (lib.metadata/table mp (mt/id :venues))]
    (-> (lib/query mp table-metadata)
        (lib/aggregate aggregation-clause))))

(deftest insert-measure-cycle-detection-test
  (testing "Inserting a measure that references an existing measure should succeed"
    (mt/with-temp [:model/Measure {measure-1-id :id} {:name "Measure 1"
                                                      :table_id (mt/id :venues)
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-definition (lib/count))}
                   :model/Measure measure-2 {:name "Measure 2"
                                             :table_id (mt/id :venues)
                                             :creator_id (mt/user->id :rasta)
                                             :definition (-> (mt/metadata-provider)
                                                             (lib.metadata/measure measure-1-id)
                                                             measure-definition)}]
      (is (some? (:id measure-2))))))

(defn- measure-definition-referencing
  "Create a measure definition that references another measure by ID."
  [referenced-measure-id]
  (measure-definition [:measure {:lib/uuid (str (random-uuid))} referenced-measure-id]))

(deftest identity-hash-test
  (testing "Measure hashes are composed of the measure name and table identity-hash"
    (let [now #t "2022-09-01T12:34:56Z"]
      (mt/with-temp [:model/Database db {:name "field-db" :engine :h2}
                     :model/Table table {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                     :model/Measure measure {:name "total sales" :table_id (:id table) :created_at now
                                             :definition (measure-definition (lib/count))}]
        (is (= (serdes/raw-hash ["total sales" (serdes/identity-hash table) (:created_at measure)])
               (serdes/identity-hash measure)))))))

(deftest update-measure-cycle-detection-test
  (testing "Updating a measure to reference a non-existent measure should fail"
    (mt/with-temp [:model/Measure {measure-id :id} {:name "Measure"
                                                    :table_id (mt/id :venues)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-definition (lib/count))}]
      (is (thrown-with-msg?
           Exception
           #"does not exist"
           (t2/update! :model/Measure measure-id {:definition (measure-definition-referencing 99999)})))))
  (testing "Updating a measure to reference itself should fail"
    (mt/with-temp [:model/Measure {measure-id :id} {:name "Measure"
                                                    :table_id (mt/id :venues)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-definition (lib/count))}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (t2/update! :model/Measure measure-id {:definition (measure-definition-referencing measure-id)})))))
  (testing "Updating a measure to create an indirect cycle should fail"
    (mt/with-temp [:model/Measure {measure-1-id :id} {:name "Measure 1"
                                                      :table_id (mt/id :venues)
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-definition (lib/count))}
                   :model/Measure {measure-2-id :id} {:name "Measure 2"
                                                      :table_id (mt/id :venues)
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-definition-referencing measure-1-id)}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (t2/update! :model/Measure measure-1-id {:definition (measure-definition-referencing measure-2-id)})))))

;;; ------------------------------------------------ Metric Reference Tests ------------------------------------------------

  (defn- metric-query
    "Create a metric-style dataset query (a query with a single aggregation)."
    []
    (measure-definition (lib/count)))

  (deftest insert-measure-with-metric-reference-test
    (testing "Inserting a measure that references a metric should fail"
      (mt/with-temp [:model/Card {metric-id :id} {:name "Test Metric"
                                                  :type :metric
                                                  :database_id (mt/id)
                                                  :table_id (mt/id :venues)
                                                  :dataset_query (metric-query)}]
        (let [mp (mt/metadata-provider)]
          (is (thrown-with-msg?
               Exception
               #"[Mm]easures cannot reference metrics"
               (t2/insert! :model/Measure
                           {:name "Bad Measure"
                            :table_id (mt/id :venues)
                            :creator_id (mt/user->id :rasta)
                            :definition (measure-definition (lib.metadata/metric mp metric-id))})))))))

  (deftest insert-measure-with-nested-metric-reference-test
    (testing "Inserting a measure with metric nested in arithmetic expression should fail"
      (mt/with-temp [:model/Card {metric-id :id} {:name "Test Metric"
                                                  :type :metric
                                                  :database_id (mt/id)
                                                  :table_id (mt/id :venues)
                                                  :dataset_query (metric-query)}]
        (let [mp (mt/metadata-provider)]
          (is (thrown-with-msg?
               Exception
               #"[Mm]easures cannot reference metrics"
               (t2/insert! :model/Measure
                           {:name "Bad Measure"
                            :table_id (mt/id :venues)
                            :creator_id (mt/user->id :rasta)
                          ;; Metric nested in an arithmetic expression: metric + 1
                            :definition (measure-definition
                                         (lib/+ (lib.metadata/metric mp metric-id)
                                                1))})))))))

  (deftest update-measure-with-metric-reference-test
    (testing "Updating a measure to reference a metric should fail"
      (mt/with-temp [:model/Measure {measure-id :id} {:name "Good Measure"
                                                      :table_id (mt/id :venues)
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-definition (lib/count))}
                     :model/Card {metric-id :id} {:name "Test Metric"
                                                  :type :metric
                                                  :database_id (mt/id)
                                                  :table_id (mt/id :venues)
                                                  :dataset_query (metric-query)}]
        (let [mp (mt/metadata-provider)]
          (is (thrown-with-msg?
               Exception
               #"[Mm]easures cannot reference metrics"
               (t2/update! :model/Measure measure-id
                           {:definition (measure-definition (lib.metadata/metric mp metric-id))}))))))))

;;; ------------------------------------------------ MBQL4 Rejection Tests ------------------------------------------------
;;; The model layer should only accept MBQL5 definitions. MBQL4 conversion still happens at the API/serdes layer.

(deftest model-rejects-mbql4-on-insert-test
  (testing "Model layer should reject MBQL4 definitions on insert"
    (testing "MBQL4 fragment"
      (is (thrown-with-msg?
           Exception
           #"Invalid measure definition"
           (t2/insert! :model/Measure
                       {:name "Bad Measure"
                        :table_id (mt/id :venues)
                        :creator_id (mt/user->id :rasta)
                        :definition {:source-table (mt/id :venues)
                                     :aggregation [[:count]]}}))))
    (testing "MBQL4 full query"
      (is (thrown-with-msg?
           Exception
           #"Invalid measure definition"
           (t2/insert! :model/Measure
                       {:name "Bad Measure"
                        :table_id (mt/id :venues)
                        :creator_id (mt/user->id :rasta)
                        :definition {:database (mt/id)
                                     :type :query
                                     :query {:source-table (mt/id :venues)
                                             :aggregation [[:count]]}}}))))))

(deftest model-rejects-mbql4-on-update-test
  (testing "Model layer should reject MBQL4 definitions on update"
    (mt/with-temp [:model/Measure {measure-id :id} {:name "Good Measure"
                                                    :table_id (mt/id :venues)
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-definition (lib/count))}]
      (testing "MBQL4 fragment"
        (is (thrown-with-msg?
             Exception
             #"Invalid measure definition"
             (t2/update! :model/Measure measure-id
                         {:definition {:source-table (mt/id :venues)
                                       :aggregation [[:count]]}}))))
      (testing "MBQL4 full query"
        (is (thrown-with-msg?
             Exception
             #"Invalid measure definition"
             (t2/update! :model/Measure measure-id
                         {:definition {:database (mt/id)
                                       :type :query
                                       :query {:source-table (mt/id :venues)
                                               :aggregation [[:count]]}}})))))))
