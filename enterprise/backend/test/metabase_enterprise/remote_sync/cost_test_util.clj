(ns metabase-enterprise.remote-sync.cost-test-util
  "Helpers for remote-sync cost tests that assert on counts.

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

(defn- counting [counter real]
  (fn [& args] (swap! counter inc) (apply real args)))

(defn- max-updated-at []
  {:card      (t2/select-one-fn :m :model/Card {:select [[:%max.updated_at :m]]})
   :dashboard (t2/select-one-fn :m :model/Dashboard {:select [[:%max.updated_at :m]]})})

(defn- rewritten-since
  "The cards and dashboards with an `updated_at` later than the values of [[max-updated-at]]. A nil value is an empty
  table, so all of its rows count."
  [{:keys [card dashboard]}]
  (letfn [(newer [model latest]
            (if latest
              (t2/count model :updated_at [:> latest])
              (t2/count model)))]
    (+ (newer :model/Card card)
       (newer :model/Dashboard dashboard))))

(defn measure!
  "Run `thunk` and return its result under `:result`, with every JDBC-level count from
  [[metabase.app-db.activity-test-util/count-db-activity!]] (see [[metabase.app-db.activity-test-util/count-keys]]) and
  two domain counts:

  - `:metadata-inferences` Card `result_metadata` inferences (QP preprocessing) on the calling thread and on the
                           threads that receive its bindings (`future`, `bound-fn`, `in-virtual-thread*`); not on a
                           raw `Thread`.
  - `:rows-rewritten`      Card and Dashboard rows, from any writer, whose `updated_at` is later than the latest
                           value before the thunk. The models' timestamp hook sets `updated_at`, so a table-level
                           update or a change only to `last_viewed_at` is not counted."
  [thunk]
  (let [inferences (atom 0)
        before     (max-updated-at)]
    ;; so that an `updated_at` written during the thunk is strictly later than `before`
    (Thread/sleep 5)
    (mt/with-dynamic-fn-redefs [card.metadata/infer-metadata
                                (counting inferences (mt/original-fn #'card.metadata/infer-metadata))]
      (let [counts (activity/count-db-activity! thunk)]
        (assoc counts
               :metadata-inferences @inferences
               :rows-rewritten      (rewritten-since before))))))

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
  `remote-sync-type` to `:read-write` and `remote-sync-transforms` to false for the duration: the two setting rows
  that the bindings store stay, and `rs.test/clean-remote-sync-state` around the test deletes them. Deletes every
  new Card, Dashboard, DashboardCard and Collection row afterwards, from any writer. Throws when `:dashcards` is
  positive and `:cards` is 0 (a dashcard needs a card to show)."
  [{:keys [cards dashboards dashcards] :or {dashboards 0 dashcards 0}} f]
  (when (and (pos? dashcards) (zero? cards))
    (throw (ex-info "do-with-content! needs a card for each dashboard card" {:cards cards :dashcards dashcards})))
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
  "Load the content `shape` (the options of [[do-with-content!]]), import it once, and return the [[measure!]]
  result of a second forced import. Asserts that the first import succeeds; runs with the search index disabled."
  [shape]
  (search.tu/with-index-disabled
    (do-with-content! shape
                      (fn [tree]
                        (let [src (rs.test/versioned-source :trees {"v0" tree} :current "v0")]
                          (is (= :success (:status (rs.test/import-at! src "v0" :force? true))) "baseline load")
                          (measure! #(rs.test/import-at! src "v0" :force? true)))))))
