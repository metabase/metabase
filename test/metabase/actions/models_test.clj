(ns ^:mb/driver-tests metabase.actions.models-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.actions.models-test]}}}}}}
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.actions.models :as action]
   [metabase.actions.schema :as actions.schema]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest hydrate-query-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id] :as _context} {:type :query}]
        (is (partial= {:id action-id
                       :name "Query Example"
                       :model_id nil
                       :database_id (mt/id)
                       :parameters [{:id "id" :type :number}]}
                      (action/select-action :id action-id)))))))

(deftest hydrate-implicit-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (let [query (mt/mbql-query categories)]
        (testing "Implicit actions parameters and visualization_settings should be hydrated from the query"
          (mt/with-actions [_model {:type            :model
                                    :dataset_query   query
                                    :result_metadata (assoc-in (vec (qp.preprocess/query->expected-cols (mt/mbql-query categories)))
                                                               [1 :display_name] "Display Name")}
                            {:keys [action-id] :as _context} {:type :implicit}]
            (is (=? {:id                     action-id
                     :name                   "Update Example"
                     :database_id            (mt/id)
                     :parameters             [{:type         :number
                                               :id           "id"
                                               :display-name "ID"}
                                              {:type         :text
                                               :id           "name"
                                               :display-name "Display Name"}]
                     :visualization_settings {:fields {"id"   {:description  nil
                                                               :placeholder  "ID"
                                                               :title        "ID"
                                                               :hidden       false
                                                               :id           "id"
                                                               :display_name "ID"
                                                               :inputType    :number
                                                               :base_type    #(isa? % :type/Integer)
                                                               :fieldType    :number
                                                               :required     true
                                                               :order        0}
                                                       "name" {:description  nil
                                                               :placeholder  "Name"
                                                               :title        "Name"
                                                               :hidden       false
                                                               :id           "name"
                                                               :display_name "Name"
                                                               :inputType    :string
                                                               :base_type    :type/Text
                                                               :fieldType    :string
                                                               :required     true
                                                               :order        1}}}}
                    (action/select-action :id action-id)))))))))

(deftest hydrate-implicit-action-test-1a
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (let [query (mt/mbql-query categories)]
        (testing "for implicit actions visualization_settings.fields, "
          (mt/with-actions [_model {:type            :model
                                    :dataset_query   query
                                    :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query categories))}
                            {:keys [action-id] :as _context} {:type :implicit
                                                              :visualization_settings {:fields {"doesnt_exist" {:id     "doesnt_exist"
                                                                                                                :hidden false}
                                                                                                "id"           {:id     "id"
                                                                                                                :hidden true}}}}]
            (let [field-settings (get-in (action/select-action :id action-id) [:visualization_settings :fields])]
              (testing "an existing entry should not update if there's a matching parameter"
                (is (=? {:id     "id"
                         :hidden true}
                        (get field-settings "id"))))
              (testing "an existing entry should be deleted if there's not a matching parameter"
                (is (not (contains? field-settings "doesnt_exist"))))
              (testing "a entry with defaults should be created if there is a new matching parameter"
                (is (=? {:id "name"
                         :hidden false}
                        (get field-settings "name")))))))))))

(deftest hydrate-implicit-action-test-2
  (testing "Implicit actions do not map parameters to json fields (parents or nested)"
    (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom :nested-field-columns)
      (mt/dataset json
        ;; maria does not support nested json. It just sees a text column named json_bit
        (when-not (and (= driver/*driver* :mysql)
                       (mysql/mariadb? (mt/db)))
          (mt/with-actions-enabled
            (mt/with-actions [{model-id :id} {:type :model
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
                                                       :model/Card :id model-id)))
                (is (= #{"id" "bloop"}
                       (->> (action/select-action :id action-id)
                            :parameters (map :id) set)))))))))))

(deftest hydrate-implicit-action-test-3
  (testing "Implicit actions do not map parameters to binary fields, the same way JSON fields are excluded"
    (mt/test-driver :postgres
      (mt/dataset (mt/dataset-definition
                   "binary-field-dataset"
                   [["binary_table"
                     [{:field-name "name", :base-type :type/Text}
                      {:field-name "bytea_col", :base-type {:native "bytea"}, :effective-type :type/*}]
                     [["Row One" (byte-array [0 1])]
                      ["Row Two" (byte-array [2 3])]]]])
        (mt/with-actions-enabled
          (mt/with-actions [_ {:type :model :dataset_query (mt/mbql-query binary_table)}
                            {action-id :action-id} {:type :implicit}]
            (let [parameter-ids (->> (action/select-action :id action-id) :parameters (map :id) set)]
              (testing "the non-binary column is still a valid parameter"
                (is (contains? parameter-ids "name")))
              (testing "the binary column is excluded"
                (is (not (contains? parameter-ids "bytea_col")))))))))))

(deftest hydrate-creator-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [action-id] :as _context} {}]
        (is (partial= {:id action-id
                       :name "Query Example"
                       :model_id nil
                       :creator_id (mt/user->id :crowberto)
                       :creator {:common_name "Crowberto Corv"}
                       :parameters [{:id "id" :type :number}]}
                      (t2/hydrate (action/select-action :id action-id) :creator)))))))

(deftest hydrate-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {:type :implicit}]
        (let [action (t2/hydrate (action/select-action :id action-id) :model)]
          (is (some? (:model action)))
          (is (= (:id (:model action)) model-id)))))))

(deftest dashcard-deletion-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "Dashcards are deleted after actions are archived"
        (mt/with-actions [{:keys [action-id]} {}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:action_id action-id
                                                                 :dashboard_id dashboard-id}]
            (is (= 1 (t2/count :model/DashboardCard :id dashcard-id)))
            (action/update! {:id action-id, :archived true} (action/select-action :id action-id))
            (is (zero? (t2/count :model/DashboardCard :id dashcard-id)))))))))

(deftest dashcard-deletion-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "Dashcards are deleted after actions are deleted entirely"
        (mt/with-actions [{:keys [action-id]} {}]
          (mt/with-temp [:model/Dashboard {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id} {:action_id action-id
                                                                 :dashboard_id dashboard-id}]
            (is (= 1 (t2/count :model/DashboardCard :id dashcard-id)))
            (t2/delete! :model/Action :id action-id)
            (is (zero? (t2/count :model/DashboardCard :id dashcard-id)))))))))

(deftest create-update-select-implicit-action-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (mt/with-actions [{:keys [action-id]} {:type :implicit
                                             :kind "row/create"}]
        (testing "Insert new action"
          (let [action        (action/select-action :id action-id)
                new-id        (action/insert! (dissoc action :id :made_public_by_id :public_uuid :entity_id))
                cloned-action (action/select-action :id new-id)]
            (is (partial= {:kind :row/create} cloned-action))))
        (testing "Update action"
          (let [action (action/select-action :id action-id)]
            ;; Update columns on both the action and the subtype table
            (action/update! (assoc action :name "New name" :kind :row/update) action)
            (let [new-action (action/select-action :id action-id)]
              (is (partial= {:name "New name"
                             :kind :row/update} new-action)))))))))

(deftest query-action-database-id-derived-from-query-test
  (mt/with-actions-enabled
    (mt/with-model-cleanup [:model/Action]
      (testing "insert! derives :database_id from the query's database"
        (let [action-id (action/insert! (lib/normalize ::actions.schema/action.for-insert
                                                       {:type          :query
                                                        :name          "derive db insert"
                                                        :database_id   Integer/MAX_VALUE   ; bogus; the query targets the test DB
                                                        :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})}))]
          (is (= (mt/id) (:database_id (action/select-action :id action-id))))))
      (testing "update! re-derives :database_id from the query"
        (let [action-id (action/insert! (lib/normalize ::actions.schema/action.for-insert
                                                       {:type          :query
                                                        :name          "derive db update"
                                                        :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})}))
              existing  (action/select-action :id action-id)]
          ;; a :database_id-only update can't repoint the action away from the query's database
          (action/update! {:id action-id, :database_id Integer/MAX_VALUE} existing)
          (is (= (mt/id) (:database_id (action/select-action :id action-id)))))))))

(deftest query-action-cannot-belong-to-a-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (mt/with-actions [{:keys [model-id action-id]} {:type :query}]
        (testing "a query action cannot be inserted with a model"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Only basic actions can belong to a model\."
                                (t2/insert! :model/Action {:type :query, :name "With model", :model_id model-id}))))
        (testing "a query action cannot be attached to a model"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Only basic actions can belong to a model\."
                                (t2/update! :model/Action action-id {:model_id model-id})))
          (is (nil? (t2/select-one-fn :model_id :model/Action :id action-id))))))))

(deftest query-action-without-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (testing "a query action can be inserted and updated without a model, and keeps its own collection"
      (mt/with-temp [:model/Collection {coll-id :id} {}]
        (mt/with-model-cleanup [:model/Action]
          (let [action-id (action/insert! (lib/normalize ::actions.schema/action.for-insert
                                                         {:type          :query
                                                          :name          "No model"
                                                          :collection_id coll-id
                                                          :database_id   (mt/id)
                                                          :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})}))]
            (is (=? {:model_id nil :collection_id coll-id :database_id (mt/id)}
                    (action/select-action :id action-id)))
            (action/update! {:id action-id :name "Renamed"} (action/select-action :id action-id))
            (is (=? {:name "Renamed" :model_id nil :collection_id coll-id}
                    (action/select-action :id action-id)))))))))

(deftest implicit-action-requires-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (testing "an implicit action cannot be inserted without a model"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"model_id"
                            (action/insert! {:type :implicit :name "No model" :kind :row/create}))))
    (testing "an implicit action cannot be detached from its model"
      (mt/with-actions-enabled
        (mt/with-actions [{:keys [action-id]} {:type :implicit :kind "row/create"}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"model_id"
                                (action/update! {:id action-id :model_id nil} (action/select-action :id action-id))))
          (is (some? (t2/select-one-fn :model_id :model/Action :id action-id))))))))

(deftest switching-to-implicit-checks-the-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "a query action cannot become implicit when its card is a question"
        (mt/with-temp [:model/Card {question-id :id} {:type :question :dataset_query (mt/mbql-query categories)}]
          (mt/with-model-cleanup [:model/Action]
            (let [action-id (action/insert! (lib/normalize ::actions.schema/action.for-insert
                                                           {:type          :query
                                                            :name          "On a question"
                                                            :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})}))]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Actions must be made with models, not cards"
                                    (action/update! {:id action-id :type :implicit :kind :row/update :model_id question-id}
                                                    (action/select-action :id action-id))))))))
      (testing "a query action cannot become implicit when its model has clauses"
        (mt/with-actions [_                             {:type :model :dataset_query (mt/mbql-query categories {:limit 1})}
                          {:keys [action-id model-id]} {:type :query}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not supported for models with clauses"
                                (action/update! {:id action-id :type :implicit :kind :row/update :model_id model-id}
                                                (action/select-action :id action-id)))))))))

(deftest model-to-saved-question-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "Query actions are left alone if their model is converted to a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {:type :query}]
          (t2/update! :model/Card model-id {:type :question})
          (is (= [false false] ((juxt :archived :archived_directly) (t2/select-one :model/Action :id action-id))))))
      (testing "Implicit actions are deleted if their model is converted to a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit}]
          (is (false? (t2/select-one-fn :archived :model/Action action-id)))
          (t2/update! :model/Card model-id {:type :question})
          (is (false? (t2/exists? :model/Action action-id))))))))

(deftest model-to-saved-question-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      ;; Ngoc: I know this seems like a silly test but we actually made a mistake
      ;; in the pre-update because `nil` is considered falsy. So have this test
      ;; here to make sure we don't made that mistake again
      (testing "Don't archive actions if updates a model dataset_query"
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (is (false? (t2/select-one-fn :archived :model/Action action-id)))
          (t2/update! :model/Card model-id {:dataset_query (mt/mbql-query users {:limit 1})})
          (is (false? (t2/select-one-fn :archived :model/Action action-id))))))))

(deftest exclude-auto-increment-fields-for-create-implicit-actions-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (doseq [kind [:row/create :row/update :row/delete]]
        (testing (format "for implicit action with kind=%s we should %s include auto incremented fields"
                         kind (if (= :row/create kind) "not" ""))
          (mt/with-actions [{:keys [action-id]} {:type :implicit
                                                 :kind kind}]
            (let [parameters (:parameters (action/select-action :id action-id))
                  id-parameter (first (filter #(= "id" (:id %)) parameters))]
              (if (= kind :row/create)
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
             (t2/select [:model/Field :name :database_type :database_required :database_is_auto_increment :semantic_type]
                        :table_id (mt/id :default_uuid))))
      (is (= [{:database_is_auto_increment false
               :database_required          true
               :database_type              "UUID"
               :name                       "uuid"
               :semantic_type              :type/PK}]
             (t2/select [:model/Field :name :database_type :database_required :database_is_auto_increment :semantic_type]
                        :table_id (mt/id :required_uuid)))))
    (mt/with-actions-enabled
      (testing "PK with a default should be excluded from implicit create action parameters"
        (mt/with-actions [_                      {:type :model :dataset_query (mt/mbql-query default_uuid)}
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
        (mt/with-actions [_                      {:type :model :dataset_query (mt/mbql-query required_uuid)}
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

(deftest updating-implicit-params-round-trip-test
  ;; See #39101
  (one-off-dbs/with-blank-db
    (doseq [statement ["CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                       "SET DB_CLOSE_DELAY -1;"
                       "CREATE TABLE \"FOO\" (\"id\" IDENTITY PRIMARY KEY, \"toggle\" BOOLEAN);"
                       "GRANT ALL ON \"FOO\" TO GUEST;"]]
      (jdbc/execute! one-off-dbs/*conn* [statement]))
    (sync/sync-database! (mt/db))
    (mt/with-actions-enabled
      (mt/with-actions [{model-id :id} {:type :model, :dataset_query (mt/mbql-query foo)}]
        (let [action-data         {:type     :implicit
                                   :kind     :row/create
                                   :name     "create foo"
                                   :model_id model-id}
              action-id           (action/insert! action-data)
              select-action       #(action/select-action :id action-id)
              action-after-insert (select-action)]
          (is (= [:boolean] (map :type (:parameters action-after-insert))))
          (action/update! (assoc (select-action) :name "create foo2") action-after-insert)
          (is (= (:parameters action-after-insert) (:parameters (select-action)))))))))

(deftest implicit-action-parameters-schema-change-test
  (one-off-dbs/with-blank-db
    (doseq [statement ["CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                       "SET DB_CLOSE_DELAY -1;"
                       "CREATE TABLE \"FOO\" (\"id\" IDENTITY PRIMARY KEY, \"name\" TEXT);"
                       "GRANT ALL ON \"FOO\" TO GUEST;"]]
      (jdbc/execute! one-off-dbs/*conn* [statement]))
    (sync/sync-database! (mt/db))
    (mt/with-actions-enabled
      (mt/with-actions [{model-id :id} {:type :model, :dataset_query (mt/mbql-query foo)}]
        (let [action-data {:type     :implicit
                           :kind     :row/create
                           :name     "create foo"
                           :model_id model-id}
              action-id   (action/insert! action-data)
              exec!       #(do (jdbc/execute! one-off-dbs/*conn* [%])
                               (sync/sync-database! (mt/db)))]
          (testing "if a column type is varied the parameter types are updated on select-action"
            (exec! "ALTER TABLE \"FOO\" ALTER COLUMN \"name\" BIGINT;")
            (is (= [["name" :number]] (map (juxt :id :type) (:parameters (action/select-action action-id)))))
            (testing "if the column type is varied after an update to the action, it is reflected in the parameters"
              (let [action (action/select-action action-id)]
                (action/update! (assoc action :name "create foo2") action)
                (exec! "ALTER TABLE \"FOO\" ALTER COLUMN \"name\" TEXT;")
                (sync/sync-database! (mt/db))
                (is (= [["name" :text]] (map (juxt :id :type) (:parameters (action/select-action action-id))))))))
          (testing "if a column added, the model column set is used, not the table"
            (exec! "ALTER TABLE \"FOO\" ADD COLUMN \"name2\" BIGINT;")
            (is (= ["name"] (map :id (:parameters (action/select-action action-id))))))
          (testing "viz settings are kept after a schema change (for hiding fields)"
            (let [action     (action/select-action action-id)
                  hide-state #(-> % :visualization_settings :fields (update-vals :hidden))]
              (is (= {"name" false} (hide-state action)))
              (action/update! (assoc-in action [:visualization_settings :fields "name" :hidden] true) action)
              (is (= {"name" true}  (hide-state (action/select-action action-id))))
              (exec! "ALTER TABLE \"FOO\" ALTER COLUMN \"name\" BIGINT;")
              (is (= {"name" true}  (hide-state (action/select-action action-id)))))))))))

(deftest load-skips-http-actions-test
  (testing "HTTP actions from older exports are skipped on load"
    (let [entity-id (u/generate-nano-id)]
      (serdes/load-one! {:type        "http"
                         :name        "Old HTTP action"
                         :entity_id   entity-id
                         :serdes/meta [{:model "Action" :id entity-id}]}
                        nil)
      (is (not (t2/exists? :model/Action :entity_id entity-id))))))

(deftest load-query-action-without-collection-test
  (testing "a query action from an export without action collections is loaded into its former model's collection"
    (mt/with-temp [:model/Collection {coll-id :id}         {}
                   :model/Card       {model-eid :entity_id} {:type          :model
                                                             :collection_id coll-id
                                                             :dataset_query (mt/mbql-query categories)}]
      (mt/with-model-cleanup [:model/Action]
        (let [action-id (action/insert! (lib/normalize ::actions.schema/action.for-insert
                                                       {:type          :query
                                                        :name          "Old export"
                                                        :collection_id coll-id
                                                        :database_id   (mt/id)
                                                        :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})}))
              hydrated  (u/rfirst (serdes/extract-query "Action" {:filter-column :id, :filter-ids [action-id]}))
              ingested  (-> (serdes/extract-one "Action" {} hydrated)
                            (dissoc :collection_id)
                            (assoc :model_id model-eid))]
          (t2/delete! :model/Action :id action-id)
          (serdes/load-one! ingested nil)
          (is (=? {:collection_id coll-id, :model_id nil}
                  (t2/select-one :model/Action :entity_id (:entity_id ingested))))
          (is (= #{[{:model "Card" :id model-eid}]}
                 (set (filter #(= "Card" (:model (first %)))
                              (serdes/deserialization-dependencies ingested))))))))))
