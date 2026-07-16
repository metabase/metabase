(ns metabase-enterprise.content-diagnostics.imbalanced-test
  "The imbalanced checker flags empty/sparse/crowded content across collection (with a recursive
  emptiness cascade), card (empty via the last-run signal), dashboard, document, and transform,
  stamping the measured magnitude in the top-level `content_count` column and freezing
  `{threshold, unit}` (+ `as_of` on evidence-dated empties) in `details` at scan time. The
  `/imbalanced` umbrella endpoint serves all three finding types with `finding-types` narrowing,
  `min-`/`max-content-count` bounds, and the shared filter/sort/pagination envelope."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- scope-prefix
  "Unique per-test entity-name prefix, passed as `:query` so assertions only see rows the test seeded -
  the findings table is shared across tests."
  []
  (str "cd-" (mt/random-name)))

(defn- imbalanced-findings-by-entity!
  "Run a scan and index its imbalanced (empty/sparse/crowded) findings by `[entity-type entity-id]`."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (t2/select-fn->fn (juxt :entity_type :entity_id) identity
                      :model/ContentDiagnosticsFinding
                      :scan_id scan-id
                      :finding_type [:in [:empty :sparse :crowded]])))

;;; --------------------------------------------- checker: collections -------------------------------------

(deftest imbalanced-collection-rules-test
  (testing "collection empty/sparse/crowded verdicts sit on the direct item count; crowded is strictly >, sparse strictly <; archived members never count"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-crowded-collection-threshold-items 3
                                         content-diagnostics-sparse-collection-threshold-items  3]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {empty-coll :id} {}
             :model/Collection {sparse-coll :id} {}
             :model/Card _ {:collection_id sparse-coll}
             :model/Card _ {:collection_id sparse-coll}
             ;; exactly at both bounds (3 is neither >3 nor <3) - no finding
             :model/Collection {at-coll :id} {}
             :model/Card      _ {:collection_id at-coll}
             :model/Dashboard {at-dash :id} {:collection_id at-coll}
             :model/DashboardCard _ {:dashboard_id at-dash}
             :model/Collection _ {:location (collection/location-path at-coll)}
             ;; over the crowded bound - a child collection counts as a direct item
             :model/Collection {crowded-coll :id} {}
             :model/Card _ {:collection_id crowded-coll}
             :model/Card _ {:collection_id crowded-coll}
             :model/Card _ {:collection_id crowded-coll}
             :model/Collection {crowded-child :id} {:location (collection/location-path crowded-coll)}
             :model/Card _ {:collection_id crowded-child}
             ;; only an archived card - archived members don't count, so it IS empty
             :model/Collection {arch-coll :id} {}
             :model/Card _ {:collection_id arch-coll :archived true}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "0 items → empty, content_count 0, implicit threshold 0 frozen with the unit"
                (let [f (by-entity [:collection empty-coll])]
                  (is (= :empty (:finding_type f)))
                  (is (= 0 (:content_count f)))
                  (is (= {:threshold 0 :unit "items"} (:details f)))))
              (testing "2 items < 3 → sparse, raw count in content_count, bound + unit frozen"
                (let [f (by-entity [:collection sparse-coll])]
                  (is (= :sparse (:finding_type f)))
                  (is (= 2 (:content_count f)))
                  (is (= {:threshold 3 :unit "items"} (:details f)))))
              (testing "exactly at the bounds (3 items) → no finding (crowded is strictly >, sparse strictly <)"
                (is (nil? (by-entity [:collection at-coll]))))
              (testing "4 direct items (3 cards + a child collection) > 3 → crowded"
                (let [f (by-entity [:collection crowded-coll])]
                  (is (= :crowded (:finding_type f)))
                  (is (= 4 (:content_count f)))
                  (is (= {:threshold 3 :unit "items"} (:details f)))))
              (testing "a collection holding only an archived card is empty"
                (is (= :empty (:finding_type (by-entity [:collection arch-coll]))))))))))))

(deftest imbalanced-collection-cascade-test
  (testing "collection emptiness is recursive over the same scan's verdicts; crowded/sparse stay on raw direct counts"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-sparse-collection-threshold-items 5]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [;; a chain whose only leaf is an empty dashboard - every ancestor is empty
             :model/Collection {gp :id} {}
             :model/Collection {p :id}  {:location (collection/location-path gp)}
             :model/Collection {c :id}  {:location (collection/location-path gp p)}
             :model/Dashboard  {empty-dash :id} {:collection_id c}
             ;; the same chain shape with one deep non-empty leaf - no ancestor is empty
             :model/Collection {gp2 :id} {}
             :model/Collection {p2 :id}  {:location (collection/location-path gp2)}
             :model/Collection {c2 :id}  {:location (collection/location-path gp2 p2)}
             :model/Card _ {:collection_id c2}
             ;; 3 empty dashboards + 1 never-run card = non-empty with 4 raw direct items → sparse (<5)
             :model/Collection {mixed :id} {}
             :model/Dashboard _ {:collection_id mixed}
             :model/Dashboard _ {:collection_id mixed}
             :model/Dashboard _ {:collection_id mixed}
             :model/Card _ {:collection_id mixed}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "the empty-dashboard leaf makes the whole chain empty - the dashboards' own emptiness cascades"
                (is (= :empty (:finding_type (by-entity [:dashboard empty-dash]))))
                (doseq [coll-id [gp p c]]
                  (is (= :empty (:finding_type (by-entity [:collection coll-id])))
                      (str "collection " coll-id))))
              (testing "one deep non-empty leaf keeps the whole chain non-empty (each level then has 1 item → sparse)"
                (doseq [coll-id [gp2 p2 c2]]
                  (is (= :sparse (:finding_type (by-entity [:collection coll-id])))
                      (str "collection " coll-id))))
              (testing "empty items still count toward the raw sparse count: 3 empty dashboards + 1 card = 4 items"
                (let [f (by-entity [:collection mixed])]
                  (is (= :sparse (:finding_type f)))
                  (is (= 4 (:content_count f))))))))))))

(deftest imbalanced-excluded-collection-subjects-test
  (testing "trash, snippet-namespace, archived, and instance-analytics collections are never subjects"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {snippet-coll :id}  {:namespace "snippets"}
                       :model/Collection {archived-coll :id} {:archived true}
                       :model/Collection {ia-coll :id}       {:type "instance-analytics"}]
          (let [by-entity (imbalanced-findings-by-entity!)]
            (doseq [[label coll-id] {"snippet-namespace"  snippet-coll
                                     "archived"           archived-coll
                                     "instance-analytics" ia-coll
                                     "trash"              (collection/trash-collection-id)}]
              (testing (str label " collection produces no finding")
                (is (nil? (by-entity [:collection coll-id])))))))))))

;;; ------------------------------------------------ checker: cards ----------------------------------------

(deftest imbalanced-card-empty-test
  (testing "card-empty rides the latest clean (unparameterized, unsandboxed, non-cache-hit, error-free) execution; other runs neither flag nor clear"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [now (t/offset-date-time)
              ago #(t/minus now (t/minutes %))]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             ;; flagged: deciding run (10m ago) returned 0 rows; the newer parameterized, cache-hit,
             ;; and errored runs are outside the evidence set - they don't clear it (and the errored
             ;; run's own result_rows 0 must not steal as_of)
             :model/Card {flagged :id} {:collection_id coll}
             :model/QueryExecution _ {:card_id flagged :started_at (ago 10)
                                      :parameterized false :cache_hit false :result_rows 0}
             :model/QueryExecution _ {:card_id flagged :started_at (ago 5)
                                      :parameterized true :cache_hit false :result_rows 5}
             :model/QueryExecution _ {:card_id flagged :started_at (ago 2)
                                      :parameterized false :cache_hit false :result_rows 0
                                      :error "Table not found"}
             :model/QueryExecution _ {:card_id flagged :started_at (ago 1)
                                      :parameterized false :cache_hit true :result_rows 5}
             ;; healthy: the latest unparameterized run has rows; the older 0-row run is superseded
             :model/Card {healthy :id} {:collection_id coll}
             :model/QueryExecution _ {:card_id healthy :started_at (ago 10)
                                      :parameterized false :cache_hit false :result_rows 0}
             :model/QueryExecution _ {:card_id healthy :started_at (ago 5)
                                      :parameterized false :cache_hit false :result_rows 7}
             ;; a newer PARAMETERIZED 0-row run must not flag (a filter yielding 0 rows on a healthy card)
             :model/Card {param-zero :id} {:collection_id coll}
             :model/QueryExecution _ {:card_id param-zero :started_at (ago 10)
                                      :parameterized false :cache_hit false :result_rows 9}
             :model/QueryExecution _ {:card_id param-zero :started_at (ago 5)
                                      :parameterized true :cache_hit false :result_rows 0}
             ;; skipped: never ran unparameterized (unknown ≠ empty)
             :model/Card {never :id} {:collection_id coll}
             :model/Card {only-param :id} {:collection_id coll}
             :model/QueryExecution _ {:card_id only-param :started_at (ago 5)
                                      :parameterized true :cache_hit false :result_rows 0}
             ;; skipped: a crashed run stamps result_rows 0 but means "broken", not "empty"
             :model/Card {only-errored :id} {:collection_id coll}
             :model/QueryExecution _ {:card_id only-errored :started_at (ago 5)
                                      :parameterized false :cache_hit false :result_rows 0
                                      :error "Table not found"}
             ;; skipped: a sandboxed run's 0 rows is per-user filtering, not instance-wide emptiness
             :model/Card {only-sandboxed :id} {:collection_id coll}
             :model/QueryExecution _ {:card_id only-sandboxed :started_at (ago 5)
                                      :parameterized false :cache_hit false :result_rows 0
                                      :is_sandboxed true}
             ;; excluded: archived card with a 0-row latest run
             :model/Card {archived-card :id} {:collection_id coll :archived true}
             :model/QueryExecution _ {:card_id archived-card :started_at (ago 5)
                                      :parameterized false :cache_hit false :result_rows 0}
             ;; the cascade: a collection holding only a flagged-empty card is itself empty
             :model/Collection {only-empty-card-coll :id} {}
             :model/Card {c0 :id} {:collection_id only-empty-card-coll}
             :model/QueryExecution _ {:card_id c0 :started_at (ago 5)
                                      :parameterized false :cache_hit false :result_rows 0}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "flagged on the deciding run, as_of frozen to that run's start"
                (let [f (by-entity [:card flagged])]
                  (is (= :empty (:finding_type f)))
                  (is (= 0 (:content_count f)))
                  (is (= 0 (get-in f [:details :threshold])))
                  (is (= "rows" (get-in f [:details :unit])))
                  (is (= (-> (ago 10) t/instant (t/truncate-to :millis))
                         (-> (get-in f [:details :as_of]) t/offset-date-time t/instant (t/truncate-to :millis))))))
              (testing "a newer unparameterized run with rows clears the older 0-row verdict"
                (is (nil? (by-entity [:card healthy]))))
              (testing "a newer parameterized 0-row run does not flag"
                (is (nil? (by-entity [:card param-zero]))))
              (testing "never run unparameterized → skipped (unknown, not empty)"
                (is (nil? (by-entity [:card never])))
                (is (nil? (by-entity [:card only-param]))))
              (testing "an errored run's result_rows 0 does not flag - errored runs are outside the evidence set"
                (is (nil? (by-entity [:card only-errored]))))
              (testing "a sandboxed run's result_rows 0 does not flag - sandboxed runs are outside the evidence set"
                (is (nil? (by-entity [:card only-sandboxed]))))
              (testing "archived card excluded even with a 0-row latest run"
                (is (nil? (by-entity [:card archived-card]))))
              (testing "a collection holding only a flagged-empty card is empty"
                (is (= :empty (:finding_type (by-entity [:collection only-empty-card-coll]))))))))))))

;;; --------------------------------------------- checker: dashboards --------------------------------------

(deftest imbalanced-dashboard-crowded-precedence-test
  (testing "dashboard crowding checks dashcards-per-tab first, then tabs; one finding per dashboard; a tabless dashboard is one implicit tab"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab 2
                                         content-diagnostics-crowded-dashboard-threshold-tabs              2
                                         content-diagnostics-sparse-dashboard-threshold-dashcards          2]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             :model/Dashboard {empty-dash :id} {:collection_id coll}
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
             ;; both violations - the dashcards-per-tab check wins (deterministic precedence)
             :model/Dashboard    {both :id} {:collection_id coll}
             :model/DashboardTab {b-t1 :id} {:dashboard_id both}
             :model/DashboardTab _ {:dashboard_id both}
             :model/DashboardTab _ {:dashboard_id both}
             :model/DashboardCard _ {:dashboard_id both :dashboard_tab_id b-t1}
             :model/DashboardCard _ {:dashboard_id both :dashboard_tab_id b-t1}
             :model/DashboardCard _ {:dashboard_id both :dashboard_tab_id b-t1}
             ;; tabless with 2 dashcards: one implicit tab (not 0 tabs), at every bound → no finding
             :model/Dashboard {ok-tabless :id} {:collection_id coll}
             :model/DashboardCard _ {:dashboard_id ok-tabless}
             :model/DashboardCard _ {:dashboard_id ok-tabless}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "0 dashcards → empty (never crowded/sparse), even before any crowding check"
                (let [f (by-entity [:dashboard empty-dash])]
                  (is (= :empty (:finding_type f)))
                  (is (= 0 (:content_count f)))
                  (is (= {:threshold 0 :unit "dashcards"} (:details f)))))
              (testing "3 dashcards on one (implicit) tab > 2 → crowded, unit dashcards"
                (let [f (by-entity [:dashboard slot-crowded])]
                  (is (= :crowded (:finding_type f)))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 2 :unit "dashcards"} (:details f)))))
              (testing "3 tabs > 2 (no tab over the dashcard bound) → crowded, unit tabs"
                (let [f (by-entity [:dashboard tab-crowded])]
                  (is (= :crowded (:finding_type f)))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 2 :unit "tabs"} (:details f)))))
              (testing "both violations → ONE finding, the dashcards-per-tab one"
                (let [f (by-entity [:dashboard both])]
                  (is (= :crowded (:finding_type f)))
                  (is (= "dashcards" (get-in f [:details :unit])))))
              (testing "a tabless dashboard exactly at the bounds → no finding (implicit tab is 1, not 0)"
                (is (nil? (by-entity [:dashboard ok-tabless])))))))))))

(deftest imbalanced-dashboard-sparse-counts-across-tabs-test
  (testing "dashboard sparse counts dashcards across ALL tabs (per-tab counting is crowded-only); empty is never sparse"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-sparse-dashboard-threshold-dashcards 4]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             ;; 3 dashcards on each of 2 tabs = 6 total → NOT sparse (bound is <4 total)
             :model/Dashboard    {two-tabs :id} {:collection_id coll}
             :model/DashboardTab {tt-t1 :id} {:dashboard_id two-tabs}
             :model/DashboardTab {tt-t2 :id} {:dashboard_id two-tabs}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t1}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t1}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t1}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t2}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t2}
             :model/DashboardCard _ {:dashboard_id two-tabs :dashboard_tab_id tt-t2}
             ;; 3 dashcards total < 4 → sparse
             :model/Dashboard {sparse-dash :id} {:collection_id coll}
             :model/DashboardCard _ {:dashboard_id sparse-dash}
             :model/DashboardCard _ {:dashboard_id sparse-dash}
             :model/DashboardCard _ {:dashboard_id sparse-dash}
             ;; exactly at the bound (4) → no finding
             :model/Dashboard {at-dash :id} {:collection_id coll}
             :model/DashboardCard _ {:dashboard_id at-dash}
             :model/DashboardCard _ {:dashboard_id at-dash}
             :model/DashboardCard _ {:dashboard_id at-dash}
             :model/DashboardCard _ {:dashboard_id at-dash}
             ;; truly empty → empty, never sparse
             :model/Dashboard {empty-dash :id} {:collection_id coll}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "6 dashcards across 2 tabs is not sparse - the count spans tabs"
                (is (nil? (by-entity [:dashboard two-tabs]))))
              (testing "3 dashcards < 4 → sparse with the total as content_count"
                (let [f (by-entity [:dashboard sparse-dash])]
                  (is (= :sparse (:finding_type f)))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 4 :unit "dashcards"} (:details f)))))
              (testing "exactly 4 dashcards → no finding (sparse is strictly <)"
                (is (nil? (by-entity [:dashboard at-dash]))))
              (testing "an empty dashboard is empty, never sparse"
                (is (= :empty (:finding_type (by-entity [:dashboard empty-dash]))))))))))))

;;; --------------------------------------------- checker: documents ---------------------------------------

(defn- doc-ast
  "A prose-mirror document AST wrapping `nodes`."
  [& nodes]
  {:type "doc" :content (vec nodes)})

(deftest imbalanced-document-rules-test
  (testing "document empty = no content of ANY kind (fail closed on unknown nodes); crowded = embedded card count"
    (mt/with-premium-features #{:content-diagnostics}
      ;; the sparse-collection bound backs the image-doc collection assertion below
      (mt/with-temporary-setting-values [content-diagnostics-crowded-document-threshold-cards  2
                                         content-diagnostics-sparse-collection-threshold-items 5]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll :id} {}
             :model/Document {empty-doc :id}      {:collection_id coll
                                                   :document (doc-ast {:type "paragraph"})}
             :model/Document {whitespace-doc :id} {:collection_id coll
                                                   :document (doc-ast {:type "paragraph"
                                                                       :content [{:type "text" :text "   \n  "}]})}
             ;; an unknown node type (no image node exists today) must read as content, not silently as empty
             :model/Collection {image-coll :id} {}
             :model/Document {image-doc :id} {:collection_id image-coll
                                              :document (doc-ast {:type "image" :attrs {:src "x.png"}})}
             ;; a reference node's label is content even with no text nodes
             :model/Document {link-doc :id} {:collection_id coll
                                             :document (doc-ast {:type "paragraph"
                                                                 :content [{:type "smartLink"
                                                                            :attrs {:label "Quarterly Report"}}]})}
             ;; 3 card embeds > 2 → crowded; 2 → at the bound, no finding
             :model/Document {crowded-doc :id} {:collection_id coll
                                                :document (apply doc-ast
                                                                 (for [i [101 102 103]]
                                                                   {:type "cardEmbed" :attrs {:id i}}))}
             :model/Document {at-doc :id} {:collection_id coll
                                           :document (apply doc-ast
                                                            (for [i [104 105]]
                                                              {:type "cardEmbed" :attrs {:id i}}))}]
            (let [by-entity (imbalanced-findings-by-entity!)]
              (testing "a document with only structural nodes is empty"
                (let [f (by-entity [:document empty-doc])]
                  (is (= :empty (:finding_type f)))
                  (is (= 0 (:content_count f)))
                  (is (= {:threshold 0 :unit "cards"} (:details f)))))
              (testing "whitespace-only text is not content"
                (is (= :empty (:finding_type (by-entity [:document whitespace-doc])))))
              (testing "an image-only document is NOT empty (fail closed), and its collection is non-empty → sparse"
                (is (nil? (by-entity [:document image-doc])))
                (is (= :sparse (:finding_type (by-entity [:collection image-coll])))))
              (testing "a reference label is content"
                (is (nil? (by-entity [:document link-doc]))))
              (testing "3 embedded cards > 2 → crowded with the count"
                (let [f (by-entity [:document crowded-doc])]
                  (is (= :crowded (:finding_type f)))
                  (is (= 3 (:content_count f)))
                  (is (= {:threshold 2 :unit "cards"} (:details f)))))
              (testing "exactly at the bound → no finding"
                (is (nil? (by-entity [:document at-doc])))))))))))

;;; --------------------------------------------- checker: transforms --------------------------------------

(deftest imbalanced-transform-empty-test
  (testing "transform empty rides the target table's synced estimate: 0 flags, nil (unknown) and missing/inactive targets skip"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [:model/Table {zero-table :id} {:estimated_row_count 0}
           :model/Transform {flagged :id} {:target_table_id zero-table}
           :model/Table {nil-table :id} {}
           :model/Transform {unknown :id} {:target_table_id nil-table}
           :model/Table {inactive-table :id} {:estimated_row_count 0 :active false}
           :model/Transform {dropped :id} {:target_table_id inactive-table}
           :model/Transform {never :id} {}]
          (let [by-entity (imbalanced-findings-by-entity!)]
            (testing "estimate literally 0 on an active target → empty, as_of = the table's sync freshness"
              (let [f (by-entity [:transform flagged])]
                (is (= :empty (:finding_type f)))
                (is (= 0 (:content_count f)))
                (is (= 0 (get-in f [:details :threshold])))
                (is (= "rows" (get-in f [:details :unit])))
                (is (some? (get-in f [:details :as_of])))))
            (testing "nil estimate is unknown, not empty"
              (is (nil? (by-entity [:transform unknown]))))
            (testing "an inactive (dropped) target table is skipped"
              (is (nil? (by-entity [:transform dropped]))))
            (testing "no target table (never run/synced) is skipped"
              (is (nil? (by-entity [:transform never]))))))))))

;;; ------------------------------------------- checker: frozen thresholds ---------------------------------

(deftest imbalanced-threshold-frozen-at-scan-time-test
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

;;; -------------------------------------------------- API -------------------------------------------------

(deftest imbalanced-api-feature-gated-test
  (testing "GET /imbalanced is gated on the :content-diagnostics premium feature"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (testing "licensed → 200 with the paginated envelope"
        (mt/with-premium-features #{:content-diagnostics}
          (let [resp (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/imbalanced")]
            (is (contains? resp :data))
            (is (contains? resp :total)))))
      (testing "unlicensed → 402"
        (mt/with-premium-features #{}
          (mt/user-http-request :rasta :get 402 "ee/content-diagnostics/imbalanced"))))))

(defn- insert-imbalanced!
  "Insert one imbalanced finding row directly (API tests exercise the read path, not the checker)."
  [{:keys [entity-type entity-id name finding-type content-count details]
    :or   {details {:threshold 5 :unit "items"}}}]
  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                   {:scan_id       "imb-api"
                                    :entity_type   entity-type
                                    :entity_id     entity-id
                                    :entity_name   name
                                    :finding_type  finding-type
                                    :content_count content-count
                                    :details       details})))

(deftest imbalanced-api-finding-types-and-count-bounds-test
  (testing "GET /imbalanced narrows by finding-types (default all three) and min-/max-content-count (inclusive)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c1 :id} {:collection_id coll}
                         :model/Card {c2 :id} {:collection_id coll}
                         :model/Dashboard {d1 :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix      (scope-prefix)
                  empty-fid   (insert-imbalanced! {:entity-type :card :entity-id c1
                                                   :name (str prefix " Empty") :finding-type :empty
                                                   :content-count 0})
                  sparse-fid  (insert-imbalanced! {:entity-type :dashboard :entity-id d1
                                                   :name (str prefix " Sparse") :finding-type :sparse
                                                   :content-count 2})
                  crowded-fid (insert-imbalanced! {:entity-type :card :entity-id c2
                                                   :name (str prefix " Crowded") :finding-type :crowded
                                                   :content-count 30})
                  ids         (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                      "ee/content-diagnostics/imbalanced"
                                                                      :query prefix kvs)))))]
              (testing "omitted → all three finding types"
                (is (= #{empty-fid sparse-fid crowded-fid} (ids))))
              (testing "one type"
                (is (= #{empty-fid} (ids :finding-types "empty"))))
              (testing "two types"
                (is (= #{sparse-fid crowded-fid} (ids :finding-types ["sparse" "crowded"]))))
              (testing "min-content-count is an inclusive floor"
                (is (= #{sparse-fid crowded-fid} (ids :min-content-count "2")))
                (is (= #{crowded-fid} (ids :min-content-count "3"))))
              (testing "max-content-count is an inclusive ceiling"
                (is (= #{empty-fid sparse-fid} (ids :max-content-count "2")))
                (is (= #{empty-fid} (ids :max-content-count "0"))))
              (testing "floor + ceiling compose"
                (is (= #{sparse-fid} (ids :min-content-count "1" :max-content-count "5")))))))))))

(deftest imbalanced-api-entity-types-filter-test
  (testing "GET /imbalanced filters by entity-types, including the collection subject"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {card-id :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix   (scope-prefix)
                  card-fid (insert-imbalanced! {:entity-type :card :entity-id card-id
                                                :name (str prefix " Card") :finding-type :empty
                                                :content-count 0})
                  coll-fid (insert-imbalanced! {:entity-type :collection :entity-id coll
                                                :name (str prefix " Coll") :finding-type :sparse
                                                :content-count 1})
                  ids      (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                   "ee/content-diagnostics/imbalanced"
                                                                   :query prefix kvs)))))]
              (testing "omitted → all entity types"
                (is (= #{card-fid coll-fid} (ids))))
              (testing "collection only"
                (is (= #{coll-fid} (ids :entity-types "collection"))))
              (testing "multiple values"
                (is (= #{card-fid coll-fid} (ids :entity-types ["card" "collection"])))))))))))

(deftest imbalanced-api-sort-test
  (testing "GET /imbalanced sorts by content-count and name, both directions"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c1 :id} {:collection_id coll}
                         :model/Card {c2 :id} {:collection_id coll}
                         :model/Card {c3 :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix (scope-prefix)
                  a-fid  (insert-imbalanced! {:entity-type :card :entity-id c1 :finding-type :sparse
                                              :name (str prefix " Alpha") :content-count 20})
                  b-fid  (insert-imbalanced! {:entity-type :card :entity-id c2 :finding-type :sparse
                                              :name (str prefix " Beta") :content-count 5})
                  g-fid  (insert-imbalanced! {:entity-type :card :entity-id c3 :finding-type :sparse
                                              :name (str prefix " Gamma") :content-count 10})
                  order  (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                             "ee/content-diagnostics/imbalanced"
                                                             :query prefix kvs))))]
              (testing "content-count asc/desc (isolated from the name order)"
                (is (= [b-fid g-fid a-fid] (order :sort-column "content-count" :sort-direction "asc")))
                (is (= [a-fid g-fid b-fid] (order :sort-column "content-count" :sort-direction "desc"))))
              (testing "name asc/desc"
                (is (= [a-fid b-fid g-fid] (order :sort-column "name" :sort-direction "asc")))
                (is (= [g-fid b-fid a-fid] (order :sort-column "name" :sort-direction "desc")))))))))))

(deftest imbalanced-api-paginates-test
  (testing "GET /imbalanced honors limit/offset and reports the full valid total"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c1 :id} {:collection_id coll}
                         :model/Card {c2 :id} {:collection_id coll}
                         :model/Card {c3 :id} {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix (scope-prefix)]
              (doseq [cid [c1 c2 c3]]
                (insert-imbalanced! {:entity-type :card :entity-id cid :finding-type :empty
                                     :name (str prefix "-" cid) :content-count 0}))
              (let [page (fn [limit offset]
                           (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/imbalanced"
                                                 :query prefix :limit limit :offset offset))]
                (testing "limit caps the page; total reflects the full valid set; limit/offset echoed back"
                  (let [r (page 2 0)]
                    (is (= 2 (count (:data r))))
                    (is (= 3 (:total r)))
                    (is (= 2 (:limit r)))
                    (is (= 0 (:offset r)))))
                (testing "offset advances to the remainder"
                  (is (= 1 (count (:data (page 2 2))))))))))))))

(deftest imbalanced-api-does-not-leak-across-finding-types-test
  (testing "imbalanced rows never surface in /stale or /slow, and their rows never surface in /imbalanced"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll :id} {}
                         :model/Card {c-stale :id} {:collection_id coll}
                         :model/Card {c-slow :id}  {:collection_id coll}
                         :model/Card {c-imb :id}   {:collection_id coll}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll)
            (let [prefix    (scope-prefix)
                  stale-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id c-stale
                                                              :entity_name (str prefix "-stale")
                                                              :finding_type :stale :details {:threshold_days 90}}))
                  slow-fid  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id c-slow
                                                              :entity_name (str prefix "-slow")
                                                              :finding_type :slow :duration_ms 20000
                                                              :details {:threshold_ms 15000}}))
                  imb-fid   (insert-imbalanced! {:entity-type :card :entity-id c-imb :finding-type :empty
                                                 :name (str prefix "-imb") :content-count 0})
                  ids       (fn [path] (set (map :id (:data (mt/user-http-request :rasta :get 200 path
                                                                                  :query prefix)))))]
              (testing "/imbalanced returns only the imbalanced finding"
                (is (= #{imb-fid} (ids "ee/content-diagnostics/imbalanced"))))
              (testing "/stale returns only the stale finding"
                (is (= #{stale-fid} (ids "ee/content-diagnostics/stale"))))
              (testing "/slow returns only the slow finding"
                (is (= #{slow-fid} (ids "ee/content-diagnostics/slow")))))))))))

(deftest imbalanced-api-collection-subject-permissions-test
  (testing "a collection finding is served only when the caller can read the collection ITSELF"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {readable :id}   {}
                         :model/Collection {unreadable :id} {}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
            (let [prefix  (scope-prefix)
                  r-fid   (insert-imbalanced! {:entity-type :collection :entity-id readable
                                               :name (str prefix " Readable")
                                               :finding-type :sparse :content-count 1})
                  u-fid   (insert-imbalanced! {:entity-type :collection :entity-id unreadable
                                               :name (str prefix " Unreadable")
                                               :finding-type :sparse :content-count 1})
                  ids-for (fn [user] (set (map :id (:data (mt/user-http-request
                                                           user :get 200 "ee/content-diagnostics/imbalanced"
                                                           :query prefix)))))]
              (testing "non-admin sees only the readable collection's finding"
                (let [ids (ids-for :rasta)]
                  (is (contains? ids r-fid))
                  (is (not (contains? ids u-fid)))))
              (testing "superuser sees both"
                (let [ids (ids-for :crowberto)]
                  (is (contains? ids r-fid))
                  (is (contains? ids u-fid)))))))))))

(deftest imbalanced-api-personal-collection-subject-test
  (testing "a personal collection's own finding is excluded by default, returned with include-personal-collections=true, and hydrates owner (not creator)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [pers-id (:id (collection/user->personal-collection (mt/user->id :rasta)))
                prefix  (scope-prefix)
                fid     (insert-imbalanced! {:entity-type :collection :entity-id pers-id
                                             :name (str prefix " Personal") :finding-type :sparse
                                             :content-count 1})
                fetch   (fn [& kvs] (apply mt/user-http-request :rasta :get 200
                                           "ee/content-diagnostics/imbalanced" :query prefix kvs))]
            (testing "default (param omitted) → the personal collection's finding is excluded"
              (is (empty? (:data (fetch))))
              (is (zero? (:total (fetch)))))
            (testing "include-personal-collections=true → returned (bounded by visibility - it is rasta's own)"
              (let [row (first (filter #(= fid (:id %)) (:data (fetch :include-personal-collections true))))]
                (is (some? row))
                (testing "owner = the owning user; creator stays null (collections have no creator)"
                  (is (=? {:id   (mt/user->id :rasta)
                           :type "user"}
                          (get-in row [:details :owner])))
                  (is (nil? (get-in row [:details :creator]))))
                (testing "a root-level personal collection has no parent → breadcrumb null"
                  (is (nil? (get-in row [:details :collection]))))))))))))

(deftest imbalanced-api-collection-breadcrumb-is-parent-test
  (testing "a collection finding's breadcrumb is its PARENT collection; null at root; content_count stays top-level"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {parent :id} {:name "Parent Coll"}
                         :model/Collection {child :id}  {:location (collection/location-path parent)}
                         :model/Collection {rooted :id} {}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) parent)
            (let [prefix     (scope-prefix)
                  child-fid  (insert-imbalanced! {:entity-type :collection :entity-id child
                                                  :name (str prefix " Child") :finding-type :sparse
                                                  :content-count 2})
                  rooted-fid (insert-imbalanced! {:entity-type :collection :entity-id rooted
                                                  :name (str prefix " Rooted") :finding-type :sparse
                                                  :content-count 2})
                  rows       (:data (mt/user-http-request :crowberto :get 200
                                                          "ee/content-diagnostics/imbalanced" :query prefix))
                  row-for    (fn [fid] (first (filter #(= fid (:id %)) rows)))]
              (testing "nested collection → the parent's breadcrumb"
                (let [row (row-for child-fid)]
                  (is (= parent (get-in row [:details :collection :id])))
                  (is (= "Parent Coll" (get-in row [:details :collection :name])))))
              (testing "root-level collection → collection null"
                (is (nil? (get-in (row-for rooted-fid) [:details :collection]))))
              (testing "content_count is hoisted top-level, never duplicated inside details"
                (let [row (row-for child-fid)]
                  (is (= 2 (:content_count row)))
                  (is (not (contains? (:details row) :content_count))))))))))))

(deftest imbalanced-api-unreadable-parent-breadcrumb-test
  (testing "a readable collection under an unreadable parent serves its finding with a null breadcrumb - the parent's name never leaks"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {hidden-parent :id} {:name "Hidden Parent"}
                         :model/Collection {child :id} {:location (collection/location-path hidden-parent)}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) child)
            (let [prefix  (scope-prefix)
                  fid     (insert-imbalanced! {:entity-type :collection :entity-id child
                                               :name (str prefix " Child") :finding-type :sparse
                                               :content-count 1})
                  row-for (fn [user]
                            (->> (mt/user-http-request user :get 200
                                                       "ee/content-diagnostics/imbalanced" :query prefix)
                                 :data
                                 (filter #(= fid (:id %)))
                                 first))]
              (testing "the finding itself is served - the subject collection is readable"
                (is (some? (row-for :rasta))))
              (testing "the unreadable parent degrades to a null breadcrumb, same as root"
                (is (nil? (get-in (row-for :rasta) [:details :collection]))))
              (testing "an admin still gets the parent breadcrumb"
                (is (= hidden-parent (get-in (row-for :crowberto) [:details :collection :id])))))))))))

(deftest imbalanced-scan-shares-batch-and-supersedes-per-type-test
  (testing "one scan writes stale + imbalanced in a single scan_id batch; a rescan supersedes a resolved sparse finding while the still-stale entity stays active"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll :id} {}
                       :model/Card {stale-card :id} {:collection_id coll
                                                     :last_used_at (t/minus (t/offset-date-time) (t/days 400))}]
          (let [scan-1     (:scan_id (scan/scan!))
                sparse-row (t2/select-one :model/ContentDiagnosticsFinding
                                          :entity_type :collection :entity_id coll :finding_type :sparse)
                stale-row  (t2/select-one :model/ContentDiagnosticsFinding
                                          :entity_type :card :entity_id stale-card :finding_type :stale)]
            (testing "the collection's sparse finding and the card's stale finding share one scan_id batch"
              (is (some? sparse-row))
              (is (some? stale-row))
              (is (= scan-1 (:scan_id sparse-row) (:scan_id stale-row))))
            ;; resolve the sparseness by lowering the bound (1 item is no longer < 1); the card stays stale
            (mt/with-temporary-setting-values [content-diagnostics-sparse-collection-threshold-items 1]
              (scan/scan!))
            (testing "the resolved sparse finding is soft-invalidated"
              (is (some? (:invalidated_at (t2/select-one :model/ContentDiagnosticsFinding
                                                         :id (:id sparse-row))))))
            (testing "the still-stale entity keeps an active stale finding (per-type supersession)"
              (is (seq (t2/select :model/ContentDiagnosticsFinding
                                  :entity_type :card :entity_id stale-card
                                  :finding_type :stale :invalidated_at nil))))))))))
