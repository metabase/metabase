(ns metabase-enterprise.remote-sync.cost-test-util
  "Helpers for remote-sync cost tests: counts, not clocks.

  A cost test measures a scenario with [[measure!]], usually at two sizes, and asserts on the per-entity
  difference ([[per-entity]]), which cancels the fixed per-pull overhead. This assumes that the cost is linear in
  the entity count; then small sizes give the per-entity numbers of large ones.

  [[measure!]] uses the JVM-wide JDBC counter, so it throws in a `^:parallel` test. The content helpers expect
  `rs.test/clean-remote-sync-state` around each test.

  Example: per MBQL card, the cost of a forced reload of unchanged content.

    (per-entity (forced-reload-of-unchanged! {:cards 10})
                (forced-reload-of-unchanged! {:cards 20})
                10 20)"
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.test-helpers :as rs.test]
   [metabase.app-db.activity-test-util :as activity]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ measuring ------------------------------------------------

(defn counting
  "A spy for `real` that increments the atom `counter` on each call."
  [counter real]
  (fn [& args] (swap! counter inc) (apply real args)))

(defn max-updated-at
  "{model latest `updated_at`} for each of `models`."
  [models]
  (into {} (for [m models]
             [m (t2/select-one-fn :m m {:select [[:%max.updated_at :m]]})])))

(defn rewritten-since
  "{model count} of the rows of each model of `before` (a [[max-updated-at]] result) whose `updated_at` is later than
  the value there. A nil value is an empty table, so all of its rows count."
  [before]
  (into {} (for [[m latest] before]
             [m (if latest
                  (t2/count m :updated_at [:> latest])
                  (t2/count m))])))

(defn measure!
  "Run `thunk` and return its result under `:result`, with every JDBC-level count from
  [[metabase.app-db.activity-test-util/count-db-activity!]] (see [[metabase.app-db.activity-test-util/count-keys]]) and
  two domain counts:

  - `:metadata-inferences` Card `result_metadata` inferences (QP preprocessing) on the calling thread and on the
                           threads that receive its bindings (`future`, `bound-fn`, `in-virtual-thread*`); not on a
                           raw `Thread`.
  - `:rows-rewritten`      cards and dashboards that the thunk inserted or updated: rows with an `updated_at` later
                           than the latest one before the thunk."
  [thunk]
  (let [inferences (atom 0)
        before     (max-updated-at [:model/Card :model/Dashboard])]
    ;; so that an `updated_at` written during the thunk is strictly later than `before`
    (Thread/sleep 5)
    (mt/with-dynamic-fn-redefs [card.metadata/infer-metadata
                                (counting inferences (mt/original-fn #'card.metadata/infer-metadata))]
      (let [counts (activity/count-db-activity! thunk)]
        (assoc counts
               :metadata-inferences @inferences
               :rows-rewritten      (reduce + (vals (rewritten-since before))))))))

(def ^:private cost-keys
  (into activity/count-keys [:metadata-inferences :rows-rewritten]))

(defn per-entity
  "Per-entity cost from two [[measure!]] results `small` and `large` of the same scenario at sizes `n-small` and
  `n-large`. Returns a map of each count key to a double."
  [small large n-small n-large]
  (into {}
        (for [k cost-keys]
          [k (double (/ (- (k large) (k small)) (- n-large n-small)))])))

;;; ------------------------------------------------ content ------------------------------------------------

(defn do-with-content!
  "Create a remote-synced collection with `cards` MBQL cards (3 field refs each) and `dashboards` dashboards of
  `dashcards` dashboard cards each, then call `f` with the files that an export would write. Sets
  `remote-sync-type` to `:read-write` and `remote-sync-transforms` to false for the duration, and deletes the
  content that it created afterwards."
  [{:keys [cards dashboards dashcards] :or {dashboards 0 dashcards 0}} f]
  (mt/with-temporary-setting-values [remote-sync-type :read-write remote-sync-transforms false]
    (mt/with-model-cleanup [:model/Card :model/Dashboard :model/DashboardCard :model/Collection]
      (let [mp       (mt/metadata-provider)
            venues   (lib/query mp (lib.metadata/table mp (mt/id :venues)))
            price    (lib.metadata/field mp (mt/id :venues :price))
            category (lib.metadata/field mp (mt/id :venues :category_id))
            coll     (t2/insert-returning-pk! :model/Collection {:name "Cost" :is_remote_synced true :location "/"})
            card-ids (vec (for [i (range cards)]
                            (t2/insert-returning-pk!
                             :model/Card
                             {:name                   (format "Cost card %03d" i)
                              :collection_id          coll
                              :creator_id             (mt/user->id :rasta)
                              :display                :line
                              :visualization_settings {}
                              :dataset_query          (-> venues
                                                          (lib/aggregate (lib/sum price))
                                                          (lib/breakout category)
                                                          (lib/filter (lib/> price i)))})))]
        (dotimes [d dashboards]
          (let [dash (t2/insert-returning-pk! :model/Dashboard {:name (format "Cost dash %03d" d) :collection_id coll
                                                                :creator_id (mt/user->id :rasta) :parameters []})]
            (when (pos? dashcards)
              (t2/insert! :model/DashboardCard
                          (for [k (range dashcards)]
                            {:dashboard_id dash :card_id (card-ids (mod (+ d k) (count card-ids)))
                             :row (* 4 k) :col 0 :size_x 12 :size_y 4
                             :parameter_mappings [] :visualization_settings {}})))))
        (f (rs.test/synced-tree))))))

;;; ------------------------------------------------ scenarios ------------------------------------------------

(defn forced-reload-of-unchanged!
  "Load the content `shape` (the options of [[do-with-content!]]) once, then call `run` (default [[measure!]]) with a
  thunk that runs a forced pull of the same content, and return what `run` returns. Asserts that the first load
  succeeds. Runs with the search index disabled."
  ([shape]
   (forced-reload-of-unchanged! shape measure!))
  ([shape run]
   (search.tu/with-index-disabled
     (do-with-content! shape
                       (fn [tree]
                         (let [src (rs.test/versioned-source :trees {"v0" tree} :current "v0")]
                           (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline load")
                           (run #(rs.test/import-at! src "v0" :force? true))))))))
