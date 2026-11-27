(ns metabase.segments.models.segment-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.segments.models.segment-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.request.session :as session]
   [metabase.segments.models.segment :as segment]
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
  (t2/query-one {:update (t2/table-name :model/Segment)
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
         (first (segment/create-segments! [{:name       "Bad Segment"
                                            :creator_id (mt/user->id :rasta)
                                            :definition (segment-filter-definition (mt/id :venues) Integer/MAX_VALUE)}]))))
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
           (segment/update-segments! [{:id segment-id :definition (segment-filter-definition (mt/id :venues) 99999)}])))))
  (testing "Updating a segment to reference itself should fail"
    (mt/with-temp [:model/Segment {segment-id :id} {:name "Segment"
                                                    :definition (price-definition)}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (segment/update-segments! [{:id segment-id :definition (segment-filter-definition (mt/id :venues) segment-id)}])))))
  (testing "Updating a segment to create an indirect cycle should fail"
    (mt/with-temp [:model/Segment {segment-1-id :id} {:name "Segment 1"
                                                      :definition (price-definition)}
                   :model/Segment {segment-2-id :id} {:name "Segment 2"
                                                      :definition (segment-filter-definition (mt/id :venues) segment-1-id)}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (segment/update-segments! [{:id segment-1-id :definition (segment-filter-definition (mt/id :venues) segment-2-id)}]))))))

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
        (perms-group-membership/add-users-to-groups! [{:user analyst-id :group group-id}])
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
        (perms-group-membership/add-users-to-groups! [{:user analyst-id :group group-id}])
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

(deftest update-segments-runs-fixed-statements-test
  (letfn [(archiving [n]
            (let [segments (doall (for [i (range n)]
                                    (first (segment/create-segments! [{:name (str "archived " i) :creator_id (mt/user->id :rasta)
                                                                       :definition (price-definition)}]))))
                  ids      (mapv :id segments)]
              (try
                (t2/with-call-count [call-count]
                  (segment/update-segments! (mapv (fn [id] {:id id :archived true}) ids))
                  (call-count))
                (finally
                  (segment/delete-segments! ids)))))]
    (archiving 1)
    (is (= (archiving 2) (archiving 6)))))

(deftest update-segments-mixed-stored-state-test
  (mt/with-temp [:model/Segment {a :id} {:name "A" :archived true :definition (price-definition)}
                 :model/Segment {b :id} {:name "B" :archived false :definition (price-definition)}]
    (segment/update-segments! (mapv (fn [id] {:id id :archived true :name "Same"}) [a b]))
    (is (= [[true "Same"] [true "Same"]]
           (mapv (juxt :archived :name) (t2/select :model/Segment :id [:in [a b]] {:order-by [:id]}))))))

(deftest update-segments-for-import-test
  (mt/with-temp [:model/Segment {a :id} {:name "A" :definition (price-definition)}
                 :model/Segment {b :id} {:name "B" :definition (price-definition)}]
    (segment/update-segments! [{:id a :name "A2"} {:id b :name "B2"}] {:writer :import})
    (is (= ["A2" "B2"] (mapv :name (t2/select :model/Segment :id [:in [a b]] {:order-by [:id]}))))))

(deftest revert-goes-through-update-test
  (mt/with-temp [:model/Segment {id :id} {:name "Reverted" :definition (price-definition)}]
    (let [snapshot (select-keys (t2/select-one :model/Segment :id id) [:name :description :definition :archived :table_id
                                                                       :caveats :points_of_interest :show_in_getting_started])]
      (segment/update-segments! [{:id id :name "Changed"}])
      (is (= "Changed" (t2/select-one-fn :name :model/Segment :id id)))
      (#'segment/revert-segment! id (mt/user->id :rasta) snapshot)
      (is (= "Reverted" (t2/select-one-fn :name :model/Segment :id id))))))

(deftest create-segments-with-different-key-sets-test
  (mt/with-model-cleanup [:model/Segment]
    (let [creator-id           (mt/user->id :rasta)
          [plain archived]     (segment/create-segments! [{:name "Plain" :creator_id creator-id :definition (price-definition)}
                                                          {:name "Archived" :creator_id creator-id :definition (price-definition)
                                                           :archived true :caveats "Careful"}])]
      (is (= ["Plain" "Archived"] (map :name [plain archived])))
      (is (=? {:archived false :show_in_getting_started false :caveats nil}
              (t2/select-one :model/Segment :id (:id plain))))
      (is (=? {:archived true :show_in_getting_started false :caveats "Careful"}
              (t2/select-one :model/Segment :id (:id archived)))))))

(deftest can-query-needs-query-permissions-on-definition-test
  (mt/with-no-data-perms-for-all-users!
    (mt/with-temp [:model/User    {analyst-id :id} {:is_data_analyst true}
                   :model/Segment segment          {:name       "Test Segment"
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (price-definition)}]
      (mt/with-test-user :rasta
        (testing "no data permissions"
          (is (false? (mi/can-query? (t2/hydrate segment :can_query)))))
        (testing "view data with query builder permissions"
          (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                        :perms/create-queries :query-builder}
            (is (true? (mi/can-query? (t2/hydrate segment :can_query)))))))
      (mt/when-ee-evailable
       (mt/with-premium-features #{:advanced-permissions}
         (testing "data analyst who reads the Table by managing its metadata, without query permissions"
           (mt/with-db-perms-for-group! (perms-group/all-users) (mt/id) {:perms/view-data      :unrestricted
                                                                         :perms/create-queries :no}
             (session/with-current-user analyst-id
               (is (true? (mi/can-read? (t2/hydrate segment :can_read))))
               (is (false? (mi/can-query? (t2/hydrate segment :can_query))))))))))))
