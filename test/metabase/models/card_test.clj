(ns metabase.models.card-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.models :refer [Action Card Collection Dashboard DashboardCard QueryAction]]
            [metabase.models.card :as card]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest dashboard-count-test
  (testing "Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in"
    (tt/with-temp* [Card      [{card-id :id}]
                    Dashboard [dash-1]
                    Dashboard [dash-2]]
      (letfn [(add-card-to-dash! [dash]
                (db/insert! DashboardCard :card_id card-id, :dashboard_id (u/the-id dash)))
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

(deftest remove-from-dashboards-when-archiving-test
  (testing "Test that when somebody archives a Card, it is removed from any Dashboards it belongs to"
    (tt/with-temp* [Dashboard     [dashboard]
                    Card          [card]
                    DashboardCard [dashcard  {:dashboard_id (u/the-id dashboard), :card_id (u/the-id card)}]]
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
  (tt/with-temp Card [{:keys [id] :as card} {:name          "some name"
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

(deftest action-creation-test
  (testing "actions are created when is_write is set"
    (testing "during create"
      (mt/with-temp Card [{card-id :id} (assoc (tt/with-temp-defaults Card) :is_write true)]
        (let [{:keys [action_id] :as qa-rows} (db/select-one QueryAction :card_id card-id)]
          (is (seq qa-rows)
              "Inserting a card with :is_write true should create QueryAction")
          (is (seq (db/select Action :id action_id))))))
    (testing "during update"
      (mt/with-temp Card [{card-id :id} (tt/with-temp-defaults Card)]
        (db/update! Card card-id {:is_write true})
        (let [{:keys [action_id] :as qa-rows} (db/select-one QueryAction :card_id card-id)]
          (is (seq qa-rows) "Updating a card to have :is_write true should create QueryAction")
          (is (seq (db/select Action :id action_id)))))))
  (testing "actions are not created when is_write is not set"
    (testing "during create:"
      (mt/with-temp Card [{card-id :id} (tt/with-temp-defaults Card)]
        (let [{:keys [action_id] :as qa-rows} (db/select-one QueryAction :card_id card-id)]
          (is (empty? qa-rows) "Inserting a card with :is_write false should not create QueryAction")
          (is (empty? (db/select Action :id action_id))))))
    (testing "during update"
      (mt/with-temp Card [{card-id :id} (tt/with-temp-defaults Card)]
        (db/update! Card card-id {:is_write false})
        (let [{:keys [action_id] :as qa-rows} (db/select-one QueryAction :card_id card-id)]
          (is (empty? qa-rows) "Updating a card to have :is_write false should delete QueryAction")
          (is (empty? (db/select Action :id action_id)))))))
  (testing "actions are deleted when is_write is set to false during update"
    (mt/with-temp Card [{card-id :id} (assoc (tt/with-temp-defaults Card) :is_write true)]
      (db/update! Card card-id {:is_write false})
      (let [{:keys [action_id] :as qa-rows} (db/select-one QueryAction :card_id card-id)]
        (is (empty? qa-rows) "Updating a card to have :is_write false should create a QueryAction")
        (is (empty? (db/select Action :id action_id)))))))

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
                                                     :target       [:field-id 1000]}]}]
       (is (some? card))))

    (testing "updating"
      (mt/with-temp Card [{:keys [id]} {:parameter_mappings []}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #":parameter_mappings must be a sequence of maps with :parameter_id and :type keys"
             (db/update! Card id :parameter_mappings [{:parameter_id 100}])))

        (is (some? (db/update! Card id :parameter_mappings [{:parameter_id "new-valid-id"
                                                             :target       [:field-id 1000]}])))))))

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
    (mt/with-temp* [Collection  [coll  {:name "field-db" :location "/"}]
                    Card        [card  {:name "the card" :collection_id (:id coll)}]]
      (is (= "ead6cc05"
             (serdes.hash/raw-hash ["the card" (serdes.hash/identity-hash coll)])
             (serdes.hash/identity-hash card))))))

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
             (serdes.base/serdes-descendants "Card" (:id card2)))))))
