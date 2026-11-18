(ns metabase.segments.models.segment-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.segments.models.segment-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
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
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                (lib/> (lib.metadata/field mp (mt/id :venues :price)) 2))))

(defn- segment-filter-definition
  "A full query on `table-id` filtered by the Segment with `segment-id`."
  [table-id segment-id]
  (let [mp (mt/metadata-provider)]
    (lib/filter (lib/query mp (lib.metadata/table mp table-id))
                [:segment {:lib/uuid (str (random-uuid))} segment-id])))

(defn- set-stored-definition!
  "Overwrites the stored definition of the Segment with `id` with the JSON of `definition`, written to the table without the model hooks."
  [id definition]
  (t2/query-one {:update :segment
                 :set    {:definition (json/encode definition)}
                 :where  [:= :id id]}))

(deftest stored-fragment-definition-reads-as-empty-map-test
  (testing "A stored MBQL 4 fragment is not upgraded on read: it reads back as an empty map without throwing"
    (mt/with-temp [:model/Segment {segment-id :id} {}]
      (set-stored-definition! segment-id {:filter [:= [:field-id 1] 2]
                                          :aggregation [[:count]]})
      (is (= {} (:definition (t2/select-one :model/Segment :id segment-id)))))))

(deftest dont-explode-on-way-out-from-db-test
  (testing "`segment-definition`s should avoid explosions coming out of the DB..."
    (testing "invalid data should be read as an empty map"
      (mt/with-temp [:model/Segment {segment-id :id} {}]
        (set-stored-definition! segment-id {:filter "X"})
        (is (= {} (:definition (t2/select-one :model/Segment :id segment-id)))))))
  (testing "...but should still throw them on insert"
    (is (thrown? Exception
                 (t2/insert! :model/Segment {:name "Bad Segment"
                                             :definition {:filter "X"}})))))

(deftest update-test
  (testing "Updating"
    (mt/with-temp [:model/Segment {:keys [id]} {:creator_id (mt/user->id :rasta)}]
      (testing "you should not be able to change the creator_id of a Segment"
        (is (thrown-with-msg?
             Exception
             #"You cannot change the creator of a Segment"
             (t2/update! :model/Segment :id id {:creator_id (mt/user->id :crowberto)}))))
      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             Exception
             #"You cannot change the creator of a Segment"
             (t2/update! :model/Segment :id id {:creator_id nil}))))
      (testing "calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= 0
               (t2/update! :model/Segment :id id {:creator_id (mt/user->id :rasta)})))))))

(deftest definition-description-missing-definition-test
  (testing "Do not hydrate definition description if definition is nil"
    (mt/with-temp [:model/Segment {id :id} {:name "Segment"}]
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

(deftest ^:synchronized definition-description-invalid-query-test
  (testing "Should return `nil` if query is invalid"
    (mt/with-temp [:model/Segment {id :id} {:name "Expensive BBQ Spots"}]
      (set-stored-definition! id {:filter [:= [:wheat-field Integer/MAX_VALUE nil] 4]})
      (is (nil? (-> (t2/select-one :model/Segment :id id)
                    (t2/hydrate :definition_description)
                    :definition_description))))))

(deftest insert-segment-referencing-missing-segment-test
  (testing "Inserting a segment that references a non-existent segment should fail"
    (is (thrown-with-msg?
         Exception
         #"does not exist"
         (t2/insert! :model/Segment {:name       "Bad Segment"
                                     :creator_id (mt/user->id :rasta)
                                     :definition (segment-filter-definition (mt/id :venues) Integer/MAX_VALUE)})))
    (is (not (t2/exists? :model/Segment :name "Bad Segment")))))

(deftest insert-segment-referencing-segment-test
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
