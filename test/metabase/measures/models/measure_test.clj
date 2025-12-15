(ns metabase.measures.models.measure-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
           (t2/update! :model/Measure measure-1-id {:definition (measure-definition-referencing measure-2-id)}))))))
