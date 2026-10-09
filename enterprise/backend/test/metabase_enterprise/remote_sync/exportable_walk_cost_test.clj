(ns metabase-enterprise.remote-sync.exportable-walk-cost-test
  "The dependency walk [[spec/exportable-entities]] runs before every export, export preview and merge pull. Its app-DB
  cost must not grow with the number of cards and dashboards, and it must find exactly what the entity-at-a-time walk
  over `serdes/descendants` finds.

  Not ^:parallel: measures with the JVM-wide JDBC counter ([[db-activity/count-db-activity!]])."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.app-db.activity-test-util :as db-activity]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- insert-card! [coll i dataset-query & {:as extra}]
  (t2/insert-returning-pk!
   :model/Card
   (merge {:name                   (format "Walk card %03d" i)
           :collection_id          coll
           :creator_id             (mt/user->id :rasta)
           :display                :table
           :visualization_settings {}
           :dataset_query          dataset-query}
          extra)))

(defn- insert-query-action! [action]
  (let [action-id (t2/insert-returning-pk! :model/Action (merge {:type :query} action))]
    (t2/insert! :model/QueryAction {:action_id     action-id
                                    :database_id   (mt/id)
                                    :dataset_query (mt/native-query {:query "select 1"})})
    action-id))

(defn- do-with-content!
  "A remote-synced collection with two child collections (one nested in the other), `n` cards spread over the three,
  one card built on another card, and `(quot n 5)` dashboards of three dashcards each. The first dashboard's first
  dashcard has a series card, and the first dashboard's filter takes values from a card. The content also has a
  model with one active and one archived action, and an action with no model in the root collection; the number of
  actions does not change with `n`. Calls `f` with the root collection's id."
  [n f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
    (mt/with-model-cleanup [:model/Action :model/Card :model/Dashboard :model/DashboardCard :model/Collection]
      (let [mp     (mt/metadata-provider)
            venues (lib/query mp (lib.metadata/table mp (mt/id :venues)))
            price  (lib.metadata/field mp (mt/id :venues :price))
            root   (t2/insert-returning-pk! :model/Collection {:name "Walk" :is_remote_synced true :location "/"})
            child  (t2/insert-returning-pk! :model/Collection {:name "Walk child" :is_remote_synced true
                                                               :location (format "/%d/" root)})
            nested (t2/insert-returning-pk! :model/Collection {:name "Walk nested" :is_remote_synced true
                                                               :location (format "/%d/%d/" root child)})
            colls  [root child nested]
            cards  (vec (for [i (range n)]
                          (insert-card! (colls (mod i 3)) i (lib/filter venues (lib/> price i)))))
            model  (insert-card! child n venues :name "Walk model" :type :model)]
        (insert-card! nested (inc n) (lib/query mp (lib.metadata/card mp (first cards))))
        (insert-query-action! {:name "Walk action" :model_id model})
        (insert-query-action! {:name "Walk archived action" :model_id model :archived true})
        (insert-query-action! {:name "Walk modelless action" :model_id nil :collection_id root})
        (dotimes [d (quot n 5)]
          (let [dash (t2/insert-returning-pk!
                      :model/Dashboard
                      {:name          (format "Walk dash %03d" d)
                       :collection_id (colls (mod d 3))
                       :creator_id    (mt/user->id :rasta)
                       :parameters    (if (zero? d)
                                        [{:id "p1" :name "P" :slug "p" :type :category
                                          :values_source_type   "card"
                                          :values_source_config {:card_id (peek cards) :value_field [:field 1 nil]}}]
                                        [])})
                dcs  (vec (for [k (range 3)]
                            (t2/insert-returning-pk!
                             :model/DashboardCard
                             {:dashboard_id dash :card_id (cards (mod (+ d k) n))
                              :row (* 4 k) :col 0 :size_x 12 :size_y 4
                              :parameter_mappings [] :visualization_settings {}})))]
            (when (zero? d)
              (t2/insert! :model/DashboardCardSeries {:dashboardcard_id (first dcs) :card_id (cards 5) :position 0}))))
        (f root)))))

(defn- walk-statements! [n]
  (do-with-content! n (fn [_] (:statements (db-activity/count-db-activity! spec/exportable-entities)))))

(deftest exportable-walk-statements-do-not-grow-with-content-test
  (testing "the walk's statement count is the same for 20 cards and 4 dashboards as for 40 cards and 8 dashboards"
    (let [small (walk-statements! 20)
          large (walk-statements! 40)]
      (testing (format "statements: %d at 20 cards, %d at 40 cards" small large)
        (is (pos? small))
        (is (= small large))))))
