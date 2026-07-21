(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.sparse-test
  "The `sparse` imbalanced checker: a little content, not none, across collection (raw direct item
  count) and dashboard (dashcards total across tabs). The rule floors at 1, so a zero-count subject is
  the `empty` checker's alone. Asserts only `:sparse` findings; cross-type co-occurrence lives in the
  imbalanced integration suite."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- sparse-by-entity!
  "Run a scan and index its `:sparse` findings by `[entity-type entity-id]` (the sparse checker emits at
  most one per entity, so the key is unique)."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (t2/select-fn->fn (juxt :entity_type :entity_id) identity
                      :model/ContentDiagnosticsFinding
                      :scan_id scan-id :finding_type :sparse)))

;;; ---------------------------------------------------- collections ----------------------------------------

(deftest sparse-collection-test
  (testing "collection sparse sits on the raw direct item count, strictly < the bound and flooring at 1; a child collection counts as a direct item"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-sparse-collection-threshold-items 3]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [;; 0 items → not sparse (the empty checker's domain, sparse floors at 1)
             :model/Collection {zero-coll :id} {}
             ;; 2 cards < 3 → sparse
             :model/Collection {sparse-coll :id} {}
             :model/Card _ {:collection_id sparse-coll}
             :model/Card _ {:collection_id sparse-coll}
             ;; exactly 3 → not sparse (strictly <)
             :model/Collection {at-coll :id} {}
             :model/Card _ {:collection_id at-coll}
             :model/Card _ {:collection_id at-coll}
             :model/Card _ {:collection_id at-coll}
             ;; 1 card + 1 child collection = 2 items → sparse (child collections count as items)
             :model/Collection {child-counts :id} {}
             :model/Card _ {:collection_id child-counts}
             :model/Collection _ {:location (collection/location-path child-counts)}]
            (let [by-entity (sparse-by-entity!)]
              (testing "0 items → not sparse (floors at 1)"
                (is (nil? (by-entity [:collection zero-coll]))))
              (testing "2 items < 3 → sparse, raw count in content_count, bound + unit frozen"
                (let [f (by-entity [:collection sparse-coll])]
                  (is (some? f))
                  (is (= :sparse (:finding_type f)))
                  (is (= 2 (:content_count f)))
                  (is (= {:threshold 3 :unit "items"} (:details f)))))
              (testing "exactly at the bound (3 items) → not sparse"
                (is (nil? (by-entity [:collection at-coll]))))
              (testing "a child collection counts toward the item total (1 card + 1 child = 2 → sparse)"
                (let [f (by-entity [:collection child-counts])]
                  (is (some? f))
                  (is (= 2 (:content_count f))))))))))))

;;; ----------------------------------------------------- dashboards -----------------------------------------

(deftest sparse-dashboard-test
  (testing "dashboard sparse counts dashcards across ALL tabs (per-tab counting is crowded-only), strictly < the bound and flooring at 1"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-sparse-dashboard-threshold-dashcards 4]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             ;; 3 dashcards total < 4 → sparse
             :model/Dashboard {sparse-dash :id} {:collection_id coll}
             :model/DashboardCard _ {:dashboard_id sparse-dash}
             :model/DashboardCard _ {:dashboard_id sparse-dash}
             :model/DashboardCard _ {:dashboard_id sparse-dash}
             ;; 3 dashcards on each of 2 tabs = 6 total → NOT sparse (count spans tabs, 6 not < 4)
             :model/Dashboard    {two-tabs :id} {:collection_id coll}
             :model/DashboardTab {tt-t1 :id} {:dashboard_id two-tabs}
             :model/DashboardTab {tt-t2 :id} {:dashboard_id two-tabs}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t1}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t1}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t1}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t2}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t2}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t2}
             ;; exactly at the bound (4) → not sparse
             :model/Dashboard {at-dash :id} {:collection_id coll}
             :model/DashboardCard _ {:dashboard_id at-dash}
             :model/DashboardCard _ {:dashboard_id at-dash}
             :model/DashboardCard _ {:dashboard_id at-dash}
             :model/DashboardCard _ {:dashboard_id at-dash}
             ;; 0 dashcards → not sparse (floors at 1, the empty checker's domain)
             :model/Dashboard {empty-dash :id} {:collection_id coll}]
            (let [by-entity (sparse-by-entity!)]
              (testing "3 dashcards < 4 → sparse with the total as content_count"
                (let [f (by-entity [:dashboard sparse-dash])]
                  (is (some? f))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 4 :unit "dashcards"} (:details f)))))
              (testing "6 dashcards across 2 tabs is not sparse - the count spans tabs"
                (is (nil? (by-entity [:dashboard two-tabs]))))
              (testing "exactly 4 dashcards → not sparse (strictly <)"
                (is (nil? (by-entity [:dashboard at-dash]))))
              (testing "0 dashcards → not sparse (floors at 1)"
                (is (nil? (by-entity [:dashboard empty-dash])))))))))))
