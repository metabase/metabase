(ns metabase.measures.models.measure-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.measures.models.measure :as measure]
   [metabase.models.interface :as mi]
   [metabase.permissions.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group-membership :as perms-group-membership]
   [metabase.request.session :as session]
   [metabase.serialization.core :as serialization]
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

(deftest insert-measure-referencing-missing-measure-test
  (testing "Inserting a measure that references a non-existent measure should fail"
    (is (thrown-with-msg?
         Exception
         #"does not exist"
         (first (measure/create-measures! [{:name       "Bad Measure"
                                            :creator_id (mt/user->id :rasta)
                                            :definition (measure-definition [:measure {:lib/uuid (str (random-uuid))} Integer/MAX_VALUE])}]))))
    (is (not (t2/exists? :model/Measure :name "Bad Measure")))))

(deftest insert-measure-referencing-measure-test
  (testing "Inserting a measure that references an existing measure should succeed"
    (mt/with-temp [:model/Measure {measure-1-id :id} {:name "Measure 1"
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-definition (lib/count))}
                   :model/Measure measure-2 {:name "Measure 2"
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
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-definition (lib/count))}]
      (is (thrown-with-msg?
           Exception
           #"does not exist"
           (measure/update-measures! [measure-id] {:definition (measure-definition-referencing 99999)})))))
  (testing "Updating a measure to reference itself should fail"
    (mt/with-temp [:model/Measure {measure-id :id} {:name "Measure"
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-definition (lib/count))}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (measure/update-measures! [measure-id] {:definition (measure-definition-referencing measure-id)})))))
  (testing "Updating a measure to create an indirect cycle should fail"
    (mt/with-temp [:model/Measure {measure-1-id :id} {:name "Measure 1"
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-definition (lib/count))}
                   :model/Measure {measure-2-id :id} {:name "Measure 2"
                                                      :creator_id (mt/user->id :rasta)
                                                      :definition (measure-definition-referencing measure-1-id)}]
      (is (thrown-with-msg?
           Exception
           #"[Cc]ycle"
           (measure/update-measures! [measure-1-id] {:definition (measure-definition-referencing measure-2-id)}))))))

;;; ------------------------------------------------ Metric Reference Tests ------------------------------------------------

;; TODO (Chris 2026-10-26) -- these tests fail.
;; They used to sit inside `update-measure-cycle-detection-test`, so they never ran.
;; Since #79521, `::lib.schema.measure/definition` reports every specific stage error, such as
;; "Measures cannot reference metrics" or "cannot use :joins", as the generic "stages must be measure stages".
;; Fix the schema so the specific message comes through, then move the tests out of this `comment`.
(comment
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
                            :creator_id (mt/user->id :rasta)
                            ;; Metric nested in an arithmetic expression: metric + 1
                            :definition (measure-definition
                                         (lib/+ (lib.metadata/metric mp metric-id)
                                                1))})))))))
  (deftest update-measure-with-metric-reference-test
    (testing "Updating a measure to reference a metric should fail"
      (mt/with-temp [:model/Measure {measure-id :id} {:name "Good Measure"
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
               (t2/update! :model/Measure :id measure-id
                           {:definition (measure-definition (lib.metadata/metric mp metric-id))}))))))))

;;; ------------------------------------------------ MBQL4 Tests ------------------------------------------------
;;; The model accepts a full MBQL4 query and stores it normalized as MBQL5; anything that is not a full query is rejected.

(defn- legacy-count-query []
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues)
              :aggregation  [[:count]]}})

(deftest model-accepts-full-mbql4-on-insert-test
  (mt/with-model-cleanup [:model/Measure]
    (let [{:keys [id]} (t2/insert-returning-instance! :model/Measure
                                                      {:name       "Legacy Measure"
                                                       :creator_id (mt/user->id :rasta)
                                                       :definition (legacy-count-query)})
          measure      (t2/select-one :model/Measure :id id)]
      (is (= (mt/id :venues) (:table_id measure)))
      (is (= :mbql/query (:lib/type (:definition measure))))
      (is (= (mt/id :venues) (lib/primary-source-table-id (:definition measure)))))))

(deftest model-accepts-full-mbql4-on-update-test
  (mt/with-temp [:model/Measure {measure-id :id} {:name       "Good Measure"
                                                  :creator_id (mt/user->id :rasta)
                                                  :definition (measure-definition (lib/count))}]
    (t2/update! :model/Measure :id measure-id {:definition (legacy-count-query)})
    (let [measure (t2/select-one :model/Measure :id measure-id)]
      (is (= (mt/id :venues) (:table_id measure)))
      (is (= :mbql/query (:lib/type (:definition measure))))
      (is (= (mt/id :venues) (lib/primary-source-table-id (:definition measure)))))))

(deftest model-rejects-mbql4-fragment-test
  (testing "Insert"
    (is (thrown-with-msg?
         Exception
         #"Query must include :lib/type or :type"
         (t2/insert! :model/Measure
                     {:name       "Bad Measure"
                      :creator_id (mt/user->id :rasta)
                      :definition {:source-table (mt/id :venues)
                                   :aggregation  [[:count]]}}))))
  (testing "Update"
    (mt/with-temp [:model/Measure {measure-id :id} {:name       "Good Measure"
                                                    :creator_id (mt/user->id :rasta)
                                                    :definition (measure-definition (lib/count))}]
      (is (thrown-with-msg?
           Exception
           #"Query must include :lib/type or :type"
           (t2/update! :model/Measure :id measure-id
                       {:definition {:aggregation [[:count]]}}))))))

;;; ------------------------------------------------ Permission Tests ------------------------------------------------

(deftest can-write?-superuser-test
  (testing "Superusers can write measures"
    (mt/with-temp [:model/Measure measure {:name "Test Measure"
                                           :creator_id (mt/user->id :rasta)
                                           :definition (measure-definition (lib/count))}]
      (mt/with-test-user :crowberto
        (mt/with-premium-features #{:advanced-permissions}
          (is (true? (mi/can-write? (t2/hydrate measure :can_write)))))
        (testing "including without the advanced-permissions feature"
          (mt/with-premium-features #{}
            (is (true? (mi/can-write? (t2/hydrate measure :can_write))))))))))

(deftest can-write?-analyst-unrestricted-test
  (testing "Data analysts with unrestricted view-data can write measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {analyst-id :id} {:is_data_analyst true}
                     :model/Measure measure {:name "Test Measure"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (measure-definition (lib/count))}]
        (perms-group-membership/add-users-to-groups! [{:user analyst-id :group group-id}])
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
        (session/with-current-user analyst-id
          (mt/when-ee-evailable
           (mt/with-premium-features #{:advanced-permissions}
             (is (mi/can-write? (t2/hydrate measure :can_write)))))
          (testing "but not once the advanced-permissions feature is gone"
            (mt/with-premium-features #{}
              (is (not (mi/can-write? (t2/hydrate measure :can_write)))))))))))

(deftest can-write?-analyst-restricted-test
  (testing "Data analysts without unrestricted view-data cannot write measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/User {analyst-id :id} {:is_data_analyst true}
                     :model/Measure measure {:name "Test Measure"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (measure-definition (lib/count))}]
        (session/with-current-user analyst-id
          (is (false? (mi/can-write? (t2/hydrate measure :can_write)))))))))

(deftest can-write?-non-analyst-test
  (testing "Non-data-analysts cannot write measures"
    (mt/with-temp [:model/Measure measure {:name "Test Measure"
                                           :creator_id (mt/user->id :rasta)
                                           :definition (measure-definition (lib/count))}]
      (mt/with-test-user :rasta
        (is (false? (mi/can-write? (t2/hydrate measure :can_write))))))))

(deftest can-read?-superuser-test
  (testing "Superusers can read measures"
    (mt/with-temp [:model/Measure measure {:name "Test Measure"
                                           :creator_id (mt/user->id :rasta)
                                           :definition (measure-definition (lib/count))}]
      (mt/with-test-user :crowberto
        (is (true? (mi/can-read? (t2/hydrate measure :can_read))))))))

(deftest can-read?-with-view-data-and-query-builder-test
  (testing "Users with view-data :unrestricted and create-queries :query-builder can read measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/Measure measure {:name "Test Measure"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (measure-definition (lib/count))}]
        (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/create-queries :query-builder)
        (session/with-current-user user-id
          (is (true? (mi/can-read? (t2/hydrate measure :can_read)))))))))

(deftest can-read?-with-manage-table-metadata-test
  (testing "Users with manage-table-metadata :yes can read measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/Measure measure {:name "Test Measure"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (measure-definition (lib/count))}]
        (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/manage-table-metadata :yes)
        (session/with-current-user user-id
          (is (true? (mi/can-read? (t2/hydrate measure :can_read)))))))))

(deftest can-read?-without-permissions-test
  (testing "Users with no table permissions cannot read measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/User {user-id :id} {}
                     :model/Measure measure {:name "Test Measure"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (measure-definition (lib/count))}]
        (session/with-current-user user-id
          (is (false? (mi/can-read? (t2/hydrate measure :can_read)))))))))

(deftest can-read?-view-data-only-not-enough-test
  (testing "Users with only view-data :unrestricted (no query builder perms) cannot read measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {user-id :id} {}
                     :model/Measure measure {:name "Test Measure"
                                             :creator_id (mt/user->id :rasta)
                                             :definition (measure-definition (lib/count))}]
        (perms-group-membership/add-users-to-groups! [{:user user-id :group group-id}])
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
        (session/with-current-user user-id
          (is (false? (mi/can-read? (t2/hydrate measure :can_read)))))))))

(deftest can-create?-superuser-test
  (testing "Superusers can create measures"
    (mt/with-test-user :crowberto
      (is (true? (mi/can-create? :model/Measure {:name "Test Measure"
                                                 :definition (measure-definition (lib/count))}))))))

(deftest can-create?-analyst-unrestricted-test
  (testing "Data analysts with unrestricted view-data can create measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/User {analyst-id :id} {:is_data_analyst true}]
        (perms-group-membership/add-users-to-groups! [{:user analyst-id :group group-id}])
        (data-perms/set-table-permission! group-id (mt/id :venues) :perms/view-data :unrestricted)
        (session/with-current-user analyst-id
          (mt/when-ee-evailable
           (mt/with-premium-features #{:advanced-permissions}
             (is (true? (mi/can-create? :model/Measure {:name "Test Measure"
                                                        :definition (measure-definition (lib/count))})))))
          (testing "but not once the advanced-permissions feature is gone"
            (mt/with-premium-features #{}
              (is (false? (mi/can-create? :model/Measure {:name "Test Measure"
                                                          :definition (measure-definition (lib/count))}))))))))))

(deftest can-create?-analyst-restricted-test
  (testing "Data analysts without unrestricted view-data cannot create measures"
    (mt/with-no-data-perms-for-all-users!
      (mt/with-temp [:model/User {analyst-id :id} {:is_data_analyst true}]
        (session/with-current-user analyst-id
          (is (false? (mi/can-create? :model/Measure {:name "Test Measure"
                                                      :definition (measure-definition (lib/count))}))))))))

(deftest can-create?-non-analyst-test
  (testing "Non-data-analysts cannot create measures"
    (mt/with-test-user :rasta
      (is (false? (mi/can-create? :model/Measure {:name "Test Measure"
                                                  :definition (measure-definition (lib/count))}))))))

(deftest serialization-skips-computed-dimensions-test
  (testing "the dimensions of a measure are recomputed whenever it is read, so serialization carries none"
    (is (every? (set (:skip (serialization/spec :model/Measure))) [:dimensions :dimension_mappings]))))

(deftest update-measures-runs-fixed-statements-test
  (letfn [(archiving [n]
            (let [measures (doall (for [i (range n)]
                                    (first (measure/create-measures! [{:name (str "archived " i) :creator_id (mt/user->id :rasta)
                                                                       :definition (measure-definition (lib/count))}]))))
                  ids      (mapv :id measures)]
              (try
                (t2/with-call-count [call-count]
                  (measure/update-measures! ids {:archived true})
                  (call-count))
                (finally
                  (measure/delete-measures! ids)))))]
    (archiving 1)
    (is (= (archiving 2) (archiving 6)))))

(deftest update-measures-mixed-stored-state-test
  (mt/with-temp [:model/Measure {a :id} {:name "A" :archived true :creator_id (mt/user->id :rasta)
                                         :definition (measure-definition (lib/count))}
                 :model/Measure {b :id} {:name "B" :archived false :creator_id (mt/user->id :rasta)
                                         :definition (measure-definition (lib/count))}]
    (measure/update-measures! [a b] {:archived true :name "Same"})
    (is (= [[true "Same"] [true "Same"]]
           (mapv (juxt :archived :name) (t2/select :model/Measure :id [:in [a b]] {:order-by [:id]}))))))

(deftest update-measures-for-import-test
  (mt/with-temp [:model/Measure {a :id} {:name "A" :creator_id (mt/user->id :rasta) :definition (measure-definition (lib/count))}
                 :model/Measure {b :id} {:name "B" :creator_id (mt/user->id :rasta) :definition (measure-definition (lib/count))}]
    (measure/update-measures-for-import! [{:id a :name "A2"} {:id b :name "B2"}])
    (is (= ["A2" "B2"] (mapv :name (t2/select :model/Measure :id [:in [a b]] {:order-by [:id]}))))))

(deftest revert-goes-through-update-test
  (mt/with-temp [:model/Measure {id :id} {:name "Reverted" :creator_id (mt/user->id :rasta)
                                          :definition (measure-definition (lib/count))}]
    (let [snapshot (select-keys (t2/select-one :model/Measure :id id) [:name :description :definition :archived :table_id])]
      (measure/update-measures! [id] {:name "Changed"})
      (is (= "Changed" (t2/select-one-fn :name :model/Measure :id id)))
      (#'measure/revert-measure! id (mt/user->id :rasta) snapshot)
      (is (= "Reverted" (t2/select-one-fn :name :model/Measure :id id))))))

(deftest create-measures-with-different-key-sets-test
  (mt/with-model-cleanup [:model/Measure]
    (let [creator-id       (mt/user->id :rasta)
          [plain archived] (measure/create-measures! [{:name "Plain" :creator_id creator-id :definition (measure-definition (lib/count))}
                                                      {:name "Archived" :creator_id creator-id :definition (measure-definition (lib/count))
                                                       :archived true :description "Described"}])]
      (is (= ["Plain" "Archived"] (map :name [plain archived])))
      (is (=? {:archived false :description nil}
              (t2/select-one :model/Measure :id (:id plain))))
      (is (=? {:archived true :description "Described"}
              (t2/select-one :model/Measure :id (:id archived)))))))
