(ns metabase-enterprise.content-diagnostics.checkers.imbalanced.empty-test
  "The `empty` imbalanced checker: content with nothing in it, across collection (0 direct items),
  card (last clean-run signal), dashboard (0 dashcards), document (no content, fail-closed), and
  transform (0-row synced estimate). Asserts only `:empty` findings; the cross-type co-occurrence that
  independent checkers now allow is covered in the imbalanced integration suite."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.collections.models.collection :as collection]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- empty-by-entity!
  "Run a scan and index its `:empty` findings by `[entity-type entity-id]` (the empty checker emits at
  most one per entity, so the key is unique)."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (t2/select-fn->fn (juxt :entity_type :entity_id) identity
                      :model/ContentDiagnosticsFinding
                      :scan_id scan-id :finding_type :empty)))

;;; ---------------------------------------------------- collections ----------------------------------------

(deftest empty-collection-test
  (testing "a collection with no direct items is empty; archived members never count; a collection with an item is not"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [:model/Collection {empty-coll :id} {}
           ;; only an archived card - archived members don't count, so it IS empty
           :model/Collection {arch-coll :id} {}
           :model/Card _ {:collection_id arch-coll :archived true}
           ;; one direct item - not empty
           :model/Collection {full-coll :id} {}
           :model/Card _ {:collection_id full-coll}]
          (let [by-entity (empty-by-entity!)]
            (testing "0 items → empty, content_count 0, implicit threshold 0 frozen with the unit"
              (let [f (by-entity [:collection empty-coll])]
                (is (some? f))
                (is (= 0 (:content_count f)))
                (is (= {:threshold 0 :unit "items"} (:details f)))))
            (testing "a collection holding only an archived card is empty"
              (is (some? (by-entity [:collection arch-coll]))))
            (testing "a collection holding a real item is not empty"
              (is (nil? (by-entity [:collection full-coll]))))))))))

(deftest empty-collection-direct-count-test
  (testing "collection emptiness is the direct-item count alone - item verdicts and depth never cascade"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [;; a chain whose only leaf is an empty dashboard - every level holds one direct item
           ;; (the child collection, or the dashboard), so no level is empty
           :model/Collection {gp :id} {}
           :model/Collection {p :id}  {:location (collection/location-path gp)}
           :model/Collection {c :id}  {:location (collection/location-path gp p)}
           :model/Dashboard  {empty-dash :id} {:collection_id c}
           ;; the same chain shape ending in a card - likewise no level is empty
           :model/Collection {gp2 :id} {}
           :model/Collection {p2 :id}  {:location (collection/location-path gp2)}
           :model/Collection {c2 :id}  {:location (collection/location-path gp2 p2)}
           :model/Card _ {:collection_id c2}
           ;; 3 empty dashboards + 1 never-run card = 4 direct items - not empty
           :model/Collection {mixed :id} {}
           :model/Dashboard _ {:collection_id mixed}
           :model/Dashboard _ {:collection_id mixed}
           :model/Dashboard _ {:collection_id mixed}
           :model/Card _ {:collection_id mixed}]
          (let [by-entity (empty-by-entity!)]
            (testing "the empty dashboard is flagged, but no ancestor is - its emptiness never cascades"
              (is (some? (by-entity [:dashboard empty-dash])))
              (doseq [coll-id [gp p c]]
                (is (nil? (by-entity [:collection coll-id])) (str "collection " coll-id))))
            (testing "the card-ended chain is likewise empty-free at every level"
              (doseq [coll-id [gp2 p2 c2]]
                (is (nil? (by-entity [:collection coll-id])) (str "collection " coll-id))))
            (testing "empty items still count as direct items"
              (is (nil? (by-entity [:collection mixed]))))))))))

(deftest empty-excluded-collection-subjects-test
  (testing "trash, snippet-namespace, archived, and instance-analytics collections are never empty subjects"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {snippet-coll :id}  {:namespace "snippets"}
                       :model/Collection {archived-coll :id} {:archived true}
                       :model/Collection {ia-coll :id}       {:type "instance-analytics"}]
          (let [by-entity (empty-by-entity!)]
            (doseq [[label coll-id] {"snippet-namespace"  snippet-coll
                                     "archived"           archived-coll
                                     "instance-analytics" ia-coll
                                     "trash"              (collection/trash-collection-id)}]
              (testing (str label " collection produces no finding")
                (is (nil? (by-entity [:collection coll-id])))))))))))

(deftest empty-item-container-scoping-test
  (testing "empty items inside ineligible containers produce no item findings; root-resident ones still do"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [now (t/offset-date-time)]
          (mt/with-temp
            [:model/Collection {sample-coll :id} {:is_sample true}
             :model/Collection {ia-coll :id}     {:namespace "analytics"
                                                  :type      collection/instance-analytics-collection-type}
             ;; dashcard-less dashboards - empty on their own merits, but in ineligible containers
             :model/Dashboard {sample-dash :id} {:collection_id sample-coll}
             :model/Dashboard {ia-dash :id}     {:collection_id ia-coll}
             ;; a sample-resident card whose latest clean run returned 0 rows - the card probe must skip it
             :model/Card {sample-card :id} {:collection_id sample-coll}
             :model/QueryExecution _ {:card_id sample-card :started_at now
                                      :parameterized false :cache_hit false :result_rows 0}
             ;; root-resident empty dashboard: the root is always an eligible container
             :model/Dashboard {root-dash :id} {}]
            (let [by-entity (empty-by-entity!)]
              (doseq [[label entity-key] {"sample-resident dashboard" [:dashboard sample-dash]
                                          "audit-resident dashboard"  [:dashboard ia-dash]
                                          "sample-resident card"      [:card sample-card]}]
                (is (nil? (by-entity entity-key)) label))
              (is (some? (by-entity [:dashboard root-dash]))))))))))

;;; ------------------------------------------------------- cards --------------------------------------------

(deftest empty-card-test
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
             ;; a collection holding only a flagged-empty card: one direct item, so the collection is
             ;; not empty - the card's own finding is the signal
             :model/Collection {only-empty-card-coll :id} {}
             :model/Card {c0 :id} {:collection_id only-empty-card-coll}
             :model/QueryExecution _ {:card_id c0 :started_at (ago 5)
                                      :parameterized false :cache_hit false :result_rows 0}]
            (let [by-entity (empty-by-entity!)]
              (testing "flagged on the deciding run, as_of frozen to that run's start"
                (let [f (by-entity [:card flagged])]
                  (is (some? f))
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
              (testing "a collection holding only a flagged-empty card is not empty - the card carries the finding"
                (is (some? (by-entity [:card c0])))
                (is (nil? (by-entity [:collection only-empty-card-coll])))))))))))

;;; ----------------------------------------------------- dashboards -----------------------------------------

(deftest empty-dashboard-test
  (testing "a dashboard with 0 dashcards is empty (a tabless one and an all-empty-tabs one both qualify); one with a dashcard is not"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [:model/Collection {coll :id} {}
           :model/Dashboard {tabless-empty :id} {:collection_id coll}
           ;; 3 tabs, none holding a dashcard → still 0 dashcards → empty
           :model/Dashboard    {tabs-empty :id} {:collection_id coll}
           :model/DashboardTab _ {:dashboard_id tabs-empty}
           :model/DashboardTab _ {:dashboard_id tabs-empty}
           :model/DashboardTab _ {:dashboard_id tabs-empty}
           ;; has a dashcard → not empty
           :model/Dashboard {has-card :id} {:collection_id coll}
           :model/DashboardCard _ {:dashboard_id has-card}]
          (let [by-entity (empty-by-entity!)]
            (testing "tabless with 0 dashcards → empty, threshold 0 with the dashcards unit"
              (let [f (by-entity [:dashboard tabless-empty])]
                (is (some? f))
                (is (= 0 (:content_count f)))
                (is (= {:threshold 0 :unit "dashcards"} (:details f)))))
            (testing "tabs present but no dashcards → still empty"
              (is (some? (by-entity [:dashboard tabs-empty]))))
            (testing "a dashboard with a dashcard is not empty"
              (is (nil? (by-entity [:dashboard has-card]))))))))))

;;; ------------------------------------------------------ documents -----------------------------------------

(defn- doc-ast
  "A prose-mirror document AST wrapping `nodes`."
  [& nodes]
  {:type "doc" :content (vec nodes)})

(deftest empty-document-test
  (testing "document empty = no content of ANY kind (fail closed on unknown nodes; a reference label is content)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [:model/Collection {coll :id} {}
           :model/Document {empty-doc :id}      {:collection_id coll
                                                 :document (doc-ast {:type "paragraph"})}
           :model/Document {whitespace-doc :id} {:collection_id coll
                                                 :document (doc-ast {:type "paragraph"
                                                                     :content [{:type "text" :text "   \n  "}]})}
           ;; an unknown node type (no image node exists today) must read as content, not silently as empty
           :model/Document {image-doc :id} {:collection_id coll
                                            :document (doc-ast {:type "image" :attrs {:src "x.png"}})}
           ;; a reference node's label is content even with no text nodes
           :model/Document {link-doc :id} {:collection_id coll
                                           :document (doc-ast {:type "paragraph"
                                                               :content [{:type "smartLink"
                                                                          :attrs {:label "Quarterly Report"}}]})}]
          (let [by-entity (empty-by-entity!)]
            (testing "a document with only structural nodes is empty"
              (let [f (by-entity [:document empty-doc])]
                (is (some? f))
                (is (= 0 (:content_count f)))
                (is (= {:threshold 0 :unit "cards"} (:details f)))))
            (testing "whitespace-only text is not content"
              (is (some? (by-entity [:document whitespace-doc]))))
            (testing "an image-only document is NOT empty (fail closed)"
              (is (nil? (by-entity [:document image-doc]))))
            (testing "a reference label is content"
              (is (nil? (by-entity [:document link-doc]))))))))))

;;; ----------------------------------------------------- transforms -----------------------------------------

(deftest empty-transform-folder-test
  (testing "transform folders count their transforms as direct items - only an item-less one reads empty"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [;; a folder whose only transform has never run (nil estimate) - one item, not empty
           :model/Collection {live-folder :id} {:namespace "transforms"}
           :model/Transform _ {:collection_id live-folder}
           ;; a folder holding only an estimate-0 transform - still one direct item, so not empty
           :model/Collection {dead-folder :id} {:namespace "transforms"}
           :model/Table {zero-table :id} {:estimated_row_count 0}
           :model/Transform {dead-transform :id} {:collection_id dead-folder
                                                  :target_table_id zero-table}
           ;; a transforms folder with nothing in it at all - empty
           :model/Collection {bare-folder :id} {:namespace "transforms"}
           ;; an ARCHIVED folder holding an estimate-0 transform - the folder is no subject, but the
           ;; transform still executes regardless of its folder's state, so its own finding survives
           :model/Collection {archived-folder :id} {:namespace "transforms" :archived true}
           :model/Table {zero-table-2 :id} {:estimated_row_count 0}
           :model/Transform {shelved-transform :id} {:collection_id archived-folder
                                                     :target_table_id zero-table-2}]
          (let [by-entity (empty-by-entity!)]
            (testing "a folder holding a never-run transform is not empty"
              (is (nil? (by-entity [:collection live-folder]))))
            (testing "a folder of only empty transforms is not empty - the transform carries the finding"
              (is (nil? (by-entity [:collection dead-folder])))
              (is (some? (by-entity [:transform dead-transform]))))
            (testing "an item-less transforms folder is empty"
              (is (some? (by-entity [:collection bare-folder]))))
            (testing "an archived folder is no subject, but its transform's own finding survives"
              (is (nil? (by-entity [:collection archived-folder])))
              (is (some? (by-entity [:transform shelved-transform]))))))))))

(deftest empty-transform-test
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
          (let [by-entity (empty-by-entity!)]
            (testing "estimate literally 0 on an active target → empty, as_of = the table's sync freshness"
              (let [f (by-entity [:transform flagged])]
                (is (some? f))
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
