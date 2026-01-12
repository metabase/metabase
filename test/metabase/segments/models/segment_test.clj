(ns metabase.segments.models.segment-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel normalize-metric-segment-definition-test
  (testing "Legacy Segment definitions should get normalized to MBQL 5"
    (testing "MBQL 4 fragment input"
      (mt/with-temp [:model/Segment segment {:table_id (mt/id :venues)
                                             :definition {:filter [:=
                                                                   [:field-id 1]
                                                                   [:datetime-field [:field-id 2] :month]]}}]
        (let [loaded-segment (t2/select-one :model/Segment :id (:id segment))
              definition (:definition loaded-segment)]
          (testing "should convert to full MBQL 5 query"
            (is (=? {:lib/type :mbql/query
                     :database (mt/id)
                     :stages [{:lib/type :mbql.stage/mbql
                               :source-table (mt/id :venues)
                               :filters [[:= {} [:field {} 1] [:field {:temporal-unit :month} 2]]]}]}
                    definition))))))
    (testing "MBQL 4 fragment with aggregation should strip aggregation"
      (mt/with-temp [:model/Segment segment {:table_id (mt/id :venues)
                                             :definition {:filter [:= [:field-id 1] 2]
                                                          :aggregation [[:count]]}}]
        (let [loaded-segment (t2/select-one :model/Segment :id (:id segment))
              definition (:definition loaded-segment)]
          (testing "should convert to MBQL 5 without aggregation"
            (is (=? {:lib/type :mbql/query
                     :database (mt/id)
                     :stages [{:lib/type :mbql.stage/mbql
                               :source-table (mt/id :venues)
                               :filters [[:= {} [:field {} 1] 2]]}]}
                    definition)))
          (testing "should not have aggregation in the stage"
            (is (not (contains? (first (:stages definition)) :aggregation)))))))))

(deftest dont-explode-on-way-out-from-db-test
  (testing "`segment-definition`s should avoid explosions coming out of the DB..."
    (testing "invalid data should be set to nil"
      ;; Direct DB insert to bypass validation
      (mt/with-temp [:model/Segment {segment-id :id} {:table_id (mt/id :venues)
                                                      :definition {:filter 1000}}]
        (t2/query-one {:update :segment
                       :set {:definition (json/encode {:filter "X"})}
                       :where [:= :id segment-id]})
        (is (= {}
               (:definition (t2/select-one :model/Segment :id segment-id)))))))
  (testing "...but should still throw them on insert"
    (is (thrown? Exception
                 (t2/insert! :model/Segment {:table_id (mt/id :venues)
                                             :name "Bad Segment"
                                             :definition {:filter "X"}})))))

(deftest update-test
  (testing "Updating"
    (mt/with-temp [:model/Segment {:keys [id]} {:creator_id (mt/user->id :rasta)
                                                :table_id (mt/id :venues)
                                                :definition {:filter 1000}}]
      (testing "you should not be able to change the creator_id of a Segment"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! :model/Segment id {:creator_id (mt/user->id :crowberto)}))))

      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! :model/Segment id {:creator_id nil}))))

      (testing "calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= 0
               (t2/update! :model/Segment id {:creator_id (mt/user->id :rasta)})))))))

(deftest identity-hash-test
  (testing "Segment hashes are composed of the segment name and table identity-hash"
    (let [now #t "2022-09-01T12:34:56Z"]
      (mt/with-temp [:model/Database db {:name "field-db" :engine :h2}
                     :model/Table table {:schema "PUBLIC" :name "widget" :db_id (:id db)}
                     :model/Segment segment {:name "big customers" :table_id (:id table) :created_at now
                                             :definition {:filter 1000}}]
        (is (= "be199b7c"
               (serdes/raw-hash ["big customers" (serdes/identity-hash table) (:created_at segment)])
               (serdes/identity-hash segment)))))))

(deftest definition-description-missing-definition-test
  (testing "Do not hydrate definition description if definition is nil"
    (mt/with-temp [:model/Segment {id :id} {:name "Segment"
                                            :table_id (mt/id :users)}]
      (is (nil? (-> (t2/select-one :model/Segment id)
                    (t2/hydrate :definition_description)
                    :definition_description))))))

(deftest ^:parallel definition-description-test
  (mt/with-temp [:model/Segment segment {:name "Expensive BBQ Spots"
                                         :definition (:query (mt/mbql-query venues
                                                               {:filter
                                                                [:and
                                                                 [:= $price 4]
                                                                 [:= $category_id->categories.name "BBQ"]]}))}]
    (is (= "Filtered by Price is equal to 4 and Category → Name is BBQ"
           (:definition_description (t2/hydrate segment :definition_description))))
    (testing "Segments that reference other Segments (inception)"
      (mt/with-temp [:model/Segment segment-2 {:name "Segment 2"
                                               :definition (:query (mt/mbql-query categories
                                                                     {:filter
                                                                      [:and
                                                                       [:segment (:id segment)]
                                                                       [:not-null $id]]}))}]
        (is (= "Filtered by Expensive BBQ Spots and ID is not empty"
               (:definition_description (t2/hydrate segment-2 :definition_description))))))))

(deftest ^:parallel definition-description-missing-source-table-test
  (testing "Should work if `:definition` does not include `:source-table`"
    (mt/with-temp [:model/Segment segment {:name "Expensive BBQ Spots"
                                           :definition (mt/$ids venues
                                                         {:filter
                                                          [:= $price 4]})}]
      (is (= "Filtered by Price is equal to 4"
             (:definition_description (t2/hydrate segment :definition_description)))))))

(deftest ^:synchronized definition-description-invalid-query-test
  (testing "Should return `nil` if query is invalid"
    (mt/with-temp [:model/Segment {id :id} {:name "Expensive BBQ Spots"
                                            :definition (:query (mt/mbql-query venues
                                                                  {:filter 1000}))}]
      (t2/query-one {:update :segment
                     :set {:definition (json/encode {:filter
                                                     [:= [:wheat-field Integer/MAX_VALUE nil] 4]})}
                     :where [:= :id id]})
      (is (nil? (-> (t2/select-one :model/Segment id)
                    (t2/hydrate :definition_description)
                    :definition_description))))))

(deftest insert-segment-cycle-detection-test
  (testing "Inserting a segment that references a non-existent segment should fail"
    (is (thrown-with-msg?
         Exception
         #"does not exist"
         (t2/insert! :model/Segment {:name "Bad Segment"
                                     :table_id (mt/id :venues)
                                     :definition {:filter [:segment 99999]}}))))
  (testing "Inserting a segment that references an existing segment should succeed"
    (mt/with-temp [:model/Segment {segment-1-id :id} {:name "Segment 1"
                                                      :table_id (mt/id :venues)
                                                      :definition {:filter [:> [:field (mt/id :venues :price) nil] 2]}}
                   :model/Segment segment-2          {:name "Segment 2"
                                                      :table_id (mt/id :venues)
                                                      :definition {:filter [:segment segment-1-id]}}]
      (is (some? (:id segment-2))))))

(deftest update-segment-cycle-detection-test
  (testing "Updating a segment to reference a non-existent segment should fail"
    (mt/with-temp [:model/Segment {segment-id :id} {:name "Segment"
                                                    :table_id (mt/id :venues)
                                                    :definition {:filter [:> [:field (mt/id :venues :price) nil] 2]}}]
      (is (thrown-with-msg?
           Exception
           #"does not exist"
           (t2/update! :model/Segment segment-id {:definition {:filter [:segment 99999]}})))))
  (testing "Updating a segment to reference itself should fail"
    (mt/with-temp [:model/Segment {segment-id :id} {:name "Segment"
                                                    :table_id (mt/id :venues)
                                                    :definition {:filter [:> [:field (mt/id :venues :price) nil] 2]}}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (t2/update! :model/Segment segment-id {:definition {:filter [:segment segment-id]}})))))
  (testing "Updating a segment to create an indirect cycle should fail"
    (mt/with-temp [:model/Segment {segment-1-id :id} {:name "Segment 1"
                                                      :table_id (mt/id :venues)
                                                      :definition {:filter [:> [:field (mt/id :venues :price) nil] 2]}}
                   :model/Segment {segment-2-id :id} {:name "Segment 2"
                                                      :table_id (mt/id :venues)
                                                      :definition {:filter [:segment segment-1-id]}}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (t2/update! :model/Segment segment-1-id {:definition {:filter [:segment segment-2-id]}}))))))
