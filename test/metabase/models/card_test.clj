(ns metabase.models.card-test
  (:require [cheshire.core :as json]
            [clojure.test :refer :all]
            [metabase
             [models :refer [Card Collection Dashboard DashboardCard]]
             [test :as mt]
             [util :as u]]
            [metabase.models.card :as card]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(deftest dashboard-count-test
  (testing "Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in"
    (tt/with-temp* [Card      [{card-id :id}]
                    Dashboard [dash-1]
                    Dashboard [dash-2]]
      (letfn [(add-card-to-dash! [dash]
                (db/insert! DashboardCard :card_id card-id, :dashboard_id (u/get-id dash)))
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
                    DashboardCard [dashcard  {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
      (db/update! Card (u/get-id card) :archived true)
      (is (= 0
             (db/count DashboardCard :dashboard_id (u/get-id dashboard)))))))

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
  (db/update! Card {:where [:= :id (u/get-id card)]
                    :set   (-> (card-with-source-table source-table)
                               ;; we have to manually JSON-encode since we're skipping normal pre-update stuff
                               (update :dataset_query json/generate-string))}))

(deftest circular-reference-test
  (testing "Should throw an Exception if saving a Card that references itself"
    (tt/with-temp Card [card (card-with-source-table (mt/id :venues))]
      ;; now try to make the Card reference itself. Should throw Exception
      (is (thrown?
           Exception
           (db/update! Card (u/get-id card)
             (card-with-source-table (str "card__" (u/get-id card))))))))

  (testing "Do the same stuff with circular reference between two Cards... (A -> B -> A)"
    (tt/with-temp* [Card [card-a (card-with-source-table (mt/id :venues))]
                    Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]]
      (is (thrown?
           Exception
           (db/update! Card (u/get-id card-a)
             (card-with-source-table (str "card__" (u/get-id card-b))))))))

  (testing "ok now try it with A -> C -> B -> A"
    (tt/with-temp* [Card [card-a (card-with-source-table (mt/id :venues))]
                    Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]
                    Card [card-c (card-with-source-table (str "card__" (u/get-id card-b)))]]
      (is (thrown?
           Exception
           (db/update! Card (u/get-id card-a)
             (card-with-source-table (str "card__" (u/get-id card-c)))))))))

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
