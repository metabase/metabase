(ns metabase.models.card-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase.models :refer [Card Collection Dashboard DashboardCard]]
            [metabase.models.card :as card]
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
                (card/dashboard-count (Card card-id)))]
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

(deftest card-dependencies-test
  (testing "Segment dependencies"
    (is (= {:Segment #{2 3}
            :Metric  #{}}
           (card/card-dependencies
            {:dataset_query {:type  :query
                             :query {:filter [:and
                                              [:> [:field-id 4] "2014-10-19"]
                                              [:= [:field-id 5] "yes"]
                                              [:segment 2]
                                              [:segment 3]]}}}))))

  (testing "Segment and Metric dependencies"
    (is (= {:Segment #{1}
            :Metric  #{7}}
           (card/card-dependencies
            {:dataset_query {:type  :query
                             :query {:aggregation [:metric 7]
                                     :filter      [:and
                                                   [:> [:field-id 4] "2014-10-19"]
                                                   [:= [:field-id 5] "yes"]
                                                   [:or [:segment 1] [:!= [:field-id 5] "5"]]]}}}))))

  (testing "no dependencies"
    (is (= {:Segment #{}
            :Metric  #{}}
           (card/card-dependencies
            {:dataset_query {:type  :query
                             :query {:aggregation nil
                                     :filter      nil}}})))))

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
  {:database (mt/id)
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

(defn- force-update-card-to-reference-source-table!
  "Skip normal pre-update stuff so we can force a Card to get into an invalid state."
  [card source-table]
  (db/update! Card {:where [:= :id (u/the-id card)]
                    :set   (-> (card-with-source-table source-table)
                               ;; we have to manually JSON-encode since we're skipping normal pre-update stuff
                               (update :dataset_query json/generate-string))}))

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

(deftest extract-ids-test
  (doseq [[ids-type expected] {:segment #{1}
                               :metric  #{2}}]
    (testing (pr-str (list 'extract-ids ids-type 'card))
      (is (= expected
             (#'card/extract-ids ids-type {:query {:fields [[:segment 1]
                                                            [:metric 2]]}}))))))

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
    (let [metadata (qp/query->expected-cols (mt/mbql-query :venues))]
      (mt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query :venues)
                                         :result_metadata metadata}]
        (is (= (mt/derecordize metadata)
               (mt/derecordize (db/select-one-field :result_metadata Card :id card-id))))))))

(deftest populate-result-metadata-if-needed-test
  (doseq [[creating-or-updating f]
          {"creating" (fn [properties f]
                        (mt/with-temp Card [{card-id :id} properties]
                          (f (db/select-one-field :result_metadata Card :id card-id))))
           "updating" (fn [changes f]
                        (mt/with-temp Card [{card-id :id} {:dataset_query   (mt/mbql-query :checkins)
                                                           :result_metadata (qp/query->expected-cols (mt/mbql-query :checkins))}]
                          (db/update! Card card-id changes)
                          (f (db/select-one-field :result_metadata Card :id card-id))))}]
    (testing (format "When %s a Card\n" creating-or-updating)
      (testing "If result_metadata is empty, we should attempt to populate it"
        (f {:dataset_query (mt/mbql-query :venues)}
           (fn [metadata]
             (is (= (map :name (qp/query->expected-cols (mt/mbql-query :venues)))
                    (map :name metadata))))))
      (testing "Don't overwrite result_metadata that was passed in"
        (let [metadata (take 1 (qp/query->expected-cols (mt/mbql-query :venues)))]
          (f {:dataset_query   (mt/mbql-query :venues)
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
                      :pivot_table.column_split {:rows    [["datetime-field" ["field-id" 807] "year"]],
                                                 :columns [["fk->" ["field-id" 805] ["field-id" 808]]],
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
        (f original original)))))

(deftest normalize-visualization-settings-test
  (test-visualization-settings-normalization
   (fn [original expected]
     (mt/with-temp Card [card {:visualization_settings original}]
       (is (= expected
              (db/select-one-field :visualization_settings Card :id (u/the-id card))))))))
