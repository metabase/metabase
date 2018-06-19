(ns metabase.models.card-test
  (:require [cheshire.core :as json]
            [expectations :refer :all]
            [metabase.models
             [card :as card :refer :all]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; Check that the :dashboard_count delay returns the correct count of Dashboards a Card is in
(expect
  [0 1 2]
  (tt/with-temp* [Card      [{card-id :id}]
                  Dashboard [dash-1]
                  Dashboard [dash-2]]
    (let [add-card-to-dash!   (fn [dash] (db/insert! DashboardCard :card_id card-id, :dashboard_id (u/get-id dash)))
          get-dashboard-count (fn [] (dashboard-count (Card card-id)))]

      [(get-dashboard-count)
       (do (add-card-to-dash! dash-1) (get-dashboard-count))
       (do (add-card-to-dash! dash-2) (get-dashboard-count))])))


;; card-dependencies

(expect
  {:Segment #{2 3}
   :Metric  nil}
  (card-dependencies
   {:dataset_query {:type :query
                    :query {:aggregation ["rows"]
                            :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["SEGMENT" 2] ["SEGMENT" 3]]}}}))

(expect
  {:Segment #{1}
   :Metric #{7}}
  (card-dependencies
   {:dataset_query {:type :query
                    :query {:aggregation ["METRIC" 7]
                            :filter      ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["OR" ["SEGMENT" 1] ["!=" 5 "5"]]]}}}))

(expect
  {:Segment nil
   :Metric  nil}
  (card-dependencies
   {:dataset_query {:type :query
                    :query {:aggregation nil
                            :filter      nil}}}))


;; Test that when somebody archives a Card, it is removed from any Dashboards it belongs to
(expect
  0
  (tt/with-temp* [Dashboard     [dashboard]
                  Card          [card]
                  DashboardCard [dashcard  {:dashboard_id (u/get-id dashboard), :card_id (u/get-id card)}]]
    (db/update! Card (u/get-id card) :archived true)
    (db/count DashboardCard :dashboard_id (u/get-id dashboard))))


;; test that a Card's :public_uuid comes back if public sharing is enabled...
(expect
  (tu/with-temporary-setting-values [enable-public-sharing true]
    (tt/with-temp Card [card {:public_uuid (str (java.util.UUID/randomUUID))}]
      (boolean (:public_uuid card)))))

;; ...but if public sharing is *disabled* it should come back as `nil`
(expect
  nil
  (tu/with-temporary-setting-values [enable-public-sharing false]
    (tt/with-temp Card [card {:public_uuid (str (java.util.UUID/randomUUID))}]
      (:public_uuid card))))

(defn- dummy-dataset-query [database-id]
  {:database (data/id)
   :type     :native
   :native   {:query "SELECT count(*) FROM toucan_sightings;"}})

(expect
  [{:name "some name"    :database_id (data/id)}
   {:name "another name" :database_id (data/id)}]
  (tt/with-temp Card [{:keys [id] :as card} {:name          "some name"
                                             :dataset_query (dummy-dataset-query (data/id))
                                             :database_id   (data/id)}]
    [(into {} (db/select-one [Card :name :database_id] :id id))
     (do
       (db/update! Card id {:name          "another name"
                            :dataset_query (dummy-dataset-query (data/id))})
       (into {} (db/select-one [Card :name :database_id] :id id)))]))



;;; ------------------------------------------ Circular Reference Detection ------------------------------------------

(defn- card-with-source-table
  "Generate values for a Card with `source-table` for use with `with-temp`."
  {:style/indent 1}
  [source-table & {:as kvs}]
  (merge {:dataset_query {:database (data/id)
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

;; If a Card uses itself as a source, perms calculations should fallback to the 'only admins can see it' perms of
;; #{"/db/0"} (DB 0 will never exist, so regular users will never get to see it, but because admins have root perms,
;; they will still get to see it and perhaps fix it.)
(expect
  Exception
  (tt/with-temp Card [card (card-with-source-table (data/id :venues))]
    ;; now try to make the Card reference itself. Should throw Exception
    (db/update! Card (u/get-id card)
      (card-with-source-table (str "card__" (u/get-id card))))))

;; Do the same stuff with circular reference between two Cards... (A -> B -> A)
(expect
  Exception
  (tt/with-temp* [Card [card-a (card-with-source-table (data/id :venues))]
                  Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]]
    (db/update! Card (u/get-id card-a)
      (card-with-source-table (str "card__" (u/get-id card-b))))))

;; ok now try it with A -> C -> B -> A
(expect
  Exception
  (tt/with-temp* [Card [card-a (card-with-source-table (data/id :venues))]
                  Card [card-b (card-with-source-table (str "card__" (u/get-id card-a)))]
                  Card [card-c (card-with-source-table (str "card__" (u/get-id card-b)))]]
    (db/update! Card (u/get-id card-a)
      (card-with-source-table (str "card__" (u/get-id card-c))))))
