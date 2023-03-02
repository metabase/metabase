(ns metabase.models.action-test
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models :refer [Action Card Dashboard DashboardCard]]
   [metabase.models.action :as action]
   [metabase.test :as mt]
   [toucan.hydrate :refer [hydrate]]
   [toucan2.core :as t2]))

(deftest hydrate-query-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {:type :query}]
        (is (partial= {:id action-id
                       :name "Query Example"
                       :model_id model-id
                       :database_id (mt/id)
                       :parameters [{:id "id" :type :number}]}
                      (action/select-action :id action-id)))))))

(deftest hydrate-implicit-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id] :as _context} {:type :implicit}]
        (is (partial= {:id          action-id
                       :name        "Update Example"
                       :database_id (mt/id)
                       :parameters  [(if (= driver/*driver* :h2)
                                       {:type :type/BigInteger}
                                       {:type :type/Integer})
                                     {:type :type/Text, :id "name"}]}
                      (action/select-action :id action-id))))))
  (testing "Implicit actions do not map parameters to json fields (parents or nested)"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom :nested-field-columns)
      (mt/dataset json
        ;; maria does not support nested json. It just sees a text column named json_bit
        (when-not (and (= driver/*driver* :mysql)
                       (-> (mt/db) :dbms_version :flavor (= "MariaDB")))
          (mt/with-actions-enabled
            (mt/with-actions [{model-id :id} {:dataset true
                                              :dataset_query
                                              (mt/mbql-query json {:limit 2})}
                              {action-id :action-id} {:type :implicit}]
              (let [non-json-fields #{"id" "bloop"}
                    model-columns   (set/union
                                     non-json-fields
                                     #{"json_bit"
                                       "json_bit → 1234" "json_bit → 1234123412314"
                                       "json_bit → boop" "json_bit → doop" "json_bit → genres"
                                       "json_bit → noop" "json_bit → published" "json_bit → title"
                                       "json_bit → zoop" })]
                (is (= model-columns (t2/select-one-fn (comp set
                                                             (partial map :name)
                                                             :result_metadata)
                                                       Card :id model-id)))
                (is (= #{"id" "bloop"}
                       (->> (action/select-action :id action-id)
                            :parameters (map :id) set)))))))))))

(deftest hydrate-http-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id] :as _context} {:type :http}]
        (is (partial= {:id action-id
                       :name "Echo Example"
                       :parameters [{:id "id" :type :number}
                                    {:id "fail" :type :text}]}
                      (action/select-action :id action-id)))))))

(deftest hydrate-creator-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {}]
        (is (partial= {:id action-id
                       :name "Query Example"
                       :model_id model-id
                       :creator_id (mt/user->id :crowberto)
                       :creator {:common_name "Crowberto Corv"}
                       :parameters [{:id "id" :type :number}]}
                      (hydrate (action/select-action :id action-id) :creator)))))))

(deftest dashcard-deletion-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "Dashcards are deleted after actions are archived"
        (mt/with-actions [{:keys [action-id]} {}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:action_id action-id
                                                            :dashboard_id dashboard-id}]]
            (is (= 1 (t2/count DashboardCard :id dashcard-id)))
            (action/update! {:id action-id, :archived true} {:id action-id})
            (is (zero? (t2/count DashboardCard :id dashcard-id))))))
      (testing "Dashcards are deleted after actions are deleted entirely"
        (mt/with-actions [{:keys [action-id]} {}]
          (mt/with-temp* [Dashboard [{dashboard-id :id}]
                          DashboardCard [{dashcard-id :id} {:action_id action-id
                                                            :dashboard_id dashboard-id}]]
            (is (= 1 (t2/count DashboardCard :id dashcard-id)))
            (t2/delete! Action :id action-id)
            (is (zero? (t2/count DashboardCard :id dashcard-id)))))))))

(deftest create-update-select-implicit-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (mt/with-actions [{:keys [action-id]} {:type :implicit
                                             :kind "row/create"}]
        (testing "Insert new action"
          (let [action        (action/select-action :id action-id)
                new-id        (action/insert! (dissoc action :id :made_public_by_id :public_uuid :entity_id))
                cloned-action (action/select-action :id new-id)]
            (is (partial= {:kind "row/create"} cloned-action))))
        (testing "Update action"
          (let [action (action/select-action :id action-id)]
            ;; Update columns on both the action and the subtype table
            (action/update! (assoc action :name "New name" :kind "row/update") action)
            (let [new-action (action/select-action :id action-id)]
              (is (partial= {:name "New name"
                             :kind "row/update"} new-action)))))))))

(deftest model-to-saved-question-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "Actions are archived if their model is converted to a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (is (false? (t2/select-one-fn :archived Action action-id)))
          (t2/update! Card model-id {:dataset false})
          (is (true? (t2/select-one-fn :archived Action action-id)))))
      (testing "Actions can't be unarchived if their model is a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (t2/update! Card model-id {:dataset false})
          (is (thrown-with-msg?
               Exception
               #"Actions must be made with models, not cards"
               (t2/update! Action action-id {:archived false}))))))))
