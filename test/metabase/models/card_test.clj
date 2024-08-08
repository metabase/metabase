(ns metabase.models.card-test
  (:require
   [cheshire.core :as json]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.audit :as audit]
   [metabase.config :as config]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.models.card :as card]
   [metabase.models.interface :as mi]
   [metabase.models.parameter-card :as parameter-card]
   [metabase.models.revision :as revision]
   [metabase.models.serialization :as serdes]
   [metabase.query-processor.card-test :as qp.card-test]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(deftest dashboard-count-test
  (testing "Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in"
    (t2.with-temp/with-temp [:model/Card      {card-id :id} {}
                             :model/Dashboard dash-1        {}
                             :model/Dashboard dash-2        {}]
      (letfn [(add-card-to-dash! [dash]
                (t2/insert! :model/DashboardCard
                            {:card_id      card-id
                             :dashboard_id (u/the-id dash)
                             :row          0
                             :col          0
                             :size_x       4
                             :size_y       4}))
              (get-dashboard-count []
                (-> (t2/select-one :model/Card :id card-id)
                    (t2/hydrate :dashboard_count)
                    :dashboard_count))]
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
      (t2.with-temp/with-temp [:model/Card      {card-id :id :as card} {}
                               :model/Dashboard _                      {:parameters [(card-params card-id)]}]
        (is (= 1 (hydrated-count card)))))
    (testing "With several"
      (t2.with-temp/with-temp [:model/Card      {card-id :id :as card} {}
                               :model/Dashboard _                      {:parameters [(card-params card-id)]}
                               :model/Dashboard _                      {:parameters [(card-params card-id)]}
                               :model/Dashboard _                      {:parameters [(card-params card-id)]}]
        (is (= 3 (hydrated-count card)))))))

(deftest public-sharing-test
  (testing "test that a Card's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (t2.with-temp/with-temp [:model/Card card {:public_uuid (str (random-uuid))}]
        (is (=? u/uuid-regex
                (:public_uuid card)))))))

(deftest public-sharing-test-2
  (testing "test that a Card's :public_uuid comes back if public sharing is enabled..."
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
              (mt/with-actions [{model-id :id}           {:type :model, :dataset_query query}
                                {action-id-1 :action-id} {:type :implicit
                                                          :kind "row/create"}
                                {action-id-2 :action-id} {:type :implicit
                                                          :kind "row/update"}]
                ;; make sure we have thing exists to start with
                (is (= 2 (t2/count :model/Action :id [:in [action-id-1 action-id-2]])))
                (is (= 1 (t2/update! :model/Card :id model-id {:dataset_query (update query :query merge query-change)})))
                ;; should be gone by now
                (is (= 0 (t2/count :model/Action :id [:in [action-id-1 action-id-2]])))
                (is (= 0 (t2/count :model/ImplicitAction :action_id [:in [action-id-1 action-id-2]])))
                ;; call it twice to make we don't get delete error if no actions are found
                (is (= 1 (t2/update! :model/Card :id model-id {:dataset_query (update query :query merge query-change)})))))))))))

(deftest disable-implicit-actions-if-needed-test-2
  (mt/with-actions-enabled
    (testing "unhappy paths\n"
      (testing "should not attempt to delete if it's not a model"
        (t2.with-temp/with-temp [:model/Card {id :id} {:type          :question
                                                       :dataset_query (mt/mbql-query users)}]
          (with-redefs [card/disable-implicit-action-for-model! (fn [& _args]
                                                                  (throw (ex-info "Should not be called" {})))]
            (is (= 1 (t2/update! :model/Card :id id {:dataset_query (mt/mbql-query users {:limit 1})})))))))))

(deftest disable-implicit-actions-if-needed-test-3
  (mt/with-actions-enabled
    (testing "unhappy paths\n"
      (testing "only disable implicit actions, not http and query"
        (mt/with-actions [{model-id :id}           {:type :model, :dataset_query (mt/mbql-query users)}
                          {implicit-id :action-id} {:type :implicit}
                          {http-id :action-id}     {:type :http}
                          {query-id :action-id}    {:type :query}]
          ;; make sure we have thing exists to start with
          (is (= 3 (t2/count :model/Action :id [:in [implicit-id http-id query-id]])))
          (t2/update! :model/Card :id model-id {:dataset_query (mt/mbql-query users {:limit 1})})
          (is (not (t2/exists? :model/Action :id implicit-id)))
          (is (t2/exists? :model/Action :id http-id))
          (is (t2/exists? :model/Action :id query-id)))))))

(deftest disable-implicit-actions-if-needed-test-4
  (mt/with-actions-enabled
    (testing "unhappy paths\n"
      (testing "should not disable if change source table"
        (mt/with-actions [{model-id :id}           {:type :model, :dataset_query (mt/mbql-query users)}
                          {action-id-1 :action-id} {:type :implicit
                                                    :kind "row/create"}
                          {action-id-2 :action-id} {:type :implicit
                                                    :kind "row/update"}]
          ;; make sure we have thing exists to start with
          (is (= 2 (t2/count :model/Action :id [:in [action-id-1 action-id-2]])))
          ;; change source from users to categories
          (t2/update! :model/Card :id model-id {:dataset_query (mt/mbql-query categories)})
          ;; actions still exists
          (is (= 2 (t2/count :model/Action :id [:in [action-id-1 action-id-2]])))
          (is (= 2 (t2/count :model/ImplicitAction :action_id [:in [action-id-1 action-id-2]]))))))))

;;; ------------------------------------------ Circular Reference Detection ------------------------------------------

(defn- card-with-source-table
  "Generate values for a Card with `source-table` for use with `with-temp`."
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
                       (card-with-source-table (str "card__" (u/the-id card)))))))))

(deftest circular-reference-test-2
  (testing "Do the same stuff with circular reference between two Cards... (A -> B -> A)"
    (t2.with-temp/with-temp [:model/Card card-a (card-with-source-table (mt/id :venues))
                             :model/Card card-b (card-with-source-table (str "card__" (u/the-id card-a)))]
      (is (thrown?
           Exception
           (t2/update! :model/Card (u/the-id card-a)
                       (card-with-source-table (str "card__" (u/the-id card-b)))))))))

(deftest circular-reference-test-3
  (testing "ok now try it with A -> C -> B -> A"
    (t2.with-temp/with-temp [:model/Card card-a (card-with-source-table (mt/id :venues))
                             :model/Card card-b (card-with-source-table (str "card__" (u/the-id card-a)))
                             :model/Card card-c (card-with-source-table (str "card__" (u/the-id card-b)))]
      (is (thrown?
           Exception
           (t2/update! :model/Card (u/the-id card-a)
                       (card-with-source-table (str "card__" (u/the-id card-c)))))))))

(deftest validate-collection-namespace-test
  (t2.with-temp/with-temp [:model/Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Card in a non-normal Collection"
      (let [card-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Card can only go in Collections in the \"default\" or :analytics namespace."
               (t2/insert! :model/Card (assoc (t2.with-temp/with-temp-defaults :model/Card) :collection_id collection-id, :name card-name))))
          (finally
            (t2/delete! :model/Card :name card-name)))))))

(deftest validate-collection-namespace-test-2
  (t2.with-temp/with-temp [:model/Collection {collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to move a Card to a non-normal Collection"
      (t2.with-temp/with-temp [:model/Card {card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Card can only go in Collections in the \"default\" or :analytics namespace."
             (t2/update! :model/Card card-id {:collection_id collection-id})))))))

(deftest ^:parallel normalize-result-metadata-test
  (testing "Should normalize result metadata keys when fetching a Card from the DB"
    (let [metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))]
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
                                                                            :result_metadata (qp.preprocess/query->expected-cols (mt/mbql-query checkins))}]
                          (t2/update! :model/Card card-id changes)
                          (f (t2/select-one-fn :result_metadata :model/Card :id card-id))))}]

    (testing (format "When %s a Card\n" creating-or-updating)
      (testing "If result_metadata is empty, we should attempt to populate it"
        (f {:dataset_query (mt/mbql-query venues)}
           (fn [metadata]
             (is (= (map :name (qp.preprocess/query->expected-cols (mt/mbql-query venues)))
                    (map :name metadata))))))
      (testing "Don't overwrite result_metadata that was passed in"
        (let [metadata (take 1 (qp.preprocess/query->expected-cols (mt/mbql-query venues)))]
          (f {:dataset_query   (mt/mbql-query venues)
              :result_metadata metadata}
             (fn [new-metadata]
               (is (= (mt/derecordize metadata)
                      (mt/derecordize new-metadata)))))))
      (testing "Shouldn't barf if query can't be run (e.g. if query is a SQL query); set metadata to nil"
        (f {:dataset_query (mt/native-query {:native "SELECT * FROM VENUES"})}
           (fn [metadata]
             (is (= nil
                    metadata)))))
      (testing "Shouldn't remove verified result metadata from native queries (#37009)"
        (let [metadata (qp.preprocess/query->expected-cols (mt/mbql-query checkins))]
          (f (cond-> {:dataset_query (mt/native-query {:native "SELECT * FROM CHECKINS"})
                      :result_metadata metadata}
               (= creating-or-updating "updating")
               (assoc :verified-result-metadata? true))
             (fn [new-metadata]
               (is (= (mt/derecordize metadata)
                      (mt/derecordize new-metadata))))))))))

(defn- test-visualization-settings-normalization-1 [f]
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
           {:column_settings {expected {:currency "BTC"}}}))))))

(defn- test-visualization-settings-normalization-2 [f]
  (testing "visualization settings should get normalized to use modern MBQL syntax"
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
        (f original expected)))))

(defn- test-visualization-settings-normalization-3 [f]
  (testing "visualization settings should get normalized to use modern MBQL syntax"
    (testing "Don't normalize non-MBQL arrays"
      (let [original {:graph.show_goal  true
                      :graph.goal_value 5.9
                      :graph.dimensions ["the_day"]
                      :graph.metrics    ["total_per_day"]}]
        (f original original)))))

(defn- test-visualization-settings-normalization-4 [f]
  (testing "visualization settings should get normalized to use modern MBQL syntax"
    (testing "Don't normalize key-value pairs in maps that could be interpreted as MBQL clauses"
      (let [original {:field-id 1}]
        (f original original)))))

(defn- test-visualization-settings-normalization-5 [f]
  (testing "visualization settings should get normalized to use modern MBQL syntax"
    (testing "Don't normalize array in graph.metrics that could be interpreted as MBQL clauses"
      (let [original {:graph.metrics ["expression" "sum" "count"]}]
        (f original original)))))

;; this is a separate function so we can use the same tests for DashboardCards as well
(defn test-visualization-settings-normalization [f]
  (testing "visualization settings should get normalized to use modern MBQL syntax"
    (doseq [varr [#'test-visualization-settings-normalization-1
                  #'test-visualization-settings-normalization-2
                  #'test-visualization-settings-normalization-3
                  #'test-visualization-settings-normalization-4
                  #'test-visualization-settings-normalization-5]]
      (testing varr
        (varr f)))))

(deftest normalize-visualization-settings-test
  (test-visualization-settings-normalization
   (fn [original expected]
     (t2.with-temp/with-temp [:model/Card card {:visualization_settings original}]
       (is (= expected
              (t2/select-one-fn :visualization_settings :model/Card :id (u/the-id card))))))))

(deftest ^:parallel template-tag-parameters-test
  (testing "Card with a Field filter parameter"
    (mt/with-temp [:model/Card card {:dataset_query (qp.card-test/field-filter-query)}]
      (is (= [{:id "_DATE_"
               :type :date/all-options
               :target [:dimension [:template-tag "date"]]
               :name "Check-In Date"
               :slug "date"
               :default nil
               :required false}]
             (card/template-tag-parameters card))))))

(deftest ^:parallel template-tag-parameters-test-2
  (testing "Card with a non-Field-filter parameter"
    (mt/with-temp [:model/Card card {:dataset_query (qp.card-test/non-field-filter-query)}]
      (is (= [{:id "_ID_"
               :type :number/=
               :target [:variable [:template-tag "id"]]
               :name "Order ID"
               :slug "id"
               :default "1"
               :required true}]
             (card/template-tag-parameters card))))))

(deftest ^:parallel template-tag-parameters-test-3
  (testing "Should ignore native query snippets and source card IDs"
    (mt/with-temp [:model/Card card {:dataset_query (qp.card-test/non-parameter-template-tag-query)}]
      (is (= [{:id "_ID_"
               :type :number/=
               :target [:variable [:template-tag "id"]]
               :name "Order ID"
               :slug "id"
               :default "1"
               :required true}]
             (card/template-tag-parameters card))))))

(deftest validate-template-tag-field-ids-test
  (testing "Disallow saving a Card with native query Field filter template tags referencing a different Database (#14145)"
    (let [test-data-db-id   (mt/id)
          bird-counts-db-id (mt/dataset daily-bird-counts (mt/id))
          card-data         (fn [database-id]
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
          good-card-data  (card-data test-data-db-id)
          bad-card-data   (card-data bird-counts-db-id)]
      (testing "Should not be able to create new Card with a filter with the wrong Database ID"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid Field Filter: Field \d+ \"VENUES\"\.\"NAME\" belongs to Database \d+ \"test-data \(h2\)\", but the query is against Database \d+ \"daily-bird-counts \(h2\)\""
             (t2.with-temp/with-temp [:model/Card _ bad-card-data]))))
      (testing "Should not be able to update a Card to have a filter with the wrong Database ID"
        (t2.with-temp/with-temp [:model/Card {card-id :id} good-card-data]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid Field Filter: Field \d+ \"VENUES\"\.\"NAME\" belongs to Database \d+ \"test-data \(h2\)\", but the query is against Database \d+ \"daily-bird-counts \(h2\)\""
               (t2/update! :model/Card card-id bad-card-data))))))))

;;; ------------------------------------------ Parameters tests ------------------------------------------

(deftest ^:parallel validate-parameters-test
  (testing "Should validate Card :parameters when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameters must be a sequence of maps with :id and :type keys"
           (t2.with-temp/with-temp [:model/Card _ {:parameters {:a :b}}])))
      (t2.with-temp/with-temp [:model/Card card {:parameters [{:id   "valid-id"
                                                               :type "id"}]}]
        (is (some? card))))))

(deftest validate-parameters-test-2
  (testing "Should validate Card :parameters when"
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
        (is (some? card))))))

(deftest validate-parameter-mappings-test-2
  (testing "Should validate Card :parameter_mappings when"
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
      (is (= [{:parameter_id "22486e00"
               :card_id      1
               :target       [:dimension [:field 1 nil]]}]
             (t2/select-one-fn :parameter_mappings :model/Card :id card-id))))))

(deftest identity-hash-test
  (testing "Card hashes are composed of the name and the collection's hash"
    (let [now #t "2022-09-01T12:34:56"]
      (mt/with-temp [:model/Collection  coll {:name "field-db" :location "/" :created_at now}
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
                (t2/select :model/ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id)))

        (testing "update values_source_config.card_id will update ParameterCard"
          (t2/update! :model/Card card-id {:parameters [(merge default-params
                                                               {:values_source_type    "card"
                                                                :values_source_config {:card_id source-card-id-2}})]})
          (is (=? [{:card_id                   source-card-id-2
                    :parameterized_object_type :card
                    :parameterized_object_id   card-id
                    :parameter_id              "_CATEGORY_NAME_"}]
                  (t2/select :model/ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id))))

        (testing "delete the card will delete ParameterCard"
          (t2/delete! :model/Card :id card-id)
          (is (= []
                 (t2/select :model/ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id))))))))

(deftest parameter-card-test-2
  (let [default-params {:name       "Category Name"
                        :slug       "category_name"
                        :id         "_CATEGORY_NAME_"
                        :type       "category"}]
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
                (t2/select :model/ParameterCard :card_id source-card-id {:order-by [[:parameterized_object_id :asc]]})))
        (t2/delete! :model/Card :id source-card-id)
        (is (= []
               (t2/select :model/ParameterCard :card_id source-card-id)))))))

(deftest do-not-update-parameter-card-if-it-doesn't-change-test
  (testing "Do not update ParameterCard if updating a Dashboard doesn't change the parameters"
    (mt/with-temp [:model/Card  {source-card-id :id} {}
                   :model/Card  {card-id-1 :id}      {:parameters [{:name       "Category Name"
                                                                    :slug       "category_name"
                                                                    :id         "_CATEGORY_NAME_"
                                                                    :type       "category"
                                                                    :values_source_type    "card"
                                                                    :values_source_config {:card_id source-card-id}}]}]
      (mt/with-dynamic-redefs [parameter-card/upsert-or-delete-from-parameters! (fn [& _] (throw (ex-info "Should not be called" {})))]
        (t2/update! :model/Card card-id-1 {:name "new name"})))))

(deftest cleanup-parameter-on-card-changes-test
  (mt/dataset test-data
    (mt/with-temp
      [:model/Card        {source-card-id :id} (merge (mt/card-with-source-metadata-for-query
                                                       (mt/mbql-query products {:fields [(mt/$ids $products.title)
                                                                                         (mt/$ids $products.category)]
                                                                                :limit 5}))
                                                      {:database_id (mt/id)
                                                       :table_id    (mt/id :products)})
       :model/Card        card                 {:parameters [{:name                  "Param 1"
                                                              :id                    "param_1"
                                                              :type                  "category"
                                                              :values_source_type    "card"
                                                              :values_source_config {:card_id source-card-id
                                                                                     :value_field (mt/$ids $products.title)}}]}
       :model/Dashboard   dashboard            {:parameters [{:name       "Param 2"
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
              (t2/select :model/ParameterCard :card_id source-card-id {:order-by [[:parameter_id :asc]]})))
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
                  (t2/select :model/ParameterCard :card_id source-card-id))))

        (testing "update the dashboard parameter and remove values_config of dashboard"
          (is (=? [{:id   "param_2"
                    :name "Param 2"
                    :type :category}]
                  (t2/select-one-fn :parameters :model/Dashboard :id (:id dashboard))))

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
          (is (=? [] (t2/select :model/ParameterCard :card_id source-card-id))))

        (testing "update the dashboard parameter and remove values_config of card"
          (is (=? [{:id   "param_1"
                    :name "Param 1"
                    :type :category}]
                  (t2/select-one-fn :parameters :model/Card :id (:id card)))))))))

(deftest ^:parallel descendants-test
  (testing "regular cards don't depend on anything"
    (mt/with-temp [:model/Card card {:name "some card"}]
      (is (empty? (serdes/descendants "Card" (:id card)))))))

(deftest ^:parallel descendants-test-2
  (testing "cards which have another card as the source depend on that card"
    (mt/with-temp [:model/Card card1 {:name "base card"}
                   :model/Card card2 {:name "derived card"
                                      :dataset_query {:query {:source-table (str "card__" (:id card1))}}}]
      (is (empty? (serdes/descendants "Card" (:id card1))))
      (is (= #{["Card" (:id card1)]}
             (serdes/descendants "Card" (:id card2)))))))

(deftest ^:parallel descendants-test-3
  (testing "cards that has a native template tag"
    (mt/with-temp [:model/NativeQuerySnippet snippet {:name "category" :content "category = 'Gizmo'"}
                   :model/Card               card
                   {:name          "Business Card"
                    :dataset_query {:native
                                    {:template-tags {:snippet {:name         "snippet"
                                                               :type         :snippet
                                                               :snippet-name "snippet"
                                                               :snippet-id   (:id snippet)}}
                                     :query "select * from products where {{snippet}}"}}}]
      (is (= #{["NativeQuerySnippet" (:id snippet)]}
             (serdes/descendants "Card" (:id card)))))))

(deftest ^:parallel descendants-test-4
  (testing "cards which have parameter's source is another card"
    (mt/with-temp [:model/Card card1 {:name "base card"}
                   :model/Card card2 {:name       "derived card"
                                      :parameters [{:id                   "valid-id"
                                                    :type                 "id"
                                                    :values_source_type   "card"
                                                    :values_source_config {:card_id (:id card1)}}]}]
      (is (= #{["Card" (:id card1)]}
             (serdes/descendants "Card" (:id card2)))))))

(deftest ^:parallel extract-test
  (let [metadata (qp.preprocess/query->expected-cols (mt/mbql-query venues))
        query    (mt/mbql-query venues)]
    (testing "every card retains result_metadata"
      (t2.with-temp/with-temp [:model/Card {card1-id :id} {:dataset_query   query
                                                           :result_metadata metadata}
                               :model/Card {card2-id :id} {:type            :model
                                                           :dataset_query   query
                                                           :result_metadata metadata}]
        (doseq [card-id [card1-id card2-id]]
          (let [extracted (serdes/extract-one "Card" nil (t2/select-one :model/Card :id card-id))]
            ;; card2 is model, but card1 is not
            (is (= (= card-id card2-id)
                   (= :model (:type extracted))))
            (is (string? (:display_name (first (:result_metadata extracted)))))
            ;; this is a quick comparison, since the actual stored metadata is quite complex
            (is (= (map :display_name metadata)
                   (map :display_name (:result_metadata extracted))))))))))

;;; ------------------------------------------ Viz Settings Tests  ------------------------------------------

(deftest ^:parallel upgrade-to-v2-db-test
  (testing ":visualization_settings v. 1 should be upgraded to v. 2 on select"
    (t2.with-temp/with-temp [:model/Card {card-id :id} {:visualization_settings {:pie.show_legend true}}]
      (is (= {:version 2
              :pie.show_legend true
              :pie.percent_visibility "inside"}
             (t2/select-one-fn :visualization_settings :model/Card :id card-id))))))

(deftest upgrade-to-v2-db-test-2
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

(deftest ^:parallel diff-cards-str-update-collection--test
  (t2.with-temp/with-temp
    [:model/Collection {coll-id-1 :id} {:name "Old collection"}
     :model/Collection {coll-id-2 :id} {:name "New collection"}]
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
    [:model/Database   db   {:name "random db"}
     :model/Card       base-card {}
     :model/Card       card {:name                "A Card"
                             :description         "An important card"
                             :collection_position 0
                             :cache_ttl           1000
                             :archived            false
                             :parameters          [{:name       "Category Name"
                                                    :slug       "category_name"
                                                    :id         "_CATEGORY_NAME_"
                                                    :type       "category"}]}
     :model/Collection coll {:name "A collection"}]
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
                            (= col :source_card_id)    (:id base-card)
                            (= col :database_id)       (:id db)
                            (= col :query_type)        :native
                            (= col :type)              "model"
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
            (t2/delete! :model/Revision :model "Card" :model_id (:id card))
            (t2/update! :model/Card (:id card) changes)
            (create-card-revision! (:id card) false)
            (testing (format "we should track when %s changes" col)
              (is (= 1 (t2/count :model/Revision :model "Card" :model_id (:id card)))))
            (when-not (#{;; these columns are expected to not have a description because it's always
                         ;; comes with a dataset_query changes
                         :table_id :database_id :query_type :source_card_id
                         ;; we don't need a description for made_public_by_id because whenever this field changes
                         ;; public_uuid will change and we have a description for it.
                         :made_public_by_id
                         ;; similarly, we don't need a description for `archived_directly` because whenever
                         ;; this field changes `archived` will also change and we have a description for that.
                         :archived_directly
                         ;; we don't expect a description for this column because it should never change
                         ;; once created by the migration
                         :dataset_query_metrics_v2_migration_backup} col)
              (testing (format "we should have a revision description for %s" col)
                (is (some? (u/build-sentence
                            (revision/diff-strings
                             :model/Dashboard
                             before
                             changes))))))))))))

(deftest record-revision-and-description-completeness-test-2
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
          (is (= 1 (t2/count :model/Revision :model "Card" :model_id (:id card)))))

        (testing "we should have a revision description for :result_metadata on model"
          (is (some? (u/build-sentence
                      (revision/diff-strings
                       :model/Dashboard
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

(deftest ^:parallel changed?-test
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

(deftest hydrate-dashboard-count-test
  (mt/with-temp
    [:model/Card          card1 {}
     :model/Card          card2 {}
     :model/Card          card3 {}
     :model/Dashboard     dash  {}
     :model/DashboardCard _dc1  {:card_id (:id card1) :dashboard_id (:id dash)}
     :model/DashboardCard _dc2  {:card_id (:id card1) :dashboard_id (:id dash)}
     :model/DashboardCard _dc3  {:card_id (:id card2) :dashboard_id (:id dash)}]
    (is (= [2 1 0]
           (map :dashboard_count (t2/hydrate [card1 card2 card3] :dashboard_count))))))

(deftest hydrate-parameter-usage-count-test
  (mt/with-temp
    [:model/Card          card1 {}
     :model/Card          card2 {}
     :model/Card          card3 {}
     :model/ParameterCard _pc1  {:card_id (:id card1)
                                 :parameter_id              "param_1"
                                 :parameterized_object_type "card"
                                 :parameterized_object_id (:id card1)}
     :model/ParameterCard _pc2  {:card_id (:id card1)
                                 :parameter_id              "param_2"
                                 :parameterized_object_type "card"
                                 :parameterized_object_id (:id card2)}
     :model/ParameterCard _pc3  {:card_id (:id card2)
                                 :parameter_id              "param_3"
                                 :parameterized_object_type "card"
                                 :parameterized_object_id (:id card3)}]
   (is (= [2 1 0]
          (map :parameter_usage_count (t2/hydrate [card1 card2 card3] :parameter_usage_count))))))

(deftest ^:parallel average-query-time-and-last-query-started-test
  (let [now       (t/offset-date-time)
        yesterday (t/minus now (t/days 1))]
    (mt/with-temp
      [:model/Card           card {}
       :model/QueryExecution _qe1 {:card_id      (:id card)
                                   :started_at   now
                                   :cache_hit    false
                                   :running_time 50}
       :model/QueryExecution _qe2 {:card_id      (:id card)
                                   :started_at   yesterday
                                   :cache_hit    false
                                   :running_time 100}]
      (is (= 75 (-> card (t2/hydrate :average_query_time) :average_query_time int)))
      ;; the DB might save last_query_start with a different level of precision than the JVM does, on my machine
      ;; `offset-date-time` returns nanosecond precision (9 decimal places) but `last_query_start` is coming back with
      ;; microsecond precision (6 decimal places). We don't care about such a small difference, just strip it off of the
      ;; times we're comparing.
      (is (= (.withNano now 0)
             (-> (-> card (t2/hydrate :last_query_start) :last_query_start)
                 t/offset-date-time
                 (.withNano 0)))))))

(deftest save-mlv2-card-test
  (testing "App DB CRUD should work for a Card with an MLv2 query (#39024)"
    (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
          venues            (lib.metadata/table metadata-provider (mt/id :venues))
          query             (lib/query metadata-provider venues)]
      (mt/with-temp [:model/Card card {:dataset_query query}]
        (testing "Save to app DB: table_id and database_id should get populated"
          (is (=? {:dataset_query {:lib/type     :mbql/query
                                   :database     (mt/id)
                                   :stages       [{:lib/type :mbql.stage/mbql, :source-table (mt/id :venues)}]
                                   :lib/metadata metadata-provider}
                   :table_id      (mt/id :venues)
                   :database_id   (mt/id)}
                  card)))
        (testing "Save to app DB: Check MLv2 query was serialized to app DB in a sane way. Metadata provider should be removed"
          (is (= {"lib/type" "mbql/query"
                  "database" (mt/id)
                  "stages"   [{"lib/type"     "mbql.stage/mbql"
                               "source-table" (mt/id :venues)}]}
                 (json/parse-string (t2/select-one-fn :dataset_query (t2/table-name :model/Card) :id (u/the-id card))))))
        (testing "fetch from app DB"
          (is (=? {:dataset_query {:lib/type     :mbql/query
                                   :database     (mt/id)
                                   :stages       [{:lib/type :mbql.stage/mbql, :source-table (mt/id :venues)}]
                                   :lib/metadata (lib.metadata.jvm/application-database-metadata-provider (mt/id))}
                   :query_type    :query
                   :table_id      (mt/id :venues)
                   :database_id   (mt/id)}
                  (t2/select-one :model/Card :id (u/the-id card)))))
        (testing "Update query: change table to ORDERS; query and table_id should reflect that"
          (let [orders (lib.metadata/table metadata-provider (mt/id :orders))]
            (is (= 1
                   (t2/update! :model/Card :id (u/the-id card)
                               {:dataset_query (lib/query metadata-provider orders)})))
            (is (=? {:dataset_query {:lib/type     :mbql/query
                                     :database     (mt/id)
                                     :stages       [{:lib/type :mbql.stage/mbql, :source-table (mt/id :orders)}]
                                     :lib/metadata (lib.metadata.jvm/application-database-metadata-provider (mt/id))}
                     :query_type    :query
                     :table_id      (mt/id :orders)
                     :database_id   (mt/id)}
                    (t2/select-one :model/Card :id (u/the-id card))))))))))

(deftest can-run-adhoc-query-test
  (let [metadata-provider (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        venues            (lib.metadata/table metadata-provider (mt/id :venues))
        query             (lib/query metadata-provider venues)]
    (binding [api/*current-user-id* (mt/user->id :crowberto)]
      (mt/with-temp [:model/Card card {:dataset_query query}
                     :model/Card no-query {}]
        (is (=? {:can_run_adhoc_query true}
                (t2/hydrate card :can_run_adhoc_query)))
        (is (=? {:can_run_adhoc_query false}
                (t2/hydrate no-query :can_run_adhoc_query)))))))

(deftest audit-card-permisisons-test
  (testing "Cards in audit collections are not readable or writable on OSS, even if they exist (#42645)"
    ;; Here we're testing the specific scenario where an EE instance is downgraded to OSS, but still has the audit
    ;; collections and cards installed. Since we can't load audit content on OSS, let's just redef the audit collection
    ;; to a temp collection and ensure permission checks work properly.
    (mt/with-premium-features #{}
      (mt/with-temp [:model/Collection collection {}
                     :model/Card       card       {:collection_id (:id collection)}]
        (with-redefs [audit/default-audit-collection (constantly collection)]
          (mt/with-test-user :rasta
            (is (false? (mi/can-read? card)))
            (is (false? (mi/can-write? card))))

          (mt/with-test-user :crowberto
            (is (false? (mi/can-read? card)))
            (is (false? (mi/can-write? card)))))))))
