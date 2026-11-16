(ns metabase.segments.models.segment-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.segments.models.segment-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.test-util :as measures.tu]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.request.session :as session]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- price-definition
  "A full query on venues filtered by price greater than 2."
  []
  (measures.tu/segment-definition (mt/id :venues) (mt/id :venues :price) 2))

(defn- segment-filter-definition
  "A full query on `table-id` filtered by the Segment with `segment-id`."
  [table-id segment-id]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                [:segment {:lib/uuid (str (random-uuid))} segment-id])))

(defn- set-stored-definition!
  "Overwrites the stored definition of the Segment with `id` with the JSON of `definition`, bypassing the model hooks."
  [id definition]
  (t2/query-one {:update :segment
                 :set    {:definition (json/encode definition)}
                 :where  [:= :id id]}))

(deftest ^:parallel normalize-metric-segment-definition-test
  (testing "Legacy Segment definitions should get normalized to MBQL 5"
    (testing "MBQL 4 fragment input"
      (mt/with-temp [:model/Segment segment {:table_id (mt/id :venues)}]
        (set-stored-definition! (:id segment) {:filter [:=
                                                        [:field-id 1]
                                                        [:datetime-field [:field-id 2] :month]]})
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
      (mt/with-temp [:model/Segment segment {:table_id (mt/id :venues)}]
        (set-stored-definition! (:id segment) {:filter [:= [:field-id 1] 2]
                                               :aggregation [[:count]]})
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
      (mt/with-temp [:model/Segment {segment-id :id} {:definition (price-definition)}]
        (set-stored-definition! segment-id {:filter "X"})
        (is (nil? (:definition (t2/select-one :model/Segment :id segment-id)))))))
  (testing "...but should still throw them on insert"
    (is (thrown? Exception
                 (t2/insert! :model/Segment {:table_id (mt/id :venues)
                                             :name "Bad Segment"
                                             :definition {:filter "X"}})))))

(deftest update-test
  (testing "Updating"
    (mt/with-temp [:model/Segment {:keys [id]} {:creator_id (mt/user->id :rasta)
                                                :definition (price-definition)}]
      (testing "you should not be able to change the creator_id of a Segment"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! :model/Segment :id id {:creator_id (mt/user->id :crowberto)}))))
      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Segment"
             (t2/update! :model/Segment :id id {:creator_id nil}))))
      (testing "calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= 0
               (t2/update! :model/Segment :id id {:creator_id (mt/user->id :rasta)})))))))

(deftest definition-description-missing-definition-test
  (testing "Do not hydrate definition description if definition is nil"
    (mt/with-temp [:model/Segment {id :id} {:name "Segment"
                                            :table_id (mt/id :users)}]
      (set-stored-definition! id {})
      (is (nil? (-> (t2/select-one :model/Segment :id id)
                    (t2/hydrate :definition_description)
                    :definition_description))))))

(defn- venues-query
  "A full query on venues."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(deftest ^:parallel definition-description-test
  (let [mp    (mt/metadata-provider)
        query (venues-query)
        cat-name (m/find-first #(= (:id %) (mt/id :categories :name)) (lib/filterable-columns query))]
    (mt/with-temp [:model/Segment segment {:name "Expensive BBQ Spots"
                                           :definition (-> query
                                                           (lib/filter (lib/= (lib.metadata/field mp (mt/id :venues :price)) 4))
                                                           (lib/filter (lib/= cat-name "BBQ")))}]
      (is (= "Filtered by Price is equal to 4 and Category → Name is BBQ"
             (:definition_description (t2/hydrate segment :definition_description))))
      (testing "Segments that reference other Segments (inception)"
        (mt/with-temp [:model/Segment segment-2 {:name "Segment 2"
                                                 :definition (-> (segment-filter-definition (mt/id :categories) (:id segment))
                                                                 (lib/filter (lib/not-null (lib.metadata/field mp (mt/id :categories :id)))))}]
          (is (= "Filtered by Expensive BBQ Spots and ID is not empty"
                 (:definition_description (t2/hydrate segment-2 :definition_description)))))))))

(deftest definition-description-missing-source-table-test
  (testing "Should work if stored `:definition` does not include `:source-table`"
    (mt/with-temp [:model/Segment segment {:name "Expensive BBQ Spots"
                                           :definition (price-definition)}]
      (set-stored-definition! (:id segment) (mt/$ids venues {:filter [:= $price 4]}))
      (is (= "Filtered by Price is equal to 4"
             (:definition_description (t2/hydrate (t2/select-one :model/Segment :id (:id segment))
                                                  :definition_description)))))))

(deftest ^:synchronized definition-description-invalid-query-test
  (testing "Should return `nil` if query is invalid"
    (mt/with-temp [:model/Segment {id :id} {:name "Expensive BBQ Spots"
                                            :definition (price-definition)}]
      (set-stored-definition! id {:filter [:= [:wheat-field Integer/MAX_VALUE nil] 4]})
      (is (nil? (-> (t2/select-one :model/Segment :id id)
                    (t2/hydrate :definition_description)
                    :definition_description))))))

(deftest insert-segment-cycle-detection-test
  (testing "Inserting a segment that references a non-existent segment should fail"
    (is (thrown-with-msg?
         Exception
         #"does not exist"
         (t2/insert! :model/Segment {:name "Bad Segment"
                                     :definition (segment-filter-definition (mt/id :venues) 99999)}))))
  (testing "Inserting a segment that references an existing segment should succeed"
    (mt/with-temp [:model/Segment {segment-1-id :id} {:name "Segment 1"
                                                      :definition (price-definition)}
                   :model/Segment segment-2          {:name "Segment 2"
                                                      :definition (segment-filter-definition (mt/id :venues) segment-1-id)}]
      (is (some? (:id segment-2))))))

(deftest update-segment-cycle-detection-test
  (testing "Updating a segment to reference a non-existent segment should fail"
    (mt/with-temp [:model/Segment {segment-id :id} {:name "Segment"
                                                    :definition (price-definition)}]
      (is (thrown-with-msg?
           Exception
           #"does not exist"
           (t2/update! :model/Segment :id segment-id {:definition (segment-filter-definition (mt/id :venues) 99999)})))))
  (testing "Updating a segment to reference itself should fail"
    (mt/with-temp [:model/Segment {segment-id :id} {:name "Segment"
                                                    :definition (price-definition)}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (t2/update! :model/Segment :id segment-id {:definition (segment-filter-definition (mt/id :venues) segment-id)})))))
  (testing "Updating a segment to create an indirect cycle should fail"
    (mt/with-temp [:model/Segment {segment-1-id :id} {:name "Segment 1"
                                                      :definition (price-definition)}
                   :model/Segment {segment-2-id :id} {:name "Segment 2"
                                                      :definition (segment-filter-definition (mt/id :venues) segment-1-id)}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (t2/update! :model/Segment :id segment-1-id {:definition (segment-filter-definition (mt/id :venues) segment-2-id)}))))))

;;; ------------------------------------------------ Permission Tests ------------------------------------------------

(deftest can-write?-superuser-test
  (testing "Superusers can write segments"
    (mt/with-temp [:model/Segment segment {:name "Test Segment"
                                           :creator_id (mt/user->id :rasta)
                                           :definition (price-definition)}]
      (mt/with-test-user :crowberto
        (mt/with-premium-features #{:advanced-permissions}
          (is (true? (mi/can-write? (t2/hydrate segment :can_write)))))
        (testing "including without the advanced-permissions feature"
          (mt/with-premium-features #{}
            (is (true? (mi/can-write? (t2/hydrate segment :can_write))))))))))

(deftest can-write?-analyst-unrestricted-test
  (testing "Data analysts with unrestricted view-data can write segments"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {analyst-id :id} {:is_data_analyst true}
                     :model/Segment segment {:name "Test Segment"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (price-definition)}]
        (perms/add-user-to-group! analyst-id group-id)
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
        (session/with-current-user analyst-id
          (mt/when-ee-evailable
           (mt/with-premium-features #{:advanced-permissions}
             (is (mi/can-write? (t2/hydrate segment :can_write)))))
          (testing "but not once the advanced-permissions feature is gone"
            (mt/with-premium-features #{}
              (is (not (mi/can-write? (t2/hydrate segment :can_write)))))))))))

(deftest can-write?-analyst-restricted-test
  (testing "Data analysts without unrestricted view-data cannot write segments"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/User {analyst-id :id} {:is_data_analyst true}
                     :model/Segment segment {:name "Test Segment"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (price-definition)}]
        (session/with-current-user analyst-id
          (is (false? (mi/can-write? (t2/hydrate segment :can_write)))))))))

(deftest can-write?-non-analyst-test
  (testing "Non-data-analysts cannot write segments"
    (mt/with-temp [:model/Segment segment {:name "Test Segment"
                                           :creator_id (mt/user->id :rasta)
                                           :definition (price-definition)}]
      (mt/with-test-user :rasta
        (is (false? (mi/can-write? (t2/hydrate segment :can_write))))))))

(deftest can-create?-superuser-test
  (testing "Superusers can create segments"
    (mt/with-test-user :crowberto
      (is (true? (mi/can-create? :model/Segment {:name "Test Segment"
                                                 :definition (price-definition)}))))))

(deftest can-create?-analyst-unrestricted-test
  (testing "Data analysts with unrestricted view-data can create segments"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {analyst-id :id} {:is_data_analyst true}]
        (perms/add-user-to-group! analyst-id group-id)
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
        (session/with-current-user analyst-id
          (mt/when-ee-evailable
           (mt/with-premium-features #{:advanced-permissions}
             (is (true? (mi/can-create? :model/Segment {:name       "Test Segment"
                                                        :definition (price-definition)})))))
          (testing "but not once the advanced-permissions feature is gone"
            (mt/with-premium-features #{}
              (is (false? (mi/can-create? :model/Segment {:name       "Test Segment"
                                                          :definition (price-definition)}))))))))))

(deftest can-create?-analyst-restricted-test
  (testing "Data analysts without unrestricted view-data cannot create segments"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/User {analyst-id :id} {:is_data_analyst true}]
        (session/with-current-user analyst-id
          (is (false? (mi/can-create? :model/Segment {:name "Test Segment"
                                                      :definition (price-definition)}))))))))

(deftest can-create?-non-analyst-test
  (testing "Non-data-analysts cannot create segments"
    (mt/with-test-user :rasta
      (is (false? (mi/can-create? :model/Segment {:name "Test Segment"
                                                  :definition (price-definition)}))))))
