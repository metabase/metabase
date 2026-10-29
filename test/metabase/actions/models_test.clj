(ns ^:mb/driver-tests metabase.actions.models-test
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.actions.models-test]}}}}}}
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.actions.models :as action]
   [metabase.actions.schema :as actions.schema]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.driver.mysql :as mysql]
   [metabase.events.core :as events]
   [metabase.events.test-util :as events.tu]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.queries.models.card :as queries.card]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.search.test-util :as search.tu]
   [metabase.serialization.core :as serialization]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.one-off-dbs :as one-off-dbs]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.warehouse-schema.models.table :as table]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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
    (mt/test-drivers #{:h2 :postgres}
      (mt/dataset (mt/dataset-definition
                   "binary-field-dataset"
                   [["binary_table"
                     [{:field-name "name", :base-type :type/Text}
                      {:field-name      "bytea_col"
                       :base-type       {:native (case driver/*driver*
                                                   :h2       "VARBINARY"
                                                   :postgres "bytea")}
                       :effective-type  :type/Binary}]
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
      (mt/with-actions [{:keys [model-id action-id] :as _context} {}]
        (is (partial= {:id action-id
                       :name "Query Example"
                       :model_id model-id
                       :creator_id (mt/user->id :crowberto)
                       :creator {:common_name "Crowberto Corv"}
                       :parameters [{:id "id" :type :number}]}
                      (t2/hydrate (action/select-action :id action-id) :creator)))))))

(deftest hydrate-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-test-data-and-actions-enabled
      (mt/with-actions [{:keys [model-id action-id] :as _context} {}]
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
            (action/update-action! action-id, {:archived true} nil)
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
                new-id        (:id (first (action/create-actions! [(dissoc action :id :made_public_by_id :public_uuid :entity_id)])))
                cloned-action (action/select-action :id new-id)]
            (is (partial= {:kind :row/create} cloned-action))))
        (testing "Update action"
          (action/update-action! action-id {:name "New name" :kind :row/update} nil)
          (is (partial= {:name "New name"
                         :kind :row/update}
                        (action/select-action :id action-id))))))))

(deftest query-action-database-id-derived-from-query-test
  (mt/with-actions-enabled
    (mt/with-actions [{model-id :id, model-db-id :database_id} {:type :model, :dataset_query (mt/mbql-query categories)}]
      (testing "insert! derives :database_id from the query's database"
        (let [action-id (:id (first (action/create-actions! [(lib/normalize ::actions.schema/action.for-insert
                                                                            {:type          :query
                                                                             :name          "derive db insert"
                                                                             :model_id      model-id
                                                                             :database_id   Integer/MAX_VALUE   ; bogus; the query targets the model DB
                                                                             :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})})])))]
          (is (= model-db-id (:database_id (action/select-action :id action-id))))))
      (testing "update! refuses a :database_id without its query"
        (let [action-id (:id (first (action/create-actions! [(lib/normalize ::actions.schema/action.for-insert
                                                                            {:type          :query
                                                                             :name          "derive db update"
                                                                             :model_id      model-id
                                                                             :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})})])))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"follows its query"
                                (action/update-action! action-id, {:database_id Integer/MAX_VALUE} nil)))
          (is (= model-db-id (:database_id (action/select-action :id action-id)))))))))

(deftest query-action-query-must-be-native-test
  (let [mp     (mt/metadata-provider)
        mbql   (lib/query mp (lib.metadata/table mp (mt/id :categories)))
        native (lib/native-query mp "UPDATE categories SET name = 'x' WHERE id = 1")]
    (testing "the QueryAction schema takes a native query on a database and refuses an MBQL one"
      (is (mr/validate ::actions.schema/query-action.update {:action_id 1 :dataset_query native}))
      (is (not (mr/validate ::actions.schema/query-action.update {:action_id 1 :dataset_query mbql}))))
    (testing "the Action create request schema needs a native query for a query action"
      (is (not (mr/validate ::actions.schema/action.create-request
                            {:type :query, :name "Checked", :dataset_query mbql})))
      (is (not (mr/validate ::actions.schema/action.create-request {:type :query, :name "Checked"})))
      (is (mr/validate ::actions.schema/action.create-request
                       {:type :query, :name "Checked", :dataset_query native})))))

(defn- insert-bare-action!
  "Insert the Action row of `action-type`, without a model, a collection or its details, and return its id."
  [action-type]
  (t2/insert-returning-pk! :model/Action {:name       "Bare"
                                          :type       action-type
                                          :creator_id (mt/user->id :crowberto)}))

(deftest action-type-is-query-or-implicit-test
  (testing "the Action schema takes a query or an implicit action only"
    (is (not (mr/validate ::actions.schema/action.for-insert {:type :http, :name "Bare"})))
    (is (not (mr/validate ::actions.schema/action.for-update {:type :http})))
    (is (mr/validate ::actions.schema/action.for-update {:type :implicit}))))

(deftest query-action-database-is-derived-test
  (testing "the database of a query action is the one of its query, however it is written"
    (mt/with-model-cleanup [:model/Action]
      (let [action-id (insert-bare-action! :query)
            mp        (mt/metadata-provider)]
        (t2/insert! :model/QueryAction {:action_id     action-id
                                        :database_id   Integer/MAX_VALUE
                                        :dataset_query (lib/native-query mp "UPDATE categories SET name = 'x'")})
        (is (= (mt/id) (t2/select-one-fn :database_id :model/QueryAction :action_id action-id)))
        (testing "and can't be changed without its query"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"follows its query"
                                (t2/update! :model/QueryAction :action_id action-id {:database_id Integer/MAX_VALUE})))
          (is (= (mt/id) (t2/select-one-fn :database_id :model/QueryAction :action_id action-id))))
        (testing "while a new query sets it"
          (t2/update! :model/QueryAction :action_id action-id
                      {:database_id   Integer/MAX_VALUE
                       :dataset_query (lib/native-query mp "UPDATE categories SET name = 'y'")})
          (is (= (mt/id) (t2/select-one-fn :database_id :model/QueryAction :action_id action-id))))))))

(deftest action-details-match-action-type-test
  (testing "an action has the details of its type, however they are written"
    (mt/with-model-cleanup [:model/Action]
      (let [query-id    (insert-bare-action! :query)
            implicit-id (insert-bare-action! :implicit)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"have to match its type"
                              (#'action/create-implicit-actions! [{:action_id query-id, :kind :row/create, :table_id (mt/id :venues)}])))
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"have to match its type"
                              (#'action/create-query-actions! [{:action_id     implicit-id
                                                                :dataset_query (lib/native-query (mt/metadata-provider) "SELECT 1")}])))
        (is (not (t2/exists? :model/ImplicitAction :action_id query-id)))
        (is (not (t2/exists? :model/QueryAction :action_id implicit-id)))))))

(deftest implicit-action-kind-test
  (testing "the ImplicitAction schema takes a row create, update or delete"
    (is (not (mr/validate ::actions.schema/implicit-action.update {:action_id 1 :kind :row/upsert})))
    (is (mr/validate ::actions.schema/implicit-action.update {:action_id 1 :kind :row/create}))))

(deftest actions-written-together-test
  (testing "several actions inserted or updated in one statement are checked each"
    (mt/with-temp [:model/Collection {coll-id :id} {}]
      (mt/with-model-cleanup [:model/Action]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"An action without a model can only go in"
                              (action/create-actions! [{:name "Root", :type :query, :creator_id (mt/user->id :crowberto)}
                                                       {:name "Elsewhere", :type :query, :collection_id coll-id
                                                        :creator_id (mt/user->id :crowberto)}])))
        (is (not (t2/exists? :model/Action :name "Root")))))))

(deftest query-action-without-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (testing "a query action can be inserted and updated without a model, and keeps its own collection"
      (mt/with-temp [:model/Collection {coll-id :id} {:namespace "data-actions"}]
        (mt/with-model-cleanup [:model/Action]
          (let [insert!   (fn [collection-id]
                            (:id (first (action/create-actions! [(lib/normalize ::actions.schema/action.for-insert
                                                                                {:type          :query
                                                                                 :name          "No model"
                                                                                 :collection_id collection-id
                                                                                 :database_id   (mt/id)
                                                                                 :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})})]))))
                action-id (insert! coll-id)]
            (is (=? {:model_id nil :collection_id coll-id :database_id (mt/id)}
                    (action/select-action :id action-id)))
            (action/update-action! action-id {:name "Renamed"} nil)
            (is (=? {:name "Renamed" :model_id nil :collection_id coll-id}
                    (action/select-action :id action-id)))))))))

(deftest action-in-a-data-apps-collection-is-admin-only-test
  (testing "Only administrators write an action in a collection of the data apps namespace"
    (mt/with-temp [:model/Collection {app-id :id}  {:namespace "data-apps"}
                   :model/Collection {coll-id :id} {:namespace "data-actions"}]
      (mt/with-model-cleanup [:model/Action]
        (let [action-in (fn [collection-id]
                          (lib/normalize ::actions.schema/action.for-insert
                                         {:type          :implicit
                                          :kind          :row/create
                                          :name          "No model"
                                          :collection_id collection-id
                                          :table_id      (mt/id :categories)}))
              elsewhere (action/select-action :id (:id (first (action/create-actions! [(action-in coll-id)]))))]
          (mt/with-test-user :crowberto
            (is (true? (mi/can-write? (t2/hydrate elsewhere :can_write))))
            (is (true? (mi/can-create? :model/Action (action-in app-id))))
            (is (true? (mi/can-update? elsewhere {:collection_id app-id}))))
          (mt/with-test-user :rasta
            (is (false? (mi/can-write? (t2/hydrate elsewhere :can_write))))
            (is (false? (mi/can-create? :model/Action (action-in app-id))))
            (is (false? (mi/can-update? elsewhere {:collection_id app-id})))))))))

(defn- insert-data-app-action!
  "Insert an action named `action-name` of `action-type` in the collection with `collection-id`, as a load does, with
  `action-columns` merged into its Action row: an implicit one of no model inserting into the venues table, or a query
  one running SQL."
  [collection-id action-type action-name & [action-columns]]
  (:id (first (action/create-actions! [(merge {:name          action-name
                                               :type          action-type
                                               :collection_id collection-id
                                               :creator_id    (mt/user->id :crowberto)}
                                              (if (= :implicit action-type)
                                                {:kind :row/create :table_id (mt/id :venues)}
                                                {:database_id   (mt/id)
                                                 :dataset_query (lib/native-query (mt/metadata-provider) "UPDATE venues SET name = 'x'")})
                                              action-columns)]))))

(def ^:private card-values-parameters
  "Action parameters, one taking its values from a card that doesn't exist."
  [{:id "name" :slug "name" :type :string/= :values_source_type :card :values_source_config {:card_id Integer/MAX_VALUE}}])

(deftest action-in-a-data-apps-collection-is-plain-implicit-action-test
  (testing "an action in a collection of the data apps namespace is an implicit action of no model, neither archived nor
            public, whose parameters take no values from a card, however it gets there"
    (when config/ee-available?
      (mt/with-temp [:model/Collection {app-id :id}   {:namespace "data-apps"}
                     :model/Collection {other-id :id} {:namespace "data-actions"}]
        (mt/with-model-cleanup [:model/Action]
          (doseq [[label action-type columns message]
                  [["a query action" :query nil #"must be an implicit action on a table"]
                   ["archived" :implicit {:archived true} #"can't be archived"]
                   ["public" :implicit {:public_uuid (str (random-uuid)) :made_public_by_id (mt/user->id :crowberto)}
                    #"can't be made public"]
                   ["taking parameter values from a card" :implicit {:parameters card-values-parameters}
                    #"can't take a parameter's values from a card"]]]
            (testing label
              (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                                    (insert-data-app-action! app-id action-type label columns)))
              (testing "moved in from elsewhere, where it is fine"
                (let [action-id (insert-data-app-action! other-id action-type (str label " elsewhere") columns)]
                  (is (thrown-with-msg? clojure.lang.ExceptionInfo message
                                        (action/update-action! action-id {:collection_id app-id} nil)))
                  (is (= other-id (t2/select-one-fn :collection_id :model/Action :id action-id))))))))))))

(deftest action-in-a-data-apps-collection-writes-to-any-table-test
  (testing "the hook reads only the action's rows, so an implicit action of no model there writes to any table"
    (when config/ee-available?
      (mt/with-temp [:model/Collection {app-id :id}   {:namespace "data-apps"}
                     :model/Collection {other-id :id} {:namespace "data-actions"}]
        (mt/with-model-cleanup [:model/Action]
          (let [action-id (insert-data-app-action! app-id :implicit "Add venue")]
            (action/update-action! action-id {:table_id (mt/id :categories)} nil)
            (is (= (mt/id :categories) (t2/select-one-fn :table_id :model/ImplicitAction :action_id action-id))))
          (testing "and one moves in"
            (let [action-id (insert-data-app-action! other-id :implicit "Moved in")]
              (action/update-action! action-id {:collection_id app-id} nil)
              (is (= app-id (t2/select-one-fn :collection_id :model/Action :id action-id))))))))))

(deftest implicit-action-requires-table-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (testing "an implicit action cannot be inserted without a model or a table"
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"An implicit action needs a table"
                            (:id (first (action/create-actions! [{:type :implicit :name "No table" :kind :row/create}]))))))
    (testing "an implicit action without a model writes to the table it was made for"
      (mt/with-actions-test-data
        (mt/with-model-cleanup [:model/Action]
          (let [action-id (:id (first (action/create-actions! [{:type :implicit :name "Table" :kind :row/create :table_id (mt/id :categories)}])))]
            (is (=? {:model_id    nil
                     :table_id    (mt/id :categories)
                     :database_id (mt/id)
                     :parameters  [{:id "name"}]}
                    (action/select-action :id action-id)))))))
    (testing "an implicit action can't be detached from its model"
      (mt/with-actions-enabled
        (mt/with-actions [{:keys [action-id]} {:type :implicit :kind "row/create"}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"An action's model can't be changed"
                                (action/update-action! action-id {:model_id nil} nil)))
          (is (some? (t2/select-one-fn :model_id :model/Action :id action-id))))))))

(deftest actions-of-two-models-on-one-table-test
  (testing "the actions of two models on the same table each get their own model's parameters"
    (mt/with-actions-test-data-and-actions-enabled
      (let [mp       (mt/metadata-provider)
            query    (lib/query mp (lib.metadata/table mp (mt/id :categories)))
            metadata (vec (qp.preprocess/query->expected-cols query))]
        (mt/with-temp [:model/Card {first-model :id}  {:type :model :dataset_query query :result_metadata metadata}
                       :model/Card {second-model :id} {:type :model :dataset_query query :result_metadata metadata}]
          (mt/with-model-cleanup [:model/Action]
            (let [first-id  (:id (first (action/create-actions! [{:type :implicit :name "First" :kind :row/update :model_id first-model}])))
                  second-id (:id (first (action/create-actions! [{:type :implicit :name "Second" :kind :row/update :model_id second-model}])))]
              (is (= {first-id ["id" "name"], second-id ["id" "name"]}
                     (into {} (map (juxt :id #(map :id (:parameters %))))
                           (action/select-actions-for-ids [first-id second-id])))))))))))

(deftest model-less-implicit-action-table-rules-test
  (mt/with-temp [:model/Database {db-id :id}       {:engine :h2}
                 :model/Table    {clash-id :id}     {:db_id db-id :name "CLASH"}
                 :model/Field    _                  {:table_id clash-id :name "id" :base_type :type/Integer
                                                     :semantic_type :type/PK}
                 :model/Field    _                  {:table_id clash-id :name "name" :base_type :type/Text}
                 :model/Field    _                  {:table_id clash-id :name "NAME" :base_type :type/Text
                                                     :visibility_type :sensitive}
                 :model/Table    {stub-id :id}      {:db_id db-id :name "STUB"}]
    (mt/with-model-cleanup [:model/Action]
      (testing "a column name that clashes only with a sensitive column leaves the action its fields"
        (let [action-id (:id (first (action/create-actions! [{:type :implicit :name "Clash" :kind :row/update :table_id clash-id}])))]
          (is (= ["id" "name"] (map :id (:parameters (action/select-action :id action-id)))))))
      (testing "the hooks take a table without fields, as a load writes the action before it, or without, the table's fields"
        (is (some? (:id (first (action/create-actions! [{:type :implicit :name "Stub" :kind :row/create :table_id stub-id}])))))))))

(deftest deleting-a-table-deletes-its-actions-test
  (testing "deleting a table, or its database, deletes the implicit actions without a model that write to it"
    (mt/with-temp [:model/Database {db-id :id}    {:engine :h2}
                   :model/Table    {table-id :id} {:db_id db-id :name "T"}
                   :model/Field    _              {:table_id table-id :name "id" :base_type :type/Integer
                                                   :semantic_type :type/PK}
                   :model/Table    {other-id :id} {:db_id db-id :name "U"}
                   :model/Field    _              {:table_id other-id :name "id" :base_type :type/Integer
                                                   :semantic_type :type/PK}]
      (mt/with-model-cleanup [:model/Action]
        (let [of-table    (:id (first (action/create-actions! [{:type :implicit :name "T" :kind :row/create :table_id table-id}])))
              of-database (:id (first (action/create-actions! [{:type :implicit :name "U" :kind :row/create :table_id other-id}])))]
          (table/delete-tables! [table-id])
          (is (not (t2/exists? :model/Action :id of-table)))
          (is (t2/exists? :model/Action :id of-database))
          (database/delete-databases! [db-id])
          (is (not (t2/exists? :model/Action :id of-database))))))))

(deftest model-less-implicit-action-fields-test
  (testing "an implicit action without a model has the fields a new model on its table returns: no sensitive or retired ones"
    (mt/with-temp-vals-in-db :model/Field (mt/id :venues :price) {:visibility_type "sensitive"}
      (mt/with-temp-vals-in-db :model/Field (mt/id :venues :latitude) {:visibility_type "hidden"}
        (mt/with-temp-vals-in-db :model/Field (mt/id :venues :longitude) {:visibility_type "details-only"}
          (mt/with-temp-vals-in-db :model/Field (mt/id :venues :category_id) {:visibility_type "retired"}
            (mt/with-model-cleanup [:model/Action]
              (let [action-id (:id (first (action/create-actions! [{:type :implicit :name "Venue" :kind :row/update
                                                                    :table_id (mt/id :venues)}])))]
                (is (= #{"id" "name" "latitude" "longitude"}
                       (set (map :id (:parameters (action/select-action :id action-id))))))))))))))

(defn- table-query
  "A query of the test Table `table-key`."
  [table-key]
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id table-key)))))

(deftest model-action-collection-follows-model-test
  (mt/with-actions-enabled
    (mt/with-temp [:model/Collection {coll-id :id}  {}
                   :model/Collection {other-id :id} {}]
      (mt/with-actions [{model-id :id}      {:type :model :dataset_query (table-query :categories)
                                             :collection_id coll-id}
                        {:keys [action-id]} {:type :query}]
        (testing "an action of a model goes in the model's collection"
          (is (= coll-id (t2/select-one-fn :collection_id :model/Action :id action-id))))
        (testing "and can't be moved out of it"
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A model's action goes in the model's collection"
                                (action/update-action! action-id {:collection_id other-id} nil)))
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A model's action goes in the model's collection"
                                (action/update-action! action-id {:collection_id nil} nil))))
        (testing "nor be inserted in another collection"
          (mt/with-model-cleanup [:model/Action]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"A model's action goes in the model's collection"
                                  (:id (first (action/create-actions! [{:type          :query
                                                                        :name          "Elsewhere"
                                                                        :model_id      model-id
                                                                        :collection_id other-id
                                                                        :database_id   (mt/id)
                                                                        :dataset_query (lib/native-query (mt/metadata-provider) "select 1")}])))))))
        (testing "moving the model moves its actions"
          (queries.card/update-cards! [{:id model-id :collection_id other-id}])
          (is (= other-id (t2/select-one-fn :collection_id :model/Action :id action-id))))))))

(deftest model-action-has-no-table-test
  (testing "an implicit action of a model reads its model's table, so it can't be given one"
    (mt/with-actions [_                   {:type :model :dataset_query (table-query :categories)}
                      {:keys [action-id]} {:type :implicit :kind "row/create"}]
      (is (nil? (t2/select-one-fn :table_id :model/ImplicitAction :action_id action-id)))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"An action of a model writes to the model's table"
                            (action/update-action! action-id {:table_id (mt/id :categories)} nil)))
      (is (nil? (t2/select-one-fn :table_id :model/ImplicitAction :action_id action-id))))))

(deftest model-update-moves-action-to-another-model-test
  (testing "a model update can move an action to another model, as SerDes loads of exports from before the model was fixed do"
    (mt/with-temp [:model/Collection {other-coll :id} {}
                   :model/Card       {other-id :id}   {:type :model :dataset_query (table-query :categories)
                                                       :collection_id other-coll}]
      (mt/with-actions [_                   {:type :model :dataset_query (table-query :categories)}
                        {:keys [action-id]} {:type :query}]
        (action/update-actions! [{:id action-id :model_id other-id :collection_id other-coll}] {:writer :import})
        (is (= {:model_id other-id :collection_id other-coll}
               (t2/select-one [:model/Action :model_id :collection_id] :id action-id)))))))

(deftest action-update-cannot-change-model-test
  (testing "the update function refuses to move an action to another model"
    (mt/with-temp [:model/Card {other-id :id} {:type :model :dataset_query (table-query :categories)}]
      (mt/with-actions [{model-id :id}      {:type :model :dataset_query (table-query :categories)}
                        {:keys [action-id]} {:type :query}]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"model can't be changed"
                              (action/update-action! action-id {:model_id other-id} nil)))
        (is (= model-id (t2/select-one-fn :model_id :model/Action :id action-id)))))))

(deftest switching-to-implicit-checks-the-model-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "a query action cannot become implicit when its card is a question"
        (mt/with-temp [:model/Card {question-id :id} {:type :question :dataset_query (mt/mbql-query categories)}]
          (mt/with-model-cleanup [:model/Action]
            (let [action-id (:id (first (action/create-actions! [(lib/normalize ::actions.schema/action.for-insert
                                                                                {:type          :query
                                                                                 :name          "On a question"
                                                                                 :model_id      question-id
                                                                                 :dataset_query (mt/native-query {:query "update categories set name = 'x' where id = 1"})})])))]
              (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Actions must be made with models, not cards"
                                    (action/update-action! action-id {:type :implicit :kind :row/update} nil)))))))
      (testing "a query action cannot become implicit when its model has clauses"
        (mt/with-actions [_                   {:type :model :dataset_query (mt/mbql-query categories {:limit 1})}
                          {:keys [action-id]} {:type :query}]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"not supported for models with clauses"
                                (action/update-action! action-id {:type :implicit :kind :row/update} nil))))))))

(deftest model-to-saved-question-test
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      (testing "Non-implicit actions and their dashboard buttons are deleted if their model is converted to a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {:type :query}]
          (mt/with-temp [:model/Dashboard     {dashboard-id :id} {}
                         :model/DashboardCard {dashcard-id :id}  {:action_id action-id :dashboard_id dashboard-id}]
            (is (false? (t2/select-one-fn :archived :model/Action :id action-id)))
            (queries.card/update-cards! [{:id model-id :type :question}])
            (is (not (t2/exists? :model/Action :id action-id)))
            (is (not (t2/exists? :model/DashboardCard :id dashcard-id))))))
      (testing "Implicit actions are deleted if their model is converted to a saved question"
        (mt/with-actions [{:keys [action-id model-id]} {:type :implicit}]
          (is (false? (t2/select-one-fn :archived :model/Action :id action-id)))
          (queries.card/update-cards! [{:id model-id :type :question}])
          (is (false? (t2/exists? :model/Action :id action-id))))))))

(deftest model-to-saved-question-test-2
  (mt/test-drivers (mt/normal-drivers-with-feature :actions/custom)
    (mt/with-actions-enabled
      ;; Ngoc: I know this seems like a silly test but we actually made a mistake
      ;; in the pre-update because `nil` is considered falsy. So have this test
      ;; here to make sure we don't made that mistake again
      (testing "Don't archive actions if updates a model dataset_query"
        (mt/with-actions [{:keys [action-id model-id]} {}]
          (is (false? (t2/select-one-fn :archived :model/Action :id action-id)))
          (t2/update! :model/Card :id model-id {:dataset_query (mt/mbql-query users {:limit 1})})
          (is (false? (t2/select-one-fn :archived :model/Action :id action-id))))))))

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
    (sync/sync-database! (mt/id))
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
    (sync/sync-database! (mt/id))
    (mt/with-actions-enabled
      (mt/with-actions [{model-id :id} {:type :model, :dataset_query (mt/mbql-query foo)}]
        (let [action-data         {:type     :implicit
                                   :kind     :row/create
                                   :name     "create foo"
                                   :model_id model-id}
              action-id           (:id (first (action/create-actions! [action-data])))
              select-action       #(action/select-action :id action-id)
              action-after-insert (select-action)]
          (is (= [:boolean] (map :type (:parameters action-after-insert))))
          (action/update-action! action-id {:name "create foo2"} nil)
          (is (= (:parameters action-after-insert) (:parameters (select-action)))))))))

(deftest implicit-action-parameters-schema-change-test
  (one-off-dbs/with-blank-db
    (doseq [statement ["CREATE USER IF NOT EXISTS GUEST PASSWORD 'guest';"
                       "SET DB_CLOSE_DELAY -1;"
                       "CREATE TABLE \"FOO\" (\"id\" IDENTITY PRIMARY KEY, \"name\" TEXT);"
                       "GRANT ALL ON \"FOO\" TO GUEST;"]]
      (jdbc/execute! one-off-dbs/*conn* [statement]))
    (sync/sync-database! (mt/id))
    (mt/with-actions-enabled
      (mt/with-actions [{model-id :id} {:type :model, :dataset_query (mt/mbql-query foo)}]
        (let [action-data {:type     :implicit
                           :kind     :row/create
                           :name     "create foo"
                           :model_id model-id}
              action-id   (:id (first (action/create-actions! [action-data])))
              exec!       #(do (jdbc/execute! one-off-dbs/*conn* [%])
                               (sync/sync-database! (mt/id)))]
          (testing "if a column type is varied the parameter types are updated on select-action"
            (exec! "ALTER TABLE \"FOO\" ALTER COLUMN \"name\" BIGINT;")
            (is (= [["name" :number]] (map (juxt :id :type) (:parameters (action/select-action action-id)))))
            (testing "if the column type is varied after an update to the action, it is reflected in the parameters"
              (action/update-action! action-id {:name "create foo2"} nil)
              (exec! "ALTER TABLE \"FOO\" ALTER COLUMN \"name\" TEXT;")
              (sync/sync-database! (mt/id))
              (is (= [["name" :text]] (map (juxt :id :type) (:parameters (action/select-action action-id)))))))
          (testing "if a column added, the model column set is used, not the table"
            (exec! "ALTER TABLE \"FOO\" ADD COLUMN \"name2\" BIGINT;")
            (is (= ["name"] (map :id (:parameters (action/select-action action-id))))))
          (testing "viz settings are kept after a schema change (for hiding fields)"
            (let [action     (action/select-action action-id)
                  hide-state #(-> % :visualization_settings :fields (update-vals :hidden))]
              (is (= {"name" false} (hide-state action)))
              (action/update-action! action-id {:visualization_settings (assoc-in (:visualization_settings action) [:fields "name" :hidden] true)} nil)
              (is (= {"name" true}  (hide-state (action/select-action action-id))))
              (exec! "ALTER TABLE \"FOO\" ALTER COLUMN \"name\" BIGINT;")
              (is (= {"name" true}  (hide-state (action/select-action action-id)))))))))))

(deftest load-skips-http-actions-test
  (testing "HTTP actions from older exports are skipped on load"
    (let [entity-id (u/generate-nano-id)]
      (serialization/load :model/Action [{:type        "http"
                                          :name        "Old HTTP action"
                                          :entity_id   entity-id
                                          :serdes/meta [{:model "Action"}]}])
      (is (not (t2/exists? :model/Action :entity_id entity-id))))))

(deftest load-table-action-without-its-table-test
  (testing "table action doesn't depend on its table for serdes, and loading it makes stub of table that isn't there"
    (mt/with-model-cleanup [:model/Action :model/Table]
      (let [action-id (:id (first (action/create-actions! [{:type :implicit :name "On categories" :kind :row/create
                                                            :table_id (mt/id :categories) :creator_id (mt/user->id :crowberto)}])))
            entity-id (u/generate-nano-id)
            exported  (-> (u/rfirst (serialization/export :model/Action (t2/select :model/Action :id action-id)))
                          (assoc :entity_id entity-id)
                          (assoc-in [:implicit 0 :table_id] [(:name (mt/db)) "PUBLIC" "NOT_SYNCED_YET"]))]
        (is (= #{} (set (filter #(= :model/Table (first %)) (first (serialization/import-dependencies :model/Action [exported]))))))
        (serialization/load :model/Action [exported])
        (let [table-id (t2/select-one-fn :table_id :model/ImplicitAction
                                         :action_id (t2/select-one-pk :model/Action :entity_id entity-id))]
          (is (= "NOT_SYNCED_YET" (t2/select-one-fn :name :model/Table :id table-id))))))))

(deftest storage-path-test
  (testing "actions without model in data actions root or namespace are stored in data_actions folder"
    (mt/with-temp [:model/Collection {folder-eid :entity_id} {:namespace "data-actions"}
                   :model/Collection {app-eid :entity_id}    {:namespace "data-apps"}]
      (let [folder-label (fn [action]
                           (:label (second (first (serialization/batch-storage-paths
                                                   [(assoc action :serdes/meta [{:model "Action"}])])))))]
        (is (= "data_actions" (folder-label {:name "At root" :entity_id "x" :model_id nil :collection_id nil})))
        (is (= "data_actions" (folder-label {:name "In folder" :entity_id "x" :model_id nil :collection_id folder-eid})))
        (is (= "data_apps" (folder-label {:name "App copy" :entity_id "x" :model_id nil :collection_id app-eid})))
        (is (= "main" (folder-label {:name "On a model" :entity_id "x" :model_id "model-eid" :collection_id nil})))))))

(deftest ^:parallel query-action-import-dependencies-test
  (testing "query action depends on what its query uses, whether its exported type is keyword or string"
    (let [card-eid (apply str (repeat 21 \d))]
      (doseq [action-type [:query "query"]]
        (testing (pr-str action-type)
          (is (contains? (first (serialization/import-dependencies
                                 :model/Action
                                 [{:type  action-type
                                   :query [{:dataset_query {:source-card card-eid}}]}]))
                         [:model/Card card-eid])))))))

(deftest writes-run-fixed-statements-test
  (letfn [(creating [n]
            (mt/with-temp [:model/Collection {coll-id :id} {:namespace "data-actions"}]
              (mt/with-model-cleanup [:model/Action]
                (let [table-id (mt/id :venues)
                      user-id  (mt/user->id :crowberto)]
                  (search.tu/with-index-disabled
                    (t2/with-call-count [call-count]
                      (action/create-actions! (for [i (range n)]
                                                {:name (str "created " i) :type :implicit :kind :row/create :table_id table-id
                                                 :collection_id coll-id :creator_id user-id}))
                      (call-count)))))))
          (updating [n]
            (mt/with-temp [:model/Collection {coll-id :id} {:namespace "data-actions"}]
              (mt/with-model-cleanup [:model/Action]
                (let [actions (action/create-actions! (for [i (range n)]
                                                        {:name (str "updated " i) :type :implicit :kind :row/create :table_id (mt/id :venues)
                                                         :collection_id coll-id :creator_id (mt/user->id :crowberto)}))]
                  (search.tu/with-index-disabled
                    (t2/with-call-count [call-count]
                      (action/update-actions! (mapv (fn [id] {:id id :description "described"}) (mapv :id actions)) nil)
                      (call-count)))))))]
    (testing "creating actions runs one statement count whatever their number"
      (creating 1)
      (is (= (creating 2) (creating 6))))
    (testing "updating actions runs one statement count whatever their number"
      (updating 1)
      (is (= (updating 2) (updating 6))))))

(deftest action-writes-publish-one-action-event-test
  (mt/with-model-cleanup [:model/Action]
    (let [published (atom [])
          user-id   (mt/user->id :crowberto)]
      (with-redefs [events/publish-event! (fn [topic _event] (swap! published conj topic))]
        (let [action-id (:id (first (action/create-actions! [{:type       :implicit
                                                              :name       "Details"
                                                              :kind       :row/create
                                                              :table_id   (mt/id :venues)
                                                              :creator_id user-id}])))
              updated   #(t2/select-one-fn :updated_at :model/Action :id action-id)
              before    (updated)]
          (testing "an action is created with its details and one event"
            (is (= :row/create (t2/select-one-fn :kind :model/ImplicitAction :action_id action-id)))
            (is (= [:event/action-create] @published)))
          (testing "a change of the details alone is one update of the action, which sets its update time"
            (action/update-action! action-id {:kind :row/update :table_id (mt/id :categories)} nil)
            (is (=? {:kind :row/update :table_id (mt/id :categories)}
                    (t2/select-one :model/ImplicitAction :action_id action-id)))
            (is (not= before (updated)))
            (is (= [:event/action-create :event/action-update] @published)))
          (testing "a change of nothing publishes nothing"
            (action/update-action! action-id {:kind :row/update} nil)
            (is (= [:event/action-create :event/action-update] @published)))
          (testing "an import that wrote the details on their own touches the action"
            (action/update-actions! [{:id action-id}] {:writer :import})
            (is (= [:event/action-create :event/action-update :event/action-update] @published))))))))

(deftest create-actions-with-different-columns-test
  (mt/with-actions-enabled
    (mt/with-actions [{model-id :id} {:type :model, :dataset_query (mt/mbql-query categories)}]
      (mt/with-model-cleanup [:model/Action]
        (let [native  (mt/native-query {:query "update categories set name = 'x' where id = 1"})
              actions (action/create-actions!
                       (mapv #(lib/normalize ::actions.schema/action.for-insert %)
                             [{:type :query :name "plain" :model_id model-id :dataset_query native}
                              {:type :query :name "described" :model_id model-id :dataset_query native :description "d"}]))]
          (is (= ["plain" "described"] (map :name actions)))
          (is (= [false false] (map #(t2/select-one-fn :archived :model/Action :id (:id %)) actions))))))))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Collection {other :id} {}]
    (mt/with-model-cleanup [:model/Action :model/Card :model/Table :model/Database]
      (let [model-id  (fn [] (t2/insert-returning-pk! :model/Card (assoc (mt/with-temp-defaults :model/Card) :type :model)))
            table-id  (fn [database-id] (t2/insert-returning-pk! :model/Table (assoc (mt/with-temp-defaults :model/Table) :db_id database-id)))
            rows      (fn [n]
                        (mapv (fn [i]
                                (if (even? i)
                                  {:name (mt/random-name) :type :implicit :kind :row/create :model_id (model-id)
                                   :creator_id (mt/user->id :rasta)}
                                  {:name (mt/random-name) :type :implicit :kind :row/create :table_id (mt/id :venues)
                                   :creator_id (mt/user->id :rasta)}))
                              (range n)))
            fresh!    (fn [n] (mapv :id (action/create-actions! (rows n))))
            update!   (fn [prepare changes n]
                        (let [ids (fresh! n)]
                          (prepare (take-nth 2 ids))
                          (events.tu/statement-count! #(action/update-actions! (mapv (fn [id] (assoc changes :id id)) ids)))))
            counted   (fn [f]
                        (f 1)
                        (is (= (f 2) (f 6))))]
        (testing "creating actions"
          (counted (fn [n] (let [rows (rows n)] (events.tu/statement-count! #(action/create-actions! rows))))))
        (testing "updating columns, some already holding the new value"
          (counted (partial update!
                            (fn [ids] (action/update-actions! (mapv (fn [id] {:id id :description "Same"}) ids) nil))
                            {:description "Same"})))
        (testing "archiving actions, some already archived"
          (counted (partial update!
                            (fn [ids] (action/update-actions! (mapv (fn [id] {:id id :archived true}) ids) nil))
                            {:archived true})))
        (testing "deleting actions"
          (counted (fn [n] (let [ids (fresh! n)] (events.tu/statement-count! #(action/delete-actions! ids))))))
        (testing "deleting the actions of models"
          (counted (fn [n]
                     (let [ids       (fresh! n)
                           model-ids (t2/select-fn-vec :model_id :model/Action :id [:in ids] :model_id [:not= nil])]
                       (events.tu/statement-count! #(action/delete-actions! (action/action-ids-of-models model-ids)))))))
        (testing "moving the actions of models"
          (counted (fn [n]
                     (let [ids       (fresh! n)
                           model-ids (t2/select-fn-vec :model_id :model/Action :id [:in ids] :model_id [:not= nil])]
                       (t2/update! :model/Card :id [:in model-ids] {:collection_id other})
                       (events.tu/statement-count! #(action/update-actions-for-models! (zipmap model-ids (repeat other))))))))
        (testing "deleting the actions on tables"
          (counted (fn [n]
                     (let [tables (mapv (fn [_] (table-id (mt/id))) (range n))]
                       (action/create-actions!
                        (mapv (fn [table] {:name (mt/random-name) :type :implicit :kind :row/create :table_id table
                                           :creator_id (mt/user->id :rasta)})
                              tables))
                       (events.tu/statement-count! #(action/delete-actions! (action/action-ids-of-tables tables)))))))
        (testing "deleting the actions on databases"
          (counted (fn [n]
                     (let [databases (mapv (fn [_] (t2/insert-returning-pk! :model/Database (mt/with-temp-defaults :model/Database))) (range n))]
                       (action/create-actions!
                        (mapv (fn [database] {:name (mt/random-name) :type :implicit :kind :row/create :table_id (table-id database)
                                              :creator_id (mt/user->id :rasta)})
                              databases))
                       (events.tu/statement-count! #(action/delete-actions! (action/action-ids-of-databases databases)))))))))))

(deftest archived-directly-follows-collection-in-statement-test
  (mt/with-temp [:model/Collection {live :id}     {}
                 :model/Collection {archived :id} {:archived true}]
    (mt/with-model-cleanup [:model/Action]
      (let [make!   (fn [collection-id n]
                      (vec (repeatedly n #(t2/insert-returning-pk! :model/Action {:name (mt/random-name) :type :implicit
                                                                                  :creator_id (mt/user->id :rasta)
                                                                                  :collection_id collection-id}))))
            flags   (fn [ids] (mapv #(t2/select-one-fn :archived_directly :model/Action :id %) ids))
            cascade {:writer :cascade}]
        (testing "through the write function"
          (let [ids (make! live 2)]
            (action/update-actions! (mapv (fn [id] {:id id :archived true}) ids) cascade)
            (is (= [true true] (flags ids)))
            (action/update-actions! (mapv (fn [id] {:id id :archived false}) ids) cascade)
            (is (= [false false] (flags ids)))))
        (testing "through a plain update, an Action follows the Collection it is in"
          (let [ids (into (make! live 1) (make! archived 1))]
            (t2/update! :model/Action :id [:in ids] {:archived true})
            (is (= [true false] (flags ids)))
            (t2/update! :model/Action :id [:in ids] {:archived false})
            (is (= [false false] (flags ids)))))
        (testing "the event carries the stored value"
          (let [ids       (make! live 1)
                published (atom [])]
            (with-redefs [events/publish-event! (fn [topic event] (swap! published conj [topic event]))]
              (action/update-actions! (mapv (fn [id] {:id id :archived true}) ids) cascade))
            (is (= [true] (for [[topic event] @published
                                :when         (= :event/action-update topic)
                                change        (:changes event)]
                            (:archived_directly (:object change)))))))
        (testing "restoring rows of mixed stored state costs the same statements at two and six rows"
          (let [restore! (fn [n]
                           (let [ids (make! live n)]
                             (action/update-actions! (mapv (fn [id] {:id id :archived true}) ids) cascade)
                             (t2/update! :model/Action :id (first ids) {:archived_directly false})
                             (events.tu/statement-count!
                              #(action/update-actions! (mapv (fn [id] {:id id :archived false}) ids) cascade))))]
            (restore! 2)
            (is (= (restore! 2) (restore! 6)))))))))

(defn- archive-call-count
  "The number of statements it takes to ask whether a superuser may archive `actions`, which must be allowed."
  [actions]
  (mt/with-test-user :crowberto
    (t2/with-call-count [call-count]
      (is (true? (mi/can-update-each? :model/Action actions {:archived true})))
      (call-count))))

(deftest can-update-each-archive-test
  (mt/with-model-cleanup [:model/Collection :model/Card :model/Action]
    (let [mp        (mt/metadata-provider)
          coll-ids  (t2/insert-returning-pks! :model/Collection
                                              (repeatedly 40 #(t2.with-temp/with-temp-defaults :model/Collection)))
          model-ids (t2/insert-returning-pks! :model/Card
                                              (for [coll-id coll-ids]
                                                (merge (t2.with-temp/with-temp-defaults :model/Card)
                                                       {:type          :model
                                                        :collection_id coll-id
                                                        :dataset_query (lib/query mp (lib.metadata/table mp (mt/id :venues)))})))
          created   (action/create-actions! (for [model-id model-ids]
                                              {:type          :query
                                               :name          "Archive call count"
                                               :creator_id    (mt/user->id :crowberto)
                                               :database_id   (mt/id)
                                               :model_id      model-id
                                               :dataset_query (lib/native-query mp "SELECT 1")}))
          actions   (vec (t2/select :model/Action :id [:in (map :id created)] {:order-by [[:id :asc]]}))]
      (testing "rasta, who writes no Action, is refused on a batch"
        (mt/with-test-user :rasta
          (is (false? (mi/can-update-each? :model/Action (subvec actions 0 3) {:archived true})))))
      (testing "a batch moved to a Collection that does not exist is a 404"
        (mt/with-test-user :crowberto
          (is (=? {:status-code 404}
                  (try
                    (mi/can-update-each? :model/Action (subvec actions 0 3) {:collection_id Integer/MAX_VALUE :model_id nil})
                    (catch clojure.lang.ExceptionInfo e
                      (ex-data e)))))))
      (testing "the question takes as many statements for 40 Actions of models in 40 Collections as for 10"
        (archive-call-count (subvec actions 0 2))
        (is (= (archive-call-count (subvec actions 0 10))
               (archive-call-count actions)))))))
