(ns metabase-enterprise.remote-sync.exportable-walk-cost-test
  "The dependency walk [[spec/exportable-entities]] runs before every export, export preview and merge pull. Its app-DB
  cost must not grow with the amount of local content, and it must find exactly what the entity-at-a-time walk over
  `serdes/descendants` finds.

  Not ^:parallel: measures with the JVM-wide JDBC counter ([[db-activity/count-db-activity]])."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.db-activity :as db-activity]
   [metabase-enterprise.remote-sync.spec :as spec]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each rs.test/clean-remote-sync-state rs.test/commit-with-temp)

(defn- insert-card! [coll i & {:as extra}]
  (t2/insert-returning-pk!
   :model/Card
   (merge {:name                   (format "Walk card %03d" i)
           :collection_id          coll
           :creator_id             (mt/user->id :rasta)
           :display                :table
           :visualization_settings {}
           :dataset_query          (mt/mbql-query venues {:filter [:> $price i]})}
          extra)))

(defn- do-with-content!
  "A remote-synced collection with two child collections (one nested in the other), `n` cards spread over the three,
  one card built on another card, and `(quot n 5)` dashboards of three dashcards each. Calls `f`."
  [n f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Collection]
      (let [root   (t2/insert-returning-pk! :model/Collection {:name "Walk" :is_remote_synced true :location "/"})
            child  (t2/insert-returning-pk! :model/Collection {:name "Walk child" :is_remote_synced true
                                                               :location (format "/%d/" root)})
            nested (t2/insert-returning-pk! :model/Collection {:name "Walk nested" :is_remote_synced true
                                                               :location (format "/%d/%d/" root child)})
            colls  [root child nested]
            cards  (vec (for [i (range n)] (insert-card! (colls (mod i 3)) i)))]
        (insert-card! nested n :dataset_query (mt/mbql-query nil {:source-table (str "card__" (first cards))}))
        (dotimes [d (quot n 5)]
          (let [dash (t2/insert-returning-pk! :model/Dashboard {:name (format "Walk dash %03d" d)
                                                                :collection_id (colls (mod d 3))
                                                                :creator_id (mt/user->id :rasta) :parameters []})]
            (t2/insert! :model/DashboardCard
                        (for [k (range 3)]
                          {:dashboard_id dash :card_id (cards (mod (+ d k) n))
                           :row (* 4 k) :col 0 :size_x 12 :size_y 4
                           :parameter_mappings [] :visualization_settings {}}))))
        (f)))))

(defn- walk-statements [n]
  (do-with-content! n #(:statements (db-activity/count-db-activity spec/exportable-entities))))

(deftest exportable-walk-statements-do-not-grow-with-content-test
  (testing "the walk's statement count is the same for 20 cards and 4 dashboards as for 40 cards and 8 dashboards"
    (let [small (walk-statements 20)
          large (walk-statements 40)]
      (testing (format "statements: %d at 20 cards, %d at 40 cards" small large)
        (is (pos? small))
        (is (= small large))))))
