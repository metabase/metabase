(ns metabase.models.card-test
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.models
    :refer [Collection Dashboard DashboardCard ParameterCard NativeQuerySnippet Revision]]
   [metabase.models.card :as card]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(deftest dashboard-count-test
  (testing "Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in"
    (t2.with-temp/with-temp [:model/Card   {card-id :id} {}
                             Dashboard     dash-1        {}
                             Dashboard     dash-2        {}]
      (letfn [(add-card-to-dash! [dash]
                (t2/insert! DashboardCard
                            {:card_id      card-id
                             :dashboard_id (u/the-id dash)
                             :row          0
                             :col          0
                             :size_x       4
                             :size_y       4}))
              (get-dashboard-count []
                (card/dashboard-count (t2/select-one :model/Card :id card-id)))]
        (is (= 0
               (get-dashboard-count)))
        (testing "add to a Dashboard"
          (add-card-to-dash! dash-1)
          (is (= 1
                 (get-dashboard-count))))
        (testing "add to a second Dashboard"
          (add-card-to-dash! dash-2)
          (is (= 2
                 (get-dashboard-count))))))))

(deftest dropdown-widget-values-usage-count-test
  (let [hydrated-count (fn [card] (-> card
                                      (t2/hydrate :parameter_usage_count)
                                      :parameter_usage_count))
        default-params {:name       "Category Name"
                        :slug       "category_name"
                        :id         "_CATEGORY_NAME_"
                        :type       "category"}
        card-params    (fn [card-id] (merge default-params {:values_source_type "card"
                                                            :values_source_config {:card_id card-id}}))]
    (testing "With no associated cards"
      (t2.with-temp/with-temp [:model/Card card]
        (is (zero? (hydrated-count card)))))
    (testing "With one"
      (t2.with-temp/with-temp [:model/Card {card-id :id :as card} {}
                               Dashboard   _                      {:parameters [(card-params card-id)]}]
        (is (= 1 (hydrated-count card)))))
    (testing "With several"
      (t2.with-temp/with-temp [:model/Card {card-id :id :as card} {}
                               Dashboard   _                      {:parameters [(card-params card-id)]}
                               Dashboard   _                      {:parameters [(card-params card-id)]}
                               Dashboard   _                      {:parameters [(card-params card-id)]}]
        (is (= 3 (hydrated-count card)))))))

(deftest remove-from-dashboards-when-archiving-test
  (testing "Test that when somebody archives a Card, it is removed from any Dashboards it belongs to"
    (t2.with-temp/with-temp [Dashboard     dashboard {}
                             :model/Card   card      {}
                             DashboardCard _dashcard {:dashboard_id (u/the-id dashboard), :card_id (u/the-id card)}]
      (t2/update! :model/Card (u/the-id card) {:archived true})
      (is (= 0
             (t2/count DashboardCard :dashboard_id (u/the-id dashboard)))))))

(deftest public-sharing-test
  (testing "test that a Card's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (t2.with-temp/with-temp [:model/Card card {:public_uuid (str (random-uuid))}]
        (is (=? u/uuid-regex
                (:public_uuid card)))))

    (testing "...but if public sharing is *disabled* it should come back as `nil`"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (t2.with-temp/with-temp [:model/Card card {:public_uuid (str (random-uuid))}]
          (is (= nil
                 (:public_uuid card))))))))

(defn- dummy-dataset-query [database-id]
  {:database database-id
   :type     :native
   :native   {:query "SELECT count(*) FROM toucan_sightings;"}})

(deftest database-id-test
  (t2.with-temp/with-temp [:model/Card {:keys [id]} {:name          "some name"
                                                     :dataset_query (dummy-dataset-query (mt/id))
                                                     :database_id   (mt/id)}]
    (testing "before update"
      (is (= {:name "some name", :database_id (mt/id)}
             (into {} (t2/select-one [:model/Card :name :database_id] :id id)))))
    (t2/update! :model/Card id {:name          "another name"
                                :dataset_query (dummy-dataset-query (mt/id))})
    (testing "after update"
      (is (= {:name "another name" :database_id (mt/id)}
             (into {} (t2/select-one [:model/Card :name :database_id] :id id)))))))

(deftest disable-implicit-actions-if-needed-test
  (mt/with-actions-enabled
    (testing "when updating a model to include any clauses will disable implicit actions if they exist\n"
      (testing "happy paths\n"
        (let [query (mt/mbql-query users)]
          (doseq [query-change [{:limit       1}
                                {:expressions {"id + 1" [:+ (mt/$ids $users.id) 1]}}
                                {:filter      [:> (mt/$ids $users.id) 2]}
                                {:breakout    [(mt/$ids !month.users.last_login)]}
                                {:aggregation [[:count]]}
                                {:joins       [{:fields       :all
                                                :source-table (mt/id :checkins)
                                                :condition    [:= (mt/$ids $users.id) (mt/$ids $checkins.user_id)]
                                                :alias        "People"}]}
                                {:order-by    [[(mt/$ids $users.id) :asc]]}
                                {:fields      [(mt/$ids $users.id)]}]]
            (testing (format "when adding %s to the query" (first (keys query-change)))
              (mt/with-actions [{model-id :id}           {:dataset true :dataset_query query}
                                {action-id-1 :action-id} {:type :implicit
                                                          :kind "row/create"}
                                {action-id-2 :action-id} {:type :implicit
                                                          :kind "row/update"}]
                ;; make sure we have thing exists to start with
                (is (= 2 (t2/count 'Action :id [:in [action-id-1 action-id-2]])))
                (is (= 1 (t2/update! 'Card :id model-id {:dataset_query (update query :query merge query-change)})))
                ;; should be gone by now
                (is (= 0 (t2/count 'Action :id [:in [action-id-1 action-id-2]])))
                (is (= 0 (t2/count 'ImplicitAction :action_id [:in [action-id-1 action-id-2]])))
                ;; call it twice to make we don't get delete error if no actions are found
                (is (= 1 (t2/update! 'Card :id model-id {:dataset_query (update query :query merge query-change)})))))))))

    (testing "unhappy paths\n"
      (testing "should not attempt to delete if it's not a model"
        (t2.with-temp/with-temp [:model/Card {id :id} {:dataset       false
                                                       :dataset_query (mt/mbql-query users)}]
          (with-redefs [card/disable-implicit-action-for-model! (fn [& _args]
                                                                  (throw (ex-info "Should not be called" {})))]
            (is (= 1 (t2/update! 'Card :id id {:dataset_query (mt/mbql-query users {:limit 1})}))))))

      (testing "only disable implicit actions, not http and query"
        (mt/with-actions [{model-id :id}           {:dataset true :dataset_query (mt/mbql-query users)}
                          {implicit-id :action-id} {:type :implicit}
                          {http-id :action-id}     {:type :http}
                          {query-id :action-id}    {:type :query}]
          ;; make sure we have thing exists to start with
          (is (= 3 (t2/count 'Action :id [:in [implicit-id http-id query-id]])))

          (t2/update! 'Card :id model-id {:dataset_query (mt/mbql-query users {:limit 1})})
          (is (not (t2/exists? 'Action :id implicit-id)))
          (is (t2/exists? 'Action :id http-id))
          (is (t2/exists? 'Action :id query-id))))

      (testing "should not disable if change source table"
        (mt/with-actions [{model-id :id}           {:dataset true :dataset_query (mt/mbql-query users)}
                          {action-id-1 :action-id} {:type :implicit
                                                    :kind "row/create"}
                          {action-id-2 :action-id} {:type :implicit
                                                    :kind "row/update"}]
          ;; make sure we have thing exists to start with
          (is (= 2 (t2/count 'Action :id [:in [action-id-1 action-id-2]])))
          ;; change source from users to categories
          (t2/update! 'Card :id model-id {:dataset_query (mt/mbql-query categories)})
          ;; actions still exists
          (is (= 2 (t2/count 'Action :id [:in [action-id-1 action-id-2]])))
          (is (= 2 (t2/count 'ImplicitAction :action_id [:in [action-id-1 action-id-2]]))))))))

;;; ------------------------------------------ Circular Reference Detection ------------------------------------------

(defn- card-with-source-table
  "Generate values for a Card with `source-table` for use with `with-temp`."
  {:style/indent 1}
  [source-table & {:as kvs}]
  (merge {:dataset_query {:database (mt/id)
                          :type     :query
                          :query    {:source-table source-table}}}
         kvs))

(deftest circular-reference-test
  (testing "Should throw an Exception if saving a Card that references itself"
    (t2.with-temp/with-temp [:model/Card card (card-with-source-table (mt/id :venues))]
      ;; now try to make the Card reference itself. Should throw Exception
      (is (thrown?
           Exception
           (t2/update! :model/Card (u/the-id card)
                       (card-with-source-table (str "card__" (u/the-id card))))))))

  (testing "Do the same stuff with circular reference between two Cards... (A -> B -> A)"
    (t2.with-temp/with-temp [:model/Card card-a (card-with-source-table (mt/id :venues))
                             :model/Card card-b (card-with-source-table (str "card__" (u/the-id card-a)))]
      (is (thrown?
           Exception
           (t2/update! :model/Card (u/the-id card-a)
                       (card-with-source-table (str "card__" (u/the-id card-b))))))))

  (testing "ok now try it with A -> C -> B -> A"
    (t2.with-temp/with-temp [:model/Card card-a (card-with-source-table (mt/id :venues))
                             :model/Card card-b (card-with-source-table (str "card__" (u/the-id card-a)))
                             :model/Card card-c (card-with-source-table (str "card__" (u/the-id card-b)))]
      (is (thrown?
           Exception
           (t2/update! :model/Card (u/the-id card-a)
                       (card-with-source-table (str "card__" (u/the-id card-c)))))))))

(deftest validate-collection-namespace-test
  (t2.with-temp/with-temp [Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Card in a non-normal Collection"
      (let [card-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Card can only go in Collections in the \"default\" or :analytics namespace."
               (t2/insert! :model/Card (assoc (t2.with-temp/with-temp-defaults :model/Card) :collection_id collection-id, :name card-name))))
          (finally
            (t2/delete! :model/Card :name card-name)))))

    (testing "Shouldn't be able to move a Card to a non-normal Collection"
      (t2.with-temp/with-temp [:model/Card {card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Card can only go in Collections in the \"default\" or :analytics namespace."
             (t2/update! :model/Card card-id {:collection_id collection-id})))))))

(deftest normalize-result-metadata-test
  (testing "Should normalize result metadata keys when fetching a Card from the DB"
    (let [metadata (qp/query->expected-cols (mt/mbql-query venues))]
      (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset_query   (mt/mbql-query venues)
                                                          :result_metadata metadata}]
        (is (= (mt/derecordize metadata)
               (mt/derecordize (t2/select-one-fn :result_metadata :model/Card :id card-id))))))))

(deftest populate-result-metadata-if-needed-test
  (doseq [[creating-or-updating f]
          {"creating" (fn [properties f]
                        (t2.with-temp/with-temp [:model/Card {card-id :id} properties]
                          (f (t2/select-one-fn :result_metadata :model/Card :id card-id))))
           "updating" (fn [changes f]
                        (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset_query   (mt/mbql-query checkins)
                                                                            :result_metadata (qp/query->expected-cols (mt/mbql-query checkins))}]
                          (t2/update! :model/Card card-id changes)
                          (f (t2/select-one-fn :result_metadata :model/Card :id card-id))))}]

    (testing (format "When %s a Card\n" creating-or-updating)
      (testing "If result_metadata is empty, we should attempt to populate it"
        (f {:dataset_query (mt/mbql-query venues)}
           (fn [metadata]
             (is (= (map :name (qp/query->expected-cols (mt/mbql-query venues)))
                    (map :name metadata))))))
      (testing "Don't overwrite result_metadata that was passed in"
        (let [metadata (take 1 (qp/query->expected-cols (mt/mbql-query venues)))]
          (f {:dataset_query   (mt/mbql-query venues)
              :result_metadata metadata}
             (fn [new-metadata]
               (is (= (mt/derecordize metadata)
                      (mt/derecordize new-metadata)))))))
      (testing "Shouldn't barf if query can't be run (e.g. if query is a SQL query); set metadata to nil"
        (f {:dataset_query (mt/native-query {:native "SELECT * FROM VENUES"})}
           (fn [metadata]
             (is (= nil
                    metadata))))))))

;; this is a separate function so we can use the same tests for DashboardCards as well
(defn test-visualization-settings-normalization [f]
  (testing "visualization settings should get normalized to use modern MBQL syntax"
    (testing "Field references in column settings"
      (doseq [[original expected] {[:ref [:field-literal "foo" :type/Float]]
                                   [:ref [:field "foo" {:base-type :type/Float}]]

                                   [:ref [:field-id 1]]
                                   [:ref [:field 1 nil]]

                                   [:ref [:expression "wow"]]
                                   [:ref [:expression "wow"]]}
              ;; also check that normalization of already-normalized refs is idempotent
              original [original expected]
              ;; frontend uses JSON-serialized versions of the MBQL clauses as keys
              :let     [original (json/generate-string original)
                        expected (json/generate-string expected)]]
        (testing (format "Viz settings field ref key %s should get normalized to %s"
                         (pr-str original)
                         (pr-str expected))
          (f
           {:column_settings {original {:currency "BTC"}}}
           {:column_settings {expected {:currency "BTC"}}}))))

    (testing "Other MBQL field clauses"
      (let [original {:map.type                 "region"
                      :map.region               "us_states"
                      :pivot_table.column_split {:rows    [["datetime-field" ["field-id" 807] "year"]]
                                                 :columns [["fk->" ["field-id" 805] ["field-id" 808]]]
                                                 :values  [["aggregation" 0]]}}
            expected {:map.type                 "region"
                      :map.region               "us_states"
                      :pivot_table.column_split {:rows    [[:field 807 {:temporal-unit :year}]]
                                                 :columns [[:field 808 {:source-field 805}]]
                                                 :values  [[:aggregation 0]]}}]
        (f original expected)))

    (testing "Don't normalize non-MBQL arrays"
      (let [original {:graph.show_goal  true
                      :graph.goal_value 5.9
                      :graph.dimensions ["the_day"]
                      :graph.metrics    ["total_per_day"]}]
        (f original original)))

    (testing "Don't normalize key-value pairs in maps that could be interpreted as MBQL clauses"
      (let [original {:field-id 1}]
        (f original original)))

    (testing "Don't normalize array in graph.metrics that could be interpreted as MBQL clauses"
      (let [original {:graph.metrics ["expression" "sum" "count"]}]
        (f original original)))))

(deftest normalize-visualization-settings-test
  (test-visualization-settings-normalization
   (fn [original expected]
     (t2.with-temp/with-temp [:model/Card card {:visualization_settings original}]
       (is (= expected
              (t2/select-one-fn :visualization_settings :model/Card :id (u/the-id card))))))))

(deftest validate-template-tag-field-ids-test
  (testing "Disallow saving a Card with native query Field filter template tags referencing a different Database (#14145)"
    (let [test-data-db-id      (mt/id)
          sample-dataset-db-id (mt/dataset sample-dataset (mt/id))
          card-data            (fn [database-id]
                                 {:database_id   database-id
                                  :dataset_query {:database database-id
                                                  :type     :native
                                                  :native   {:query         "SELECT COUNT(*) FROM PRODUCTS WHERE {{FILTER}}"
                                                             :template-tags {"FILTER" {:id           "_FILTER_"
                                                                                       :name         "FILTER"
                                                                                       :display-name "Filter"
                                                                                       :type         :dimension
                                                                                       :dimension    [:field (mt/id :venues :name) nil]
                                                                                       :widget-type  :string/=
                                                                                       :default      nil}}}}})
          good-card-data       (card-data test-data-db-id)
          bad-card-data        (card-data sample-dataset-db-id)]
      (testing "Should not be able to create new Card with a filter with the wrong Database ID"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid Field Filter: Field \d+ \"VENUES\"\.\"NAME\" belongs to Database \d+ \"test-data\", but the query is against Database \d+ \"sample-dataset\""
             (t2.with-temp/with-temp [:model/Card _ bad-card-data]))))
      (testing "Should not be able to update a Card to have a filter with the wrong Database ID"
        (t2.with-temp/with-temp [:model/Card {card-id :id} good-card-data]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid Field Filter: Field \d+ \"VENUES\"\.\"NAME\" belongs to Database \d+ \"test-data\", but the query is against Database \d+ \"sample-dataset\""
               (t2/update! :model/Card card-id bad-card-data))))))))

;;; ------------------------------------------ Parameters tests ------------------------------------------

(deftest validate-parameters-test
  (testing "Should validate Card :parameters when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameters must be a sequence of maps with :id and :type keys"
           (t2.with-temp/with-temp [:model/Card _ {:parameters {:a :b}}])))

      (t2.with-temp/with-temp [:model/Card card {:parameters [{:id   "valid-id"
                                                               :type "id"}]}]
        (is (some? card))))

    (testing "updating"
      (t2.with-temp/with-temp [:model/Card {:keys [id]} {:parameters []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameters must be a sequence of maps with :id and :type keys"
             (t2/update! :model/Card id {:parameters [{:id 100}]})))
        (is (pos? (t2/update! :model/Card id {:parameters [{:id   "new-valid-id"
                                                            :type "id"}]})))))))

(deftest normalize-parameters-test
  (testing ":parameters should get normalized when coming out of the DB"
    (doseq [[target expected] {[:dimension [:field-id 1000]] [:dimension [:field 1000 nil]]
                               [:field-id 1000]              [:field 1000 nil]}]
      (testing (format "target = %s" (pr-str target))
        (t2.with-temp/with-temp [:model/Card {card-id :id} {:parameter_mappings [{:parameter_id     "_CATEGORY_NAME_"
                                                                                  :target target}]}]

          (is (= [{:parameter_id     "_CATEGORY_NAME_"
                   :target expected}]
                 (t2/select-one-fn :parameter_mappings :model/Card :id card-id))))))))

(deftest validate-parameter-mappings-test
  (testing "Should validate Card :parameter_mappings when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameter_mappings must be a sequence of maps with :parameter_id and :type keys"
           (t2.with-temp/with-temp [:model/Card _ {:parameter_mappings {:a :b}}])))

      (t2.with-temp/with-temp [:model/Card card {:parameter_mappings [{:parameter_id "valid-id"
                                                                       :target       [:field 1000 nil]}]}]
        (is (some? card))))

    (testing "updating"
      (t2.with-temp/with-temp [:model/Card {:keys [id]} {:parameter_mappings []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameter_mappings must be a sequence of maps with :parameter_id and :type keys"
             (t2/update! :model/Card id {:parameter_mappings [{:parameter_id 100}]})))

        (is (pos? (t2/update! :model/Card id {:parameter_mappings [{:parameter_id "new-valid-id"
                                                                    :target       [:field 1000 nil]}]})))))))

(deftest normalize-parameter-mappings-test
  (testing ":parameter_mappings should get normalized when coming out of the DB"
    (t2.with-temp/with-temp [:model/Card {card-id :id} {:parameter_mappings [{:parameter_id "22486e00"
                                                                              :card_id      1
                                                                              :target       [:dimension [:field-id 1]]}]}]
      (is (= [{:parameter_id "22486e00",
               :card_id      1,
               :target       [:dimension [:field 1 nil]]}]
             (t2/select-one-fn :parameter_mappings :model/Card :id card-id))))))

(deftest identity-hash-test
  (testing "Card hashes are composed of the name and the collection's hash"
    (let [now #t "2022-09-01T12:34:56"]
      (mt/with-temp [Collection  coll {:name "field-db" :location "/" :created_at now}
                     :model/Card card {:name "the card" :collection_id (:id coll) :created_at now}]
        (is (= "5199edf0"
               (serdes/raw-hash ["the card" (serdes/identity-hash coll) now])
               (serdes/identity-hash card)))))))

(deftest parameter-card-test
  (let [default-params {:name       "Category Name"
                        :slug       "category_name"
                        :id         "_CATEGORY_NAME_"
                        :type       "category"}]
    (testing "parameter with source is card create ParameterCard"
      (t2.with-temp/with-temp [:model/Card  {source-card-id-1 :id} {}
                               :model/Card  {source-card-id-2 :id} {}
                               :model/Card  {card-id :id}          {:parameters [(merge default-params
                                                                                        {:values_source_type    "card"
                                                                                         :values_source_config {:card_id source-card-id-1}})]}]
        (is (=? [{:card_id                   source-card-id-1
                  :parameterized_object_type :card
                  :parameterized_object_id   card-id
                  :parameter_id              "_CATEGORY_NAME_"}]
                (t2/select 'ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id)))

        (testing "update values_source_config.card_id will update ParameterCard"
          (t2/update! :model/Card card-id {:parameters [(merge default-params
                                                               {:values_source_type    "card"
                                                                :values_source_config {:card_id source-card-id-2}})]})
          (is (=? [{:card_id                   source-card-id-2
                    :parameterized_object_type :card
                    :parameterized_object_id   card-id
                    :parameter_id              "_CATEGORY_NAME_"}]
                  (t2/select 'ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id))))

        (testing "delete the card will delete ParameterCard"
          (t2/delete! :model/Card :id card-id)
          (is (= []
                 (t2/select 'ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id))))))

    (testing "Delete a card will delete any ParameterCard that linked to it"
      (t2.with-temp/with-temp [:model/Card  {source-card-id :id} {}
                               :model/Card  {card-id-1 :id}      {:parameters [(merge default-params
                                                                                      {:values_source_type    "card"
                                                                                       :values_source_config {:card_id source-card-id}})]}
                               :model/Card  {card-id-2 :id}      {:parameters [(merge default-params
                                                                                      {:values_source_type    "card"
                                                                                       :values_source_config {:card_id source-card-id}})]}]
        ;; makes sure we have ParameterCard to start with
        (is (=? [{:card_id                   source-card-id
                  :parameterized_object_type :card
                  :parameterized_object_id   card-id-1
                  :parameter_id              "_CATEGORY_NAME_"}
                 {:card_id                   source-card-id
                  :parameterized_object_type :card
                  :parameterized_object_id   card-id-2
                  :parameter_id              "_CATEGORY_NAME_"}]
                (t2/select 'ParameterCard :card_id source-card-id {:order-by [[:parameterized_object_id :asc]]})))
        (t2/delete! :model/Card :id source-card-id)
        (is (= []
               (t2/select 'ParameterCard :card_id source-card-id)))))))

(deftest cleanup-parameter-on-card-changes-test
  (mt/dataset sample-dataset
    (mt/with-temp
      [:model/Card {source-card-id :id} (merge (mt/card-with-source-metadata-for-query
                                                (mt/mbql-query products {:fields [(mt/$ids $products.title)
                                                                                  (mt/$ids $products.category)]
                                                                         :limit 5}))
                                               {:database_id (mt/id)
                                                :table_id    (mt/id :products)})
       :model/Card card                 {:parameters [{:name                  "Param 1"
                                                       :id                    "param_1"
                                                       :type                  "category"
                                                       :values_source_type    "card"
                                                       :values_source_config {:card_id source-card-id
                                                                              :value_field (mt/$ids $products.title)}}]}
       Dashboard   dashboard            {:parameters [{:name       "Param 2"
                                                       :id         "param_2"
                                                       :type       "category"
                                                       :values_source_type    "card"
                                                       :values_source_config {:card_id source-card-id
                                                                              :value_field (mt/$ids $products.category)}}]}]
      ;; check if we had parametercard to starts with
      (is (=? [{:card_id                   source-card-id
                :parameter_id              "param_1"
                :parameterized_object_type :card
                :parameterized_object_id   (:id card)}
               {:card_id                   source-card-id
                :parameter_id              "param_2"
                :parameterized_object_type :dashboard
                :parameterized_object_id   (:id dashboard)}]
              (t2/select ParameterCard :card_id source-card-id {:order-by [[:parameter_id :asc]]})))
      ;; update card with removing the products.category
      (testing "on update result_metadata"
        (t2/update! :model/Card source-card-id
                    (mt/card-with-source-metadata-for-query
                     (mt/mbql-query products {:fields [(mt/$ids $products.title)]
                                              :limit 5})))

        (testing "ParameterCard for dashboard is removed"
          (is (=? [{:card_id                   source-card-id
                    :parameter_id              "param_1"
                    :parameterized_object_type :card
                    :parameterized_object_id   (:id card)}]
                  (t2/select ParameterCard :card_id source-card-id))))

        (testing "update the dashboard parameter and remove values_config of dashboard"
          (is (=? [{:id   "param_2"
                    :name "Param 2"
                    :type :category}]
                  (t2/select-one-fn :parameters Dashboard :id (:id dashboard))))

          (testing "but no changes with parameter on card"
            (is (=? [{:name                 "Param 1"
                      :id                   "param_1"
                      :type                 :category
                      :values_source_type   "card"
                      :values_source_config {:card_id     source-card-id
                                             :value_field (mt/$ids $products.title)}}]
                    (t2/select-one-fn :parameters :model/Card :id (:id card)))))))

     (testing "on archive card"
       (t2/update! :model/Card source-card-id {:archived true})

       (testing "ParameterCard for card is removed"
         (is (=? [] (t2/select ParameterCard :card_id source-card-id))))

       (testing "update the dashboard parameter and remove values_config of card"
         (is (=? [{:id   "param_1"
                   :name "Param 1"
                   :type :category}]
                 (t2/select-one-fn :parameters :model/Card :id (:id card)))))))))

(deftest descendants-test
  (testing "regular cards don't depend on anything"
    (mt/with-temp [:model/Card card {:name "some card"}]
      (is (empty? (serdes/descendants "Card" (:id card))))))

  (testing "cards which have another card as the source depend on that card"
    (mt/with-temp [:model/Card card1 {:name "base card"}
                   :model/Card card2 {:name "derived card"
                                      :dataset_query {:query {:source-table (str "card__" (:id card1))}}}]
      (is (empty? (serdes/descendants "Card" (:id card1))))
      (is (= #{["Card" (:id card1)]}
             (serdes/descendants "Card" (:id card2))))))

  (testing "cards that has a native template tag"
    (mt/with-temp [NativeQuerySnippet snippet {:name "category" :content "category = 'Gizmo'"}
                   :model/Card        card    {:name          "Business Card"
                                               :dataset_query {:native
                                                               {:template-tags {:snippet {:name         "snippet"
                                                                                          :type         :snippet
                                                                                          :snippet-name "snippet"
                                                                                          :snippet-id   (:id snippet)}}
                                                                :query "select * from products where {{snippet}}"}}}]
      (is (= #{["NativeQuerySnippet" (:id snippet)]}
             (serdes/descendants "Card" (:id card))))))

  (testing "cards which have parameter's source is another card"
    (mt/with-temp [:model/Card card1 {:name "base card"}
                   :model/Card card2 {:name       "derived card"
                                      :parameters [{:id                   "valid-id"
                                                    :type                 "id"
                                                    :values_source_type   "card"
                                                    :values_source_config {:card_id (:id card1)}}]}]
      (is (= #{["Card" (:id card1)]}
             (serdes/descendants "Card" (:id card2)))))))

(deftest extract-test
  (let [metadata (qp/query->expected-cols (mt/mbql-query venues))
        query    (mt/mbql-query venues)]
    (testing "normal cards omit result_metadata"
      (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset_query   query
                                                          :result_metadata metadata}]
        (let [extracted (serdes/extract-one "Card" nil (t2/select-one :model/Card :id card-id))]
          (is (not (:dataset extracted)))
          (is (nil? (:result_metadata extracted))))))
    (testing "dataset cards (models) retain result_metadata"
      (t2.with-temp/with-temp [:model/Card {card-id :id} {:dataset         true
                                                          :dataset_query   query
                                                          :result_metadata metadata}]
        (let [extracted (serdes/extract-one "Card" nil (t2/select-one :model/Card :id card-id))]
          (is (:dataset extracted))
          (is (string? (:display_name (first (:result_metadata extracted)))))
          ;; this is a quick comparison, since the actual stored metadata is quite complex
          (is (= (map :display_name metadata)
                 (map :display_name (:result_metadata extracted)))))))))

;;; ------------------------------------------ Viz Settings Tests  ------------------------------------------

(deftest upgrade-to-v2-db-test
  (testing ":visualization_settings v. 1 should be upgraded to v. 2 on select"
    (t2.with-temp/with-temp [:model/Card {card-id :id} {:visualization_settings {:pie.show_legend true}}]
      (is (= {:version 2
              :pie.show_legend true
              :pie.percent_visibility "inside"}
             (t2/select-one-fn :visualization_settings :model/Card :id card-id)))))
  (testing ":visualization_settings v. 1 should be upgraded to v. 2 and persisted on update"
    (t2.with-temp/with-temp [:model/Card {card-id :id} {:visualization_settings {:pie.show_legend true}}]
      (t2/update! :model/Card card-id {:name "Favorite Toucan Foods"})
      (is (= {:version 2
              :pie.show_legend true
              :pie.percent_visibility "inside"}
             (-> (t2/select-one (t2/table-name :model/Card) {:where [:= :id card-id]})
                 :visualization_settings
                 (json/parse-string keyword)))))))


;;; -------------------------------------------- Revision tests  --------------------------------------------

(deftest ^:parallel diff-cards-str-test
  (are [x y expected] (= expected
                       (u/build-sentence (revision/diff-strings :model/Card x y)))
    {:name        "Diff Test"
     :description nil}
    {:name        "Diff Test Changed"
     :description "foobar"}
    "added a description and renamed it from \"Diff Test\" to \"Diff Test Changed\"."

    {:name "Apple"}
    {:name "Next"}
    "renamed this Card from \"Apple\" to \"Next\"."

    {:display :table}
    {:display :pie}
    "changed the display from table to pie."

    {:name        "Diff Test"
     :description nil}
    {:name        "Diff Test changed"
     :description "New description"}
    "added a description and renamed it from \"Diff Test\" to \"Diff Test changed\"."))


(deftest diff-cards-str-update-collection--test
 (t2.with-temp/with-temp
     [Collection {coll-id-1 :id} {:name "Old collection"}
      Collection {coll-id-2 :id} {:name "New collection"}]
     (are [x y expected] (= expected
                          (u/build-sentence (revision/diff-strings :model/Card x y)))

       {:name "Apple"}
       {:name          "Apple"
        :collection_id coll-id-2}
       "moved this Card to New collection."

       {:name        "Diff Test"
        :description nil}
       {:name        "Diff Test changed"
        :description "New description"}
       "added a description and renamed it from \"Diff Test\" to \"Diff Test changed\"."

       {:name          "Apple"
        :collection_id coll-id-1}
       {:name          "Apple"
        :collection_id coll-id-2}
       "moved this Card from Old collection to New collection.")))

(defn- create-card-revision!
  "Fetch the latest version of a Dashboard and save a revision entry for it. Returns the fetched Dashboard."
  [card-id is-creation?]
  (revision/push-revision!
   {:object       (t2/select-one :model/Card :id card-id)
    :entity       :model/Card
    :id           card-id
    :user-id      (mt/user->id :crowberto)
    :is-creation? is-creation?}))

(deftest record-revision-and-description-completeness-test
  (t2.with-temp/with-temp
    [:model/Database  db    {:name "random db"}
     :model/Card      card  {:name                "A Card"
                             :description          "An important card"
                             :collection_position 0
                             :cache_ttl           1000
                             :archived            false
                             :dataset             false
                             :parameters          [{:name       "Category Name"
                                                    :slug       "category_name"
                                                    :id         "_CATEGORY_NAME_"
                                                    :type       "category"}]}
     Collection       coll {:name "A collection"}]
    (mt/with-temporary-setting-values [enable-public-sharing true]
      (let [columns     (disj (set/difference (set (keys card)) (set @#'card/excluded-columns-for-card-revision))
                              ;; we only record result metadata for models, so we'll test that seperately
                              :result_metadata)
            update-col  (fn [col value]
                          (cond
                            (= col :collection_id)     (:id coll)
                            (= col :parameters)        (cons {:name "Category ID"
                                                              :slug "category_id"
                                                              :id   "_CATEGORY_ID_"
                                                              :type "number"}
                                                             value)
                            (= col :display)           :pie
                            (= col :made_public_by_id) (mt/user->id :crowberto)
                            (= col :embedding_params)  {:category_name "locked"}
                            (= col :public_uuid)       (str (random-uuid))
                            (= col :table_id)          (mt/id :venues)
                            (= col :database_id)       (:id db)
                            (= col :query_type)        :native
                            (= col :dataset_query)     (mt/mbql-query users)
                            (= col :visualization_settings) {:text "now it's a text card"}
                            (int? value)               (inc value)
                            (boolean? value)           (not value)
                            (string? value)            (str value "_changed")))]
        (doseq [col columns]
          (let [before  (select-keys card [col])
                changes {col (update-col col (get card col))}]
            ;; we'll automatically delete old revisions if we have more than [[revision/max-revisions]]
            ;; revisions for an instance, so let's clear everything to make it easier to test
            (t2/delete! Revision :model "Card" :model_id (:id card))
            (t2/update! :model/Card (:id card) changes)
            (create-card-revision! (:id card) false)

            (testing (format "we should track when %s changes" col)
              (is (= 1 (t2/count Revision :model "Card" :model_id (:id card)))))

            (when-not (#{;; these columns are expected to not have a description because it's always
                         ;; comes with a dataset_query changes
                         :table_id :database_id :query_type
                         ;; we don't need a description for made_public_by_id because whenever this field changes
                         ;; public_uuid will change and we have a description for it.
                         :made_public_by_id} col)
              (testing (format "we should have a revision description for %s" col)
                (is (some? (u/build-sentence
                             (revision/diff-strings
                               Dashboard
                               before
                               changes)))))))))))

 ;; test tracking result_metadata for models
 (let [card-info (mt/card-with-source-metadata-for-query
                   (mt/mbql-query venues))]
   (t2.with-temp/with-temp
     [:model/Card card card-info]
     (let [before  (select-keys card [:result_metadata])
           changes (update before :result_metadata drop-last)]
       (t2/update! :model/Card (:id card) changes)
       (create-card-revision! (:id card) false)

       (testing "we should track when :result_metadata changes on model"
         (is (= 1 (t2/count Revision :model "Card" :model_id (:id card)))))

       (testing "we should have a revision description for :result_metadata on model"
         (is (some? (u/build-sentence
                      (revision/diff-strings
                        Dashboard
                        before
                        changes)))))))))

(deftest storing-metabase-version
  (testing "Newly created Card should know a Metabase version used to create it"
    (t2.with-temp/with-temp [:model/Card card {}]
      (is (= config/mb-version-string (:metabase_version card)))

      (with-redefs [config/mb-version-string "blablabla"]
        (t2/update! :model/Card :id (:id card) {:description "test"}))

      ;; we store version of metabase which created the card
      (is (= config/mb-version-string
             (t2/select-one-fn :metabase_version :model/Card :id (:id card)))))))

(deftest changed?-test
  (letfn [(changed? [before after]
            (#'card/changed? @#'card/card-compare-keys before after))]
    (testing "Ignores keyword/string"
      (is (false? (changed? {:dataset_query {:type :query}} {:dataset_query {:type "query"}}))))
    (testing "Ignores properties not in `api.card/card-compare-keys"
      (is (false? (changed? {:collection_id 1
                             :collection_position 0}
                            {:collection_id 2
                             :collection_position 1}))))
    (testing "Sees changes"
      (is (true? (changed? {:dataset_query {:type :query}}
                           {:dataset_query {:type :query
                                            :query {}}})))
      (testing "But only when they are different in the after, not just omitted"
        (is (false? (changed? {:dataset_query {} :collection_id 1}
                              {:collection_id 1})))
        (is (true? (changed? {:dataset_query {} :collection_id 1}
                             {:dataset_query nil :collection_id 1})))))))
