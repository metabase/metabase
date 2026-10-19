(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.crowded-test
  "The `crowded` imbalanced checker: too much content, across collection (raw direct item count),
  dashboard (dashcards-per-tab then tabs, a within-type precedence), and document (embedded cards).
  Asserts only `:crowded` findings; cross-type co-occurrence lives in the imbalanced integration suite."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- crowded-by-entity!
  "Run a scan and index its `:crowded` findings by `[entity-type entity-id]` (the crowded checker emits
  at most one per entity, so the key is unique)."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (t2/select-fn->fn (juxt :entity_type :entity_id) identity
                      :model/ContentDiagnosticsFinding
                      :scan_id scan-id :finding_type :crowded)))

;;; ---------------------------------------------------- collections ----------------------------------------

(deftest crowded-collection-test
  (testing "collection crowded sits on the raw direct item count, strictly > the bound; a child collection counts as a direct item"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-crowded-collection-threshold-items 3]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [;; 3 cards + 1 child collection = 4 items > 3 → crowded
             :model/Collection {crowded-coll :id} {}
             :model/Card _ {:collection_id crowded-coll}
             :model/Card _ {:collection_id crowded-coll}
             :model/Card _ {:collection_id crowded-coll}
             :model/Collection {crowded-child :id} {:location (collection/location-path crowded-coll)}
             :model/Card _ {:collection_id crowded-child}
             ;; exactly 3 items → not crowded (strictly >)
             :model/Collection {at-coll :id} {}
             :model/Card _ {:collection_id at-coll}
             :model/Card _ {:collection_id at-coll}
             :model/Card _ {:collection_id at-coll}]
            (let [by-entity (crowded-by-entity!)]
              (testing "4 direct items (3 cards + a child collection) > 3 → crowded"
                (let [f (by-entity [:collection crowded-coll])]
                  (is (some? f))
                  (is (= :crowded (:finding_type f)))
                  (is (= 4 (:content_count f)))
                  (is (= {:threshold 3 :unit "items"} (:details f)))))
              (testing "exactly at the bound (3 items) → not crowded"
                (is (nil? (by-entity [:collection at-coll])))))))))))

;;; ----------------------------------------------------- dashboards -----------------------------------------

(deftest crowded-dashboard-test
  (testing "dashboard crowding checks dashcards-per-tab first, then tabs (one crowded finding max); a tabless dashboard is one implicit tab"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab 2
                                         content-diagnostics-crowded-dashboard-threshold-tabs              2]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             ;; 3 dashcards on the single implicit tab (>2) → crowded by dashcards
             :model/Dashboard {slot-crowded :id} {:collection_id coll}
             :model/DashboardCard _ {:dashboard_id slot-crowded}
             :model/DashboardCard _ {:dashboard_id slot-crowded}
             :model/DashboardCard _ {:dashboard_id slot-crowded}
             ;; 3 tabs (>2), no tab over the dashcard bound → crowded by tabs
             :model/Dashboard    {tab-crowded :id} {:collection_id coll}
             :model/DashboardTab {tc-t1 :id} {:dashboard_id tab-crowded}
             :model/DashboardTab {tc-t2 :id} {:dashboard_id tab-crowded}
             :model/DashboardTab {tc-t3 :id} {:dashboard_id tab-crowded}
             :model/DashboardCard _ {:dashboard_id tab-crowded :dashboard_tab_id tc-t1}
             :model/DashboardCard _ {:dashboard_id tab-crowded :dashboard_tab_id tc-t2}
             :model/DashboardCard _ {:dashboard_id tab-crowded :dashboard_tab_id tc-t3}
             ;; both violations - the dashcards-per-tab check wins (within-type precedence)
             :model/Dashboard    {both :id} {:collection_id coll}
             :model/DashboardTab {b-t1 :id} {:dashboard_id both}
             :model/DashboardTab _ {:dashboard_id both}
             :model/DashboardTab _ {:dashboard_id both}
             :model/DashboardCard _ {:dashboard_id both :dashboard_tab_id b-t1}
             :model/DashboardCard _ {:dashboard_id both :dashboard_tab_id b-t1}
             :model/DashboardCard _ {:dashboard_id both :dashboard_tab_id b-t1}
             ;; tabless with 2 dashcards: one implicit tab (not 0 tabs), at every bound → not crowded
             :model/Dashboard {ok-tabless :id} {:collection_id coll}
             :model/DashboardCard _ {:dashboard_id ok-tabless}
             :model/DashboardCard _ {:dashboard_id ok-tabless}]
            (let [by-entity (crowded-by-entity!)]
              (testing "3 dashcards on one (implicit) tab > 2 → crowded, unit dashcards"
                (let [f (by-entity [:dashboard slot-crowded])]
                  (is (some? f))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 2 :unit "dashcards"} (:details f)))))
              (testing "3 tabs > 2 (no tab over the dashcard bound) → crowded, unit tabs"
                (let [f (by-entity [:dashboard tab-crowded])]
                  (is (some? f))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 2 :unit "tabs"} (:details f)))))
              (testing "both violations → ONE finding, the dashcards-per-tab one"
                (let [f (by-entity [:dashboard both])]
                  (is (some? f))
                  (is (= "dashcards" (get-in f [:details :unit])))))
              (testing "a tabless dashboard exactly at the bounds → not crowded (implicit tab is 1, not 0)"
                (is (nil? (by-entity [:dashboard ok-tabless])))))))))))

;;; ------------------------------------------------------ documents -----------------------------------------

(defn- doc-ast
  "A prose-mirror document AST wrapping `nodes`."
  [& nodes]
  {:type "doc" :content (vec nodes)})

(deftest crowded-document-test
  (testing "document crowded = embedded card count strictly > the bound"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-crowded-document-threshold-cards 2]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             ;; 3 card embeds > 2 → crowded
             :model/Document {crowded-doc :id} {:collection_id coll
                                                :document (apply doc-ast
                                                                 (for [i [101 102 103]]
                                                                   {:type "cardEmbed" :attrs {:id i}}))}
             ;; 2 embeds → at the bound, not crowded
             :model/Document {at-doc :id} {:collection_id coll
                                           :document (apply doc-ast
                                                            (for [i [104 105]]
                                                              {:type "cardEmbed" :attrs {:id i}}))}]
            (let [by-entity (crowded-by-entity!)]
              (testing "3 embedded cards > 2 → crowded with the count"
                (let [f (by-entity [:document crowded-doc])]
                  (is (some? f))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 2 :unit "cards"} (:details f)))))
              (testing "exactly at the bound → not crowded"
                (is (nil? (by-entity [:document at-doc])))))))))))

;;; ------------------------------------------------- frozen thresholds --------------------------------------

(deftest crowded-threshold-frozen-at-scan-time-test
  (testing "the bound is read from the setting at scan time and frozen in details; a later change rewrites nothing"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll :id} {}
                       :model/Card _ {:collection_id coll}
                       :model/Card _ {:collection_id coll}
                       :model/Card _ {:collection_id coll}]
          (mt/with-temporary-setting-values [content-diagnostics-crowded-collection-threshold-items 2]
            (scan/scan!))
          (testing "flagged against the non-default bound (2, not 100) - the setting is read, not hard-coded"
            (mt/with-temporary-setting-values [content-diagnostics-crowded-collection-threshold-items 50]
              (let [f (t2/select-one :model/ContentDiagnosticsFinding
                                     :entity_type :collection :entity_id coll :finding_type :crowded)]
                (is (some? f))
                (is (= 3 (:content_count f)))
                (is (= 2 (get-in f [:details :threshold])))))))))))
