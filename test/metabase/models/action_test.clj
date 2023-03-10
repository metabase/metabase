(ns metabase.models.action-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.models :refer [Action Card Dashboard DashboardCard]]
   [metabase.models.action :as action]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
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
                                       "json_bit → zoop"})]
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
      (testing "Non-implicit actions are archived if their model is converted to a saved question"
        (doseq [type [:http :query]]
          (mt/with-actions [{:keys [action-id model-id]} {:type type}]
            (is (false? (t2/select-one-fn :archived Action action-id)))
            (t2/update! Card model-id {:dataset false})
            (is (true? (t2/select-one-fn :archived Action action-id))))))
      (testing "Implicit actions are deleted if their model is converted to a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit}]
          (is (false? (t2/select-one-fn :archived Action action-id)))
          (t2/update! Card model-id {:dataset false})
          (is (false? (t2/exists? Action action-id)))))
      (testing "Actions can't be unarchived if their model is a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (t2/update! Card model-id {:dataset false})
          (is (thrown-with-msg?
               Exception
               #"Actions must be made with models, not cards"
               (t2/update! Action action-id {:archived false})))))
      ;; Ngoc: I know this seems like a silly test but we actually made a mistake
      ;; in the pre-update because `nil` is considered falsy. So have this test
      ;; here to make sure we don't made that mistake again
      (testing "Don't archive actions if updates a model dataset_query"
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (is (false? (t2/select-one-fn :archived Action action-id)))
          (t2/update! Card model-id {:dataset_query (mt/mbql-query users {:limit 1})})
          (is (false? (t2/select-one-fn :archived Action action-id))))))))

(deftest exclude-auto-increment-fields-for-create-implicit-actions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (doseq [kind ["row/create" "row/update" "row/delete"]]
        (testing (format "for implicit action with kind=%s we should %s include auto incremented fields"
                         kind (if (= "row/create" kind) "not" ""))
          (mt/with-actions [{:keys [action-id]} {:type :implicit
                                                 :kind kind}]
            (let [parameters (:parameters (action/select-action :id action-id))
                  id-parameter (first (filter #(= "id" (:id %)) parameters))]
              (if (= "row/create" kind)
                (is (nil? id-parameter))
                (is (some? id-parameter))))))))))

(deftest exclude-non-required-pks-from-create-implicit-action
  (one-off-dbs/with-blank-db
    (doseq [statement [;; H2 needs that 'guest' user for QP purposes. Set that up
                       "CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                       ;; Keep DB open until we say otherwise :)
                       "SET DB_CLOSE_DELAY -1;"
                       ;; create table & load data
                       "DROP TABLE IF EXISTS \"uuid_test\";"
                       "CREATE TABLE \"DEFAULT_UUID\" (\"uuid\" UUID DEFAULT RANDOM_UUID() PRIMARY KEY)"
                       "CREATE TABLE \"REQUIRED_UUID\" (\"uuid\" UUID PRIMARY KEY);"
                       "GRANT ALL ON \"DEFAULT_UUID\" TO GUEST;"
                       "GRANT ALL ON \"REQUIRED_UUID\" TO GUEST;"]]
      (jdbc/execute! one-off-dbs/*conn* [statement]))
    (sync/sync-database! (mt/db))
    (testing "make sure we synced the fields correctly"
      (is (= [{:database_is_auto_increment false
               :database_required          false
               :database_type              "UUID"
               :name                       "uuid"
               :semantic_type              :type/PK}]
             (t2/select ['Field :name :database_type :database_required :database_is_auto_increment :semantic_type]
                        :table_id (mt/id :default_uuid))))
      (is (= [{:database_is_auto_increment false
               :database_required          true
               :database_type              "UUID"
               :name                       "uuid"
               :semantic_type              :type/PK}]
             (t2/select ['Field :name :database_type :database_required :database_is_auto_increment :semantic_type]
                        :table_id (mt/id :required_uuid)))))
    (mt/with-actions-enabled
      (testing "PK with a default should be excluded from implicit create action parameters"
        (mt/with-actions [_                      {:dataset true :dataset_query (mt/mbql-query default_uuid)}
                          {create-id :action-id} {:type :implicit
                                                  :kind "row/create"}
                          {delete-id :action-id} {:type :implicit
                                                  :kind "row/delete"}
                          {update-id :action-id} {:type :implicit
                                                  :kind "row/update"}]
          (doseq [[action-id pred] [[create-id nil?]
                                    [update-id some?]
                                    [delete-id some?]]]
            (is (pred (->> (action/select-action :id action-id)
                           :parameters
                           (filter #(= "uuid" (:id %)))
                           first))))))
      (testing "PK without a default should be included in the parameters for all implicit action types"
        (mt/with-actions [_                      {:dataset true :dataset_query (mt/mbql-query required_uuid)}
                          {create-id :action-id} {:type :implicit
                                                  :kind "row/create"}
                          {delete-id :action-id} {:type :implicit
                                                  :kind "row/delete"}
                          {update-id :action-id} {:type :implicit
                                                  :kind "row/update"}]
          (doseq [action-id [create-id update-id delete-id]]
            (is (some? (->> (action/select-action :id action-id)
                            :parameters
                            (filter #(= "uuid" (:id %))))))))))))
