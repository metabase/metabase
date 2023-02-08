(ns metabase.models.card-test
  (:require
   [cheshire.core :as json]
   [clojure.test :refer :all]
   [metabase.models
    :refer [Card Collection Dashboard DashboardCard ParameterCard NativeQuerySnippet]]
   [metabase.models.card :as card]
   [metabase.models.serialization.base :as serdes.base]
   [metabase.models.serialization.hash :as serdes.hash]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.test.util :as tu]
   [metabase.util :as u]
   [toucan.db :as db]
   [toucan.hydrate :as hydrate]
   [toucan.util.test :as tt]))

(deftest dashboard-count-test
  (testing "Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in"
    (tt/with-temp* [Card      [{card-id :id}]
                    Dashboard [dash-1]
                    Dashboard [dash-2]]
      (letfn [(add-card-to-dash! [dash]
                (db/insert! DashboardCard
                            {:card_id      card-id
                             :dashboard_id (u/the-id dash)
                             :row          0
                             :col          0
                             :size_x       4
                             :size_y       4}))
              (get-dashboard-count []
                (card/dashboard-count (db/select-one Card :id card-id)))]
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
                                      (hydrate/hydrate :parameter_usage_count)
                                      :parameter_usage_count))
        default-params {:name       "Category Name"
                        :slug       "category_name"
                        :id         "_CATEGORY_NAME_"
                        :type       "category"}
        card-params    (fn [card-id] (merge default-params {:values_source_type "card"
                                                            :values_source_config {:card_id card-id}}))]
    (testing "With no associated cards"
      (tt/with-temp Card [card]
        (is (zero? (hydrated-count card)))))
    (testing "With one"
      (tt/with-temp* [Card      [{card-id :id :as card}]
                      Dashboard [_ {:parameters [(card-params card-id)]}]]
        (is (= 1 (hydrated-count card)))))
    (testing "With several"
      (tt/with-temp* [Card      [{card-id :id :as card}]
                      Dashboard [_ {:parameters [(card-params card-id)]}]
                      Dashboard [_ {:parameters [(card-params card-id)]}]
                      Dashboard [_ {:parameters [(card-params card-id)]}]]
        (is (= 3 (hydrated-count card)))))))

(deftest remove-from-dashboards-when-archiving-test
  (testing "Test that when somebody archives a Card, it is removed from any Dashboards it belongs to"
    (tt/with-temp* [Dashboard     [dashboard]
                    Card          [card]
                    DashboardCard [_dashcard {:dashboard_id (u/the-id dashboard), :card_id (u/the-id card)}]]
      (db/update! Card (u/the-id card) :archived true)
      (is (= 0
             (db/count DashboardCard :dashboard_id (u/the-id dashboard)))))))

(deftest public-sharing-test
  (testing "test that a Card's :public_uuid comes back if public sharing is enabled..."
    (tu/with-temporary-setting-values [enable-public-sharing true]
      (tt/with-temp Card [card {:public_uuid (str (java.util.UUID/randomUUID))}]
        (is (schema= u/uuid-regex
                     (:public_uuid card)))))

    (testing "...but if public sharing is *disabled* it should come back as `nil`"
      (tu/with-temporary-setting-values [enable-public-sharing false]
        (tt/with-temp Card [card {:public_uuid (str (java.util.UUID/randomUUID))}]
          (is (= nil
                 (:public_uuid card))))))))

(defn- dummy-dataset-query [database-id]
  {:database database-id
   :type     :native
   :native   {:query "SELECT count(*) FROM toucan_sightings;"}})

(deftest database-id-test
  (tt/with-temp Card [{:keys [id]} {:name          "some name"
                                    :dataset_query (dummy-dataset-query (mt/id))
                                    :database_id   (mt/id)}]
    (testing "before update"
      (is (= {:name "some name", :database_id (mt/id)}
             (into {} (db/select-one [Card :name :database_id] :id id)))))
    (db/update! Card id {:name          "another name"
                         :dataset_query (dummy-dataset-query (mt/id))})
    (testing "after update"
      (is (= {:name "another name" :database_id (mt/id)}
             (into {} (db/select-one [Card :name :database_id] :id id)))))))


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
    (tt/with-temp Card [card (card-with-source-table (mt/id :venues))]
      ;; now try to make the Card reference itself. Should throw Exception
      (is (thrown?
           Exception
           (db/update! Card (u/the-id card)
             (card-with-source-table (str "card__" (u/the-id card))))))))

  (testing "Do the same stuff with circular reference between two Cards... (A -> B -> A)"
    (tt/with-temp* [Card [card-a (card-with-source-table (mt/id :venues))]
                    Card [card-b (card-with-source-table (str "card__" (u/the-id card-a)))]]
      (is (thrown?
           Exception
           (db/update! Card (u/the-id card-a)
             (card-with-source-table (str "card__" (u/the-id card-b))))))))

  (testing "ok now try it with A -> C -> B -> A"
    (tt/with-temp* [Card [card-a (card-with-source-table (mt/id :venues))]
                    Card [card-b (card-with-source-table (str "card__" (u/the-id card-a)))]
                    Card [card-c (card-with-source-table (str "card__" (u/the-id card-b)))]]
      (is (thrown?
           Exception
           (db/update! Card (u/the-id card-a)
             (card-with-source-table (str "card__" (u/the-id card-c)))))))))

(deftest validate-collection-namespace-test
  (mt/with-temp Collection [{collection-id :id} {:namespace "currency"}]
    (testing "Shouldn't be able to create a Card in a non-normal Collection"
      (let [card-name (mt/random-name)]
        (try
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"A Card can only go in Collections in the \"default\" namespace"
               (db/insert! Card (assoc (tt/with-temp-defaults Card) :collection_id collection-id, :name card-name))))
          (finally
            (db/delete! Card :name card-name)))))

    (testing "Shouldn't be able to move a Card to a non-normal Collection"
      (mt/with-temp Card [{card-id :id}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"A Card can only go in Collections in the \"default\" namespace"
             (db/update! Card card-id {:collection_id collection-id})))))))

(deftest normalize-result-metadata-test
  (testing "Should normalize result metadata keys when fetching a Card from the DB"
    (let [metadata (qp/query->expected-cols (mt/mbql-query venues))]
      (mt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query venues)
                                         :result_metadata metadata}]
        (is (= (mt/derecordize metadata)
               (mt/derecordize (db/select-one-field :result_metadata Card :id card-id))))))))

(deftest populate-result-metadata-if-needed-test
  (doseq [[creating-or-updating f]
          {"creating" (fn [properties f]
                        (mt/with-temp Card [{card-id :id} properties]
                          (f (db/select-one-field :result_metadata Card :id card-id))))
           "updating" (fn [changes f]
                        (mt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query checkins)
                                                           :result_metadata (qp/query->expected-cols (mt/mbql-query checkins))}]
                          (db/update! Card card-id changes)
                          (f (db/select-one-field :result_metadata Card :id card-id))))}]
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
     (mt/with-temp Card [card {:visualization_settings original}]
       (is (= expected
              (db/select-one-field :visualization_settings Card :id (u/the-id card))))))))

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
             (mt/with-temp Card [_ bad-card-data]))))
      (testing "Should not be able to update a Card to have a filter with the wrong Database ID"
        (mt/with-temp Card [{card-id :id} good-card-data]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid Field Filter: Field \d+ \"VENUES\"\.\"NAME\" belongs to Database \d+ \"test-data\", but the query is against Database \d+ \"sample-dataset\""
               (db/update! Card card-id bad-card-data))))))))

;;; ------------------------------------------ Parameters tests ------------------------------------------

(deftest validate-parameters-test
  (testing "Should validate Card :parameters when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameters must be a sequence of maps with :id and :type keys"
           (mt/with-temp Card [_ {:parameters {:a :b}}])))

     (mt/with-temp Card [card {:parameters [{:id   "valid-id"
                                             :type "id"}]}]
       (is (some? card))))

    (testing "updating"
      (mt/with-temp Card [{:keys [id]} {:parameters []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameters must be a sequence of maps with :id and :type keys"
             (db/update! Card id :parameters [{:id 100}])))
        (is (some? (db/update! Card id :parameters [{:id   "new-valid-id"
                                                     :type "id"}])))))))

(deftest normalize-parameters-test
  (testing ":parameters should get normalized when coming out of the DB"
    (doseq [[target expected] {[:dimension [:field-id 1000]] [:dimension [:field 1000 nil]]
                               [:field-id 1000]              [:field 1000 nil]}]
      (testing (format "target = %s" (pr-str target))
        (mt/with-temp Card [{card-id :id} {:parameter_mappings [{:parameter_id     "_CATEGORY_NAME_"
                                                                 :target target}]}]

          (is (= [{:parameter_id     "_CATEGORY_NAME_"
                   :target expected}]
                 (db/select-one-field :parameter_mappings Card :id card-id))))))))

(deftest validate-parameter-mappings-test
  (testing "Should validate Card :parameter_mappings when"
    (testing "creating"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #":parameter_mappings must be a sequence of maps with :parameter_id and :type keys"
           (mt/with-temp Card [_ {:parameter_mappings {:a :b}}])))

     (mt/with-temp Card [card {:parameter_mappings [{:parameter_id "valid-id"
                                                     :target       [:field 1000 nil]}]}]
       (is (some? card))))

    (testing "updating"
      (mt/with-temp Card [{:keys [id]} {:parameter_mappings []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameter_mappings must be a sequence of maps with :parameter_id and :type keys"
             (db/update! Card id :parameter_mappings [{:parameter_id 100}])))

        (is (some? (db/update! Card id :parameter_mappings [{:parameter_id "new-valid-id"
                                                             :target       [:field 1000 nil]}])))))))

(deftest normalize-parameter-mappings-test
  (testing ":parameter_mappings should get normalized when coming out of the DB"
    (mt/with-temp Card [{card-id :id} {:parameter_mappings [{:parameter_id "22486e00"
                                                             :card_id      1
                                                             :target       [:dimension [:field-id 1]]}]}]
      (is (= [{:parameter_id "22486e00",
               :card_id      1,
               :target       [:dimension [:field 1 nil]]}]
             (db/select-one-field :parameter_mappings Card :id card-id))))))

(deftest identity-hash-test
  (testing "Card hashes are composed of the name and the collection's hash"
    (let [now #t "2022-09-01T12:34:56"]
      (mt/with-temp* [Collection [coll  {:name "field-db" :location "/" :created_at now}]
                      Card       [card  {:name "the card" :collection_id (:id coll) :created_at now}]]
        (is (= "5199edf0"
               (serdes.hash/raw-hash ["the card" (serdes.hash/identity-hash coll) now])
               (serdes.hash/identity-hash card)))))))

(deftest parameter-card-test
  (let [default-params {:name       "Category Name"
                        :slug       "category_name"
                        :id         "_CATEGORY_NAME_"
                        :type       "category"}]
    (testing "parameter with source is card create ParameterCard"
      (tt/with-temp* [Card  [{source-card-id-1 :id}]
                      Card  [{source-card-id-2 :id}]
                      Card  [{card-id :id}
                             {:parameters [(merge default-params
                                                  {:values_source_type    "card"
                                                   :values_source_config {:card_id source-card-id-1}})]}]]
        (is (=? [{:card_id                   source-card-id-1
                  :parameterized_object_type :card
                  :parameterized_object_id   card-id
                  :parameter_id              "_CATEGORY_NAME_"}]
                (db/select 'ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id)))

        (testing "update values_source_config.card_id will update ParameterCard"
          (db/update! Card card-id {:parameters [(merge default-params
                                                        {:values_source_type    "card"
                                                         :values_source_config {:card_id source-card-id-2}})]})
          (is (=? [{:card_id                   source-card-id-2
                    :parameterized_object_type :card
                    :parameterized_object_id   card-id
                    :parameter_id              "_CATEGORY_NAME_"}]
                  (db/select 'ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id))))

        (testing "delete the card will delete ParameterCard"
          (db/delete! Card :id card-id)
          (is (= []
                 (db/select 'ParameterCard :parameterized_object_type "card" :parameterized_object_id card-id))))))

    (testing "Delete a card will delete any ParameterCard that linked to it"
      (tt/with-temp* [Card  [{source-card-id :id}]
                      Card  [{card-id-1 :id}
                             {:parameters [(merge default-params
                                                  {:values_source_type    "card"
                                                   :values_source_config {:card_id source-card-id}})]}]
                      Card  [{card-id-2 :id}
                             {:parameters [(merge default-params
                                                  {:values_source_type    "card"
                                                   :values_source_config {:card_id source-card-id}})]}]]
        ;; makes sure we have ParameterCard to start with
        (is (=? [{:card_id                   source-card-id
                  :parameterized_object_type :card
                  :parameterized_object_id   card-id-1
                  :parameter_id              "_CATEGORY_NAME_"}
                 {:card_id                   source-card-id
                  :parameterized_object_type :card
                  :parameterized_object_id   card-id-2
                  :parameter_id              "_CATEGORY_NAME_"}]
                (db/select 'ParameterCard :card_id source-card-id)))
        (db/delete! Card :id source-card-id)
        (is (= []
               (db/select 'ParameterCard :card_id source-card-id)))))))

(deftest cleanup-parameter-on-card-changes-test
  (mt/dataset sample-dataset
    (mt/with-temp*
      [Card      [{source-card-id :id} (merge (mt/card-with-source-metadata-for-query
                                                (mt/mbql-query products {:fields [(mt/$ids $products.title)
                                                                                  (mt/$ids $products.category)]
                                                                         :limit 5}))
                                              {:database_id (mt/id)
                                               :table_id    (mt/id :products)})]
       Card      [card                 {:parameters [{:name                  "Param 1"
                                                      :id                    "param_1"
                                                      :type                  "category"
                                                      :values_source_type    "card"
                                                      :values_source_config {:card_id source-card-id
                                                                             :value_field (mt/$ids $products.title)}}]}]
       Dashboard [dashboard            {:parameters [{:name       "Param 2"
                                                      :id         "param_2"
                                                      :type       "category"
                                                      :values_source_type    "card"
                                                      :values_source_config {:card_id source-card-id
                                                                             :value_field (mt/$ids $products.category)}}]}]]
      ;; check if we had parametercard to starts with
      (is (=? [{:card_id                   source-card-id
                :parameter_id              "param_1"
                :parameterized_object_type :card
                :parameterized_object_id   (:id card)}
               {:card_id                   source-card-id
                :parameter_id              "param_2"
                :parameterized_object_type :dashboard
                :parameterized_object_id   (:id dashboard)}]
              (db/select ParameterCard :card_id source-card-id)))
      ;; update card with removing the products.category
      (testing "on update result_metadata"
        (db/update! Card source-card-id
                    (mt/card-with-source-metadata-for-query
                      (mt/mbql-query products {:fields [(mt/$ids $products.title)]
                                               :limit 5})))

        (testing "ParameterCard for dashboard is removed"
          (is (=? [{:card_id                   source-card-id
                    :parameter_id              "param_1"
                    :parameterized_object_type :card
                    :parameterized_object_id   (:id card)}]
                  (db/select ParameterCard :card_id source-card-id))))

        (testing "update the dashboard parameter and remove values_config of dashboard"
          (is (=? [{:id   "param_2"
                    :name "Param 2"
                    :type :category}]
                  (db/select-one-field :parameters Dashboard :id (:id dashboard))))

          (testing "but no changes with parameter on card"
            (is (=? [{:name                 "Param 1"
                      :id                   "param_1"
                      :type                 :category
                      :values_source_type   "card"
                      :values_source_config {:card_id     source-card-id
                                             :value_field (mt/$ids $products.title)}}]
                    (db/select-one-field :parameters Card :id (:id card)))))))

      (testing "on archive card"
        (db/update! Card source-card-id {:archived true})

        (testing "ParameterCard for card is removed"
          (is (=? [] (db/select ParameterCard :card_id source-card-id))))

        (testing "update the dashboard parameter and remove values_config of card"
          (is (=? [{:id   "param_1"
                    :name "Param 1"
                    :type :category}]
                  (db/select-one-field :parameters Card :id (:id card)))))))))

(deftest serdes-descendants-test
  (testing "regular cards don't depend on anything"
    (mt/with-temp* [Card [card {:name "some card"}]]
      (is (empty? (serdes.base/serdes-descendants "Card" (:id card))))))

  (testing "cards which have another card as the source depend on that card"
    (mt/with-temp* [Card [card1 {:name "base card"}]
                    Card [card2 {:name "derived card"
                                 :dataset_query {:query {:source-table (str "card__" (:id card1))}}}]]
      (is (empty? (serdes.base/serdes-descendants "Card" (:id card1))))
      (is (= #{["Card" (:id card1)]}
             (serdes.base/serdes-descendants "Card" (:id card2))))))

  (testing "cards that has a native template tag"
    (mt/with-temp* [NativeQuerySnippet [snippet {:name "category" :content "category = 'Gizmo'"}]
                    Card               [card {:name          "Business Card"
                                              :dataset_query {:native
                                                              {:template-tags {:snippet {:name         "snippet"
                                                                                         :type         :snippet
                                                                                         :snippet-name "snippet"
                                                                                         :snippet-id   (:id snippet)}}
                                                               :query "select * from products where {{snippet}}"}}}]]
      (is (= #{["NativeQuerySnippet" (:id snippet)]}
             (serdes.base/serdes-descendants "Card" (:id card))))))

  (testing "cards which have parameter's source is another card"
    (mt/with-temp* [Card [card1 {:name "base card"}]
                    Card [card2 {:name       "derived card"
                                 :parameters [{:id                   "valid-id"
                                               :type                 "id"
                                               :values_source_type   "card"
                                               :values_source_config {:card_id (:id card1)}}]}]]
      (is (= #{["Card" (:id card1)]}
             (serdes.base/serdes-descendants "Card" (:id card2)))))))


;;; ------------------------------------------ Viz Settings Tests  ------------------------------------------

(deftest upgrade-to-v2-db-test
  (testing ":visualization_settings v. 1 should be upgraded to v. 2 on select"
    (mt/with-temp Card [{card-id :id} {:visualization_settings {:pie.show_legend true}}]
        (is (= {:version 2
                :pie.show_legend true
                :pie.percent_visibility "inside"}
               (db/select-one-field :visualization_settings Card :id card-id)))))
  (testing ":visualization_settings v. 1 should be upgraded to v. 2 and persisted on update"
    (mt/with-temp Card [{card-id :id} {:visualization_settings {:pie.show_legend true}}]
      (db/update! Card card-id :name "Favorite Toucan Foods")
      (is (= {:version 2
              :pie.show_legend true
              :pie.percent_visibility "inside"}
             (:visualization_settings (db/simple-select-one Card {:where [:= :id card-id]})))))))
