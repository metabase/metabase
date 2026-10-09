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
   [metabase.dashboards.db :as dashboards.db]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.queries.db :as queries.db]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
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

(defn- by-model
  "The `[model-name id]` keys `ks` as `{model-name #{id ...}}`, without the models that git sync walks through but never
  writes."
  [ks]
  (-> (apply dissoc (u/group-by first second ks) @#'spec/models-traversed-but-not-stored)
      (update-vals set)))

(defn- per-entity-walk
  "The walk as it was: `serdes/descendants` once per entity from the root collection `root` (which has no parent, so
  the `required` walk adds nothing), grouped by [[by-model]]."
  [root opts]
  (by-model (keys (u/traverse [["Collection" root]] #(serdes/descendants (first %) (second %) opts)))))

(deftest exportable-walk-finds-what-the-per-entity-walk-finds-test
  (testing "the walk finds exactly the targets that calling serdes/descendants once per entity finds"
    (do-with-content!
     10
     (fn [root]
       (let [targets (update-vals (spec/exportable-entities) set)]
         (is (= 12 (count (get targets "Card"))) "10 cards, the model, and the card built on a card")
         (is (= 2 (count (get targets "Dashboard"))))
         (is (= #{"Walk action" "Walk modelless action"}
                (t2/select-fn-set :name :model/Action :id [:in (get targets "Action")]))
             "the active actions, with and without a model; the archived action is skipped")
         (is (= (per-entity-walk root spec/git-sync-extract-opts) targets)))))))

(defn- descendant-closure
  "The walk of [[spec/exportable-entities]] from the root collection `root` with `opts`, grouped like
  [[per-entity-walk]]."
  [root opts]
  (by-model (#'spec/descendant-closure [["Collection" root]] opts)))

(deftest batched-walk-honors-skip-archived-test
  (testing "the batched walk and the per-entity walk find the same targets, archived content skipped or not"
    (do-with-content!
     10
     (fn [root]
       (doseq [skip-archived? [true false]
               :let [opts (assoc spec/git-sync-extract-opts :skip-archived skip-archived?)]]
         (testing (str ":skip-archived " skip-archived?)
           (let [batched (descendant-closure root opts)]
             (is (= (per-entity-walk root opts) batched))
             (is (= (cond-> #{"Walk action" "Walk modelless action"}
                      (not skip-archived?) (conj "Walk archived action"))
                    (t2/select-fn-set :name :model/Action :id [:in (get batched "Action")]))))))))))

(deftest batched-walk-is-the-same-for-each-chunk-size-test
  (testing "the batched walk finds what the per-entity walk finds, for chunk sizes 1 to 7 and 1000"
    (do-with-content!
     20
     (fn [root]
       (let [per-entity (per-entity-walk root spec/git-sync-extract-opts)]
         (doseq [size [1 2 3 4 5 6 7 1000]]
           (testing (str ":descendants-batch-size " size)
             (is (= per-entity
                    (descendant-closure root (assoc spec/git-sync-extract-opts :descendants-batch-size size)))))))))))

(deftest descendants-batch-matches-descendants-test
  (testing "each batch method finds the union of what serdes/descendants finds entity by entity"
    (do-with-content!
     10
     (fn [_]
       (let [targets (spec/exportable-entities)]
         (doseq [model ["Card" "Dashboard"]
                 :let  [ids (get targets model)]]
           (testing model
             (is (seq ids))
             (is (= (into #{} (mapcat #(keys (serdes/descendants model % spec/git-sync-extract-opts))) ids)
                    (set (keys (serdes/descendants-batch model ids spec/git-sync-extract-opts))))))))))))

(deftest exportable-walk-bounds-ids-per-query-test
  (testing (str "with :descendants-batch-size 3, no id query of the walk gets more than 3 ids, and the walk finds what "
                "it finds with the default size")
    ;; 20 cards: the root collection holds two dashboards, so one level has 6 dashcards
    (do-with-content!
     20
     (fn [root]
       (let [sizes (atom [])
             spy   (fn [label f] (fn [ids & more] (swap! sizes conj [label (count ids)]) (apply f ids more)))
             ;; descendants-batch is a multimethod, which with-dynamic-fn-redefs cannot wrap; the id queries of its
             ;; Card and Dashboard methods show the size of each call
             walk  (fn [opts]
                     (reset! sizes [])
                     [(mt/with-dynamic-fn-redefs
                        [queries.db/cards
                         (spy :cards (mt/original-fn #'queries.db/cards))

                         dashboards.db/dashboards
                         (spy :dashboards (mt/original-fn #'dashboards.db/dashboards))

                         dashboards.db/dashcard-serdes-columns-for-dashboards
                         (spy :dashcards (mt/original-fn #'dashboards.db/dashcard-serdes-columns-for-dashboards))

                         dashboards.db/dashcard-series-columns
                         (spy :series (mt/original-fn #'dashboards.db/dashcard-series-columns))]
                        (descendant-closure root opts))
                      @sizes])
             [unbounded unbounded-calls] (walk spec/git-sync-extract-opts)
             [bounded bounded-calls]     (walk (assoc spec/git-sync-extract-opts :descendants-batch-size 3))]
         (is (= unbounded bounded))
         (testing "the walk did batch: some model had more than 3 ids at a level, so the bounded walk made more calls"
           (is (< (count unbounded-calls) (count bounded-calls))))
         (doseq [label [:cards :dashboards :dashcards :series]]
           (testing label
             (is (seq (filter #(= label (first %)) bounded-calls)) "was called")))
         (testing "no call got more than 3 ids"
           (is (= [] (filterv #(< 3 (second %)) bounded-calls)))))))))
