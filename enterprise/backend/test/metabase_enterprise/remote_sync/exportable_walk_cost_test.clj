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
   [metabase.dashboards.db :as dashboards.db]
   [metabase.models.serialization :as serdes]
   [metabase.queries.db :as queries.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
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
  one card built on another card, and `(quot n 5)` dashboards of three dashcards each; the first dashboard's first
  dashcard has a series card and its filter takes values from a card. Calls `f` with the root collection's id."
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
          (let [dash (t2/insert-returning-pk!
                      :model/Dashboard
                      {:name (format "Walk dash %03d" d) :collection_id (colls (mod d 3))
                       :creator_id (mt/user->id :rasta)
                       :parameters (if (zero? d)
                                     [{:id "p1" :name "P" :slug "p" :type :category
                                       :values_source_type "card"
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
  (do-with-content! n (fn [_] (:statements (db-activity/count-db-activity spec/exportable-entities)))))

(deftest exportable-walk-statements-do-not-grow-with-content-test
  (testing "the walk's statement count is the same for 20 cards and 4 dashboards as for 40 cards and 8 dashboards"
    (let [small (walk-statements! 20)
          large (walk-statements! 40)]
      (testing (format "statements: %d at 20 cards, %d at 40 cards" small large)
        (is (pos? small))
        (is (= small large))))))

(deftest exportable-walk-finds-what-the-per-entity-walk-finds-test
  (testing "the batched walk finds exactly the targets that calling serdes/descendants once per entity finds"
    (do-with-content!
     10
     (fn [root]
       (let [batched    (spec/exportable-entities)
             ;; the walk as it was: serdes/descendants once per entity from the one root (which has no parent, so
             ;; the `required` walk adds nothing), minus the models git sync walks through but never writes
             per-entity (-> (u/group-by first second
                                        (keys (u/traverse [["Collection" root]]
                                                          #(serdes/descendants (first %) (second %)
                                                                               spec/git-sync-extract-opts))))
                            (dissoc "Table" "Field"))]
         (is (= 11 (count (get batched "Card"))))
         (is (= 2 (count (get batched "Dashboard"))))
         (is (= (update-vals per-entity set) (update-vals batched set))))))))

(deftest descendants-batch-matches-descendants-test
  (testing "each batched override finds the union of what serdes/descendants finds entity by entity"
    (do-with-content!
     10
     (fn [_]
       (doseq [model ["Card" "Dashboard"]
               :let  [ids (get (spec/exportable-entities) model)]]
         (testing model
           (is (seq ids))
           (is (= (into #{} (mapcat #(keys (serdes/descendants model % spec/git-sync-extract-opts))) ids)
                  (set (keys (serdes/descendants-batch model ids spec/git-sync-extract-opts)))))))))))

(deftest exportable-walk-bounds-ids-per-query-test
  (testing "with the batch size bound to 3, no descendants-batch call and no id query of the walk gets more than 3 ids,
           and the walk finds exactly what it finds unbounded (a level holds far more ids than a database accepts as
           bind parameters on a large instance)"
    ;; 20 cards: the root collection holds two dashboards, so one level has 6 dashcards
    (do-with-content!
     20
     (fn [_]
       (let [unbounded (spec/exportable-entities)
             sizes     (atom [])
             batch     serdes/descendants-batch
             bounded   (binding [serdes/*descendants-batch-size* 3]
                         (with-redefs [serdes/descendants-batch
                                       (fn [model ids opts]
                                         (swap! sizes conj [[:descendants-batch model] (count ids)])
                                         (batch model ids opts))

                                       queries.db/cards
                                       (let [f queries.db/cards]
                                         (fn [ids] (swap! sizes conj [:cards (count ids)]) (f ids)))

                                       dashboards.db/dashboards
                                       (let [f dashboards.db/dashboards]
                                         (fn [ids] (swap! sizes conj [:dashboards (count ids)]) (f ids)))

                                       dashboards.db/dashcard-serdes-columns-for-dashboards
                                       (let [f dashboards.db/dashcard-serdes-columns-for-dashboards]
                                         (fn [ids] (swap! sizes conj [:dashcards (count ids)]) (f ids)))

                                       dashboards.db/dashcard-series-columns
                                       (let [f dashboards.db/dashcard-series-columns]
                                         (fn [ids] (swap! sizes conj [:series (count ids)]) (f ids)))]
                           (spec/exportable-entities)))]
         (is (= (update-vals unbounded set) (update-vals bounded set)))
         (testing "the walk did batch: some model had more than 3 ids at a level"
           (is (< 3 (count (get unbounded "Card")))))
         (doseq [label [[:descendants-batch "Card"] [:descendants-batch "Dashboard"] :cards :dashboards :dashcards :series]]
           (testing label
             (is (seq (filter #(= label (first %)) @sizes)) "was called")))
         (testing "no call got more than 3 ids"
           (is (= [] (filterv #(< 3 (second %)) @sizes)))))))))
