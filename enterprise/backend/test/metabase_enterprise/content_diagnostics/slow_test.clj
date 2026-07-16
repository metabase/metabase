(ns metabase-enterprise.content-diagnostics.slow-test
  "The `slow` checker flags card/transform leaves (over a duration threshold) and dashboard/document
  containers that embed a slow card, stamping the measured magnitude in the top-level `duration_ms`
  column and freezing `threshold_ms` (leaf only) in `details` at scan time. The `/slow` endpoint serves
  them with leaf-vs-container `details`, hydrated roll-up culprits, and the shared filter/sort/pagination
  envelope."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.checkers.slow :as checkers.slow]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.prose-mirror :as prose-mirror]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- scope-prefix
  "Unique per-test entity-name prefix, passed as `:query` so assertions only see rows the test seeded -
  the findings table is shared across tests."
  []
  (str "cd-" (mt/random-name)))

(defn- slow-findings-by-entity!
  "Run a scan and index its `:slow` findings by `[entity-type entity-id]`."
  []
  (let [scan-id (:scan_id (scan/scan!))]
    (t2/select-fn->fn (juxt :entity_type :entity_id) identity
                      :model/ContentDiagnosticsFinding :scan_id scan-id :finding_type :slow)))

;;; --------------------------------------------- checker --------------------------------------------------

(deftest slow-checker-detects-leaves-and-containers-test
  (testing "card/transform leaves and dashboard/document container roll-ups are flagged; fast/archived ones are not"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds      10
                                         content-diagnostics-slow-transform-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [now (t/offset-date-time)]
            (mt/with-temp
              [:model/Collection {coll-id :id} {}
               ;; slow card: median running_time 30s > 10s threshold (cache hits are ignored)
               :model/Card           {slow-card :id} {:collection_id coll-id :name "Full Orders Export"}
               :model/QueryExecution _ {:card_id slow-card :started_at now
                                        :cache_hit false :running_time 30000}
               ;; a cache hit at a huge time must NOT count toward the median (it would shift it to 65s)
               :model/QueryExecution _ {:card_id slow-card :started_at now
                                        :cache_hit true :running_time 99999}
               ;; fast card: 500ms < 10s - never flagged, and never a culprit
               :model/Card           {fast-card :id} {:collection_id coll-id :name "Quick Lookup"}
               :model/QueryExecution _ {:card_id fast-card :started_at now
                                        :cache_hit false :running_time 500}
               ;; archived card whose median IS slow - must be excluded (not flagged, not a culprit)
               :model/Card           {archived-card :id} {:collection_id coll-id :archived true}
               :model/QueryExecution _ {:card_id archived-card :started_at now
                                        :cache_hit false :running_time 40000}
               ;; container roll-ups: a dashboard and a document embedding the slow card
               :model/Dashboard      {dash-id :id}  {:collection_id coll-id}
               :model/DashboardCard  _ {:dashboard_id dash-id :card_id slow-card}
               ;; the same slow card on a second tab must dedupe to one culprit id
               :model/DashboardCard  _ {:dashboard_id dash-id :card_id slow-card}
               :model/DashboardCard  _ {:dashboard_id dash-id :card_id fast-card}
               :model/Document       {doc-id :id}   {:collection_id coll-id
                                                     :creator_id    (mt/user->id :rasta)
                                                     :content_type  prose-mirror/prose-mirror-content-type
                                                     :document      {:type "doc"
                                                                     :content [{:type "cardEmbed"
                                                                                :attrs {:id slow-card}}]}}
               ;; a dashboard with only the fast card must NOT be flagged
               :model/Dashboard      {fast-dash :id} {:collection_id coll-id}
               :model/DashboardCard  _ {:dashboard_id fast-dash :card_id fast-card}
               ;; an archived dashboard embedding the slow card must NOT be flagged
               :model/Dashboard      {archived-dash :id} {:collection_id coll-id :archived true}
               :model/DashboardCard  _ {:dashboard_id archived-dash :card_id slow-card}
               ;; transform leaves: one slow succeeded run (60s), one fast (1s)
               :model/Transform      {slow-xform :id} {}
               :model/TransformRun   _ {:transform_id slow-xform :status :succeeded
                                        :start_time (t/minus now (t/minutes 2))
                                        :end_time   (t/minus now (t/minutes 1))}
               :model/Transform      {fast-xform :id} {}
               :model/TransformRun   _ {:transform_id fast-xform :status :succeeded
                                        :start_time (t/minus now (t/seconds 61))
                                        :end_time   (t/minus now (t/seconds 60))}]
              (let [by-entity (slow-findings-by-entity!)]
                (testing "slow card leaf: measured median in top-level duration_ms; threshold frozen in details"
                  (let [f (by-entity [:card slow-card])]
                    (is (some? f))
                    (is (= 30000 (:duration_ms f)))
                    (is (= 10000 (get-in f [:details :threshold_ms])))
                    (testing "leaf details holds ONLY the threshold"
                      (is (= #{:threshold_ms} (set (keys (:details f))))))))
                (testing "fast card is not flagged"
                  (is (nil? (by-entity [:card fast-card]))))
                (testing "archived card is not flagged even though its median is slow"
                  (is (nil? (by-entity [:card archived-card]))))
                (testing "slow transform leaf: 60s duration over the 10s threshold, both frozen in ms"
                  (let [f (by-entity [:transform slow-xform])]
                    (is (some? f))
                    (is (= 60000 (:duration_ms f)))
                    (is (= 10000 (get-in f [:details :threshold_ms])))))
                (testing "fast transform is not flagged"
                  (is (nil? (by-entity [:transform fast-xform]))))
                (testing "dashboard container: dedupes the twice-embedded slow card, stamps representative duration"
                  (let [f (by-entity [:dashboard dash-id])]
                    (is (some? f))
                    (is (= [slow-card] (get-in f [:details :slow_entity_ids])))
                    (is (= 30000 (:duration_ms f)))))
                (testing "dashboard with only fast cards is not flagged"
                  (is (nil? (by-entity [:dashboard fast-dash]))))
                (testing "archived dashboard is not flagged"
                  (is (nil? (by-entity [:dashboard archived-dash]))))
                (testing "document container rolls up the embedded slow card with its representative duration"
                  (let [f (by-entity [:document doc-id])]
                    (is (some? f))
                    (is (= [slow-card] (get-in f [:details :slow_entity_ids])))
                    (is (= 30000 (:duration_ms f)))))))))))))

(deftest slow-checker-threshold-boundary-test
  (testing "the measured duration must strictly exceed the threshold (boundary is exclusive) for both leaf types"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds      10
                                         content-diagnostics-slow-transform-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [now (t/offset-date-time)]
            (mt/with-temp [:model/Collection {coll-id :id} {}
                           :model/Card {at-card :id} {:collection_id coll-id}
                           :model/QueryExecution _ {:card_id at-card :started_at now
                                                    :cache_hit false :running_time 10000}
                           :model/Card {over-card :id} {:collection_id coll-id}
                           :model/QueryExecution _ {:card_id over-card :started_at now
                                                    :cache_hit false :running_time 10001}
                           :model/Transform    {at-xform :id} {}
                           :model/TransformRun _ {:transform_id at-xform :status :succeeded
                                                  :start_time (t/minus now (t/seconds 10))
                                                  :end_time   now}
                           :model/Transform    {over-xform :id} {}
                           :model/TransformRun _ {:transform_id over-xform :status :succeeded
                                                  :start_time (t/minus now (t/seconds 11))
                                                  :end_time   now}]
              (let [by-entity (slow-findings-by-entity!)]
                (testing "card exactly at the threshold (10000ms) → not flagged"
                  (is (nil? (by-entity [:card at-card]))))
                (testing "card just over the threshold (10001ms) → flagged"
                  (is (some? (by-entity [:card over-card]))))
                (testing "transform run exactly at the threshold (10s) → not flagged"
                  (is (nil? (by-entity [:transform at-xform]))))
                (testing "transform run over the threshold (11s) → flagged"
                  (is (some? (by-entity [:transform over-xform]))))))))))))

(deftest slow-container-duration-is-slowest-culprit-test
  (testing "a container's duration_ms is the slowest culprit card's median"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c20 :id} {:collection_id coll-id}
                         :model/QueryExecution _ {:card_id c20 :started_at (t/offset-date-time)
                                                  :cache_hit false :running_time 20000}
                         :model/Card {c40 :id} {:collection_id coll-id}
                         :model/QueryExecution _ {:card_id c40 :started_at (t/offset-date-time)
                                                  :cache_hit false :running_time 40000}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id}
                         :model/DashboardCard _ {:dashboard_id dash-id :card_id c20}
                         :model/DashboardCard _ {:dashboard_id dash-id :card_id c40}]
            (let [f (get (slow-findings-by-entity!) [:dashboard dash-id])]
              (is (some? f))
              (testing "duration_ms is the slowest culprit's median (40s), not the fastest or a sum"
                (is (= 40000 (:duration_ms f))))
              (is (= #{c20 c40} (set (get-in f [:details :slow_entity_ids])))))))))))

(deftest slow-dashboard-covers-series-not-filter-source-test
  (testing "a dashboard is flagged for a combined-series slow card (renders on load) but NOT for a filter card value-source (fetched on demand, cached, a different limited query)"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll-id :id} {}
             :model/Card           {slow-card :id} {:collection_id coll-id :name "Slow One"}
             :model/QueryExecution _ {:card_id slow-card :started_at (t/offset-date-time)
                                      :cache_hit false :running_time 30000}
             ;; a fast primary card, so each dashboard's ONLY slow reference is the non-primary one
             :model/Card           {fast-card :id} {:collection_id coll-id}
             :model/QueryExecution _ {:card_id fast-card :started_at (t/offset-date-time)
                                      :cache_hit false :running_time 500}
             ;; dashboard S: the slow card is a combined SERIES on a dashcard whose primary card is fast
             :model/Dashboard      {series-dash :id} {:collection_id coll-id}
             :model/DashboardCard  {series-dc :id}   {:dashboard_id series-dash :card_id fast-card}
             :model/DashboardCardSeries _ {:dashboardcard_id series-dc :card_id slow-card :position 0}
             ;; dashboard F: the slow card is ONLY a filter's card value-source (no dashcards at all).
             ;; The dropdown query is on-demand + cached + a different limited distinct-values query, so
             ;; this must NOT be attributed to the dashboard's render-time slowness.
             :model/Dashboard      {filter-dash :id} {:collection_id coll-id}
             :model/ParameterCard  _ {:parameterized_object_type "dashboard"
                                      :parameterized_object_id   filter-dash
                                      :parameter_id              "p1"
                                      :card_id                   slow-card}]
            (let [by-entity (slow-findings-by-entity!)]
              (testing "a slow SERIES card flags the dashboard, with the series card as the culprit"
                (let [f (by-entity [:dashboard series-dash])]
                  (is (some? f))
                  (is (= [slow-card] (get-in f [:details :slow_entity_ids])))))
              (testing "a dashboard whose only slow reference is a filter card value-source is NOT flagged"
                (is (nil? (by-entity [:dashboard filter-dash])))))))))))

(deftest slow-transform-uses-latest-finished-run-test
  (testing "transform slowness uses the latest FINISHED (succeeded/failed/timeout) run; never-run yields nothing"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-transform-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [now      (t/offset-date-time)
                days-ago #(t/minus now (t/days %))]
            (mt/with-temp
              [;; the latest finished run is the newer FAILED one (5m) - failed runs finished, so they count
               :model/Transform    {failing-latest :id} {}
               :model/TransformRun _ {:transform_id failing-latest :status :succeeded
                                      :start_time (days-ago 9)
                                      :end_time   (t/plus (days-ago 9) (t/minutes 1))}
               :model/TransformRun _ {:transform_id failing-latest :status :failed
                                      :start_time (days-ago 8)
                                      :end_time   (t/plus (days-ago 8) (t/minutes 5))}
               ;; latest finished run is fast (1s) even though an older succeeded run was slow (60s)
               :model/Transform    {recovered :id} {}
               :model/TransformRun _ {:transform_id recovered :status :succeeded
                                      :start_time (days-ago 10)
                                      :end_time   (t/plus (days-ago 10) (t/minutes 1))}
               :model/TransformRun _ {:transform_id recovered :status :succeeded
                                      :start_time (days-ago 7)
                                      :end_time   (t/plus (days-ago 7) (t/seconds 1))}
               ;; a slow CANCELED run doesn't count as finished - the fast succeeded run before it wins
               :model/Transform    {canceled-latest :id} {}
               :model/TransformRun _ {:transform_id canceled-latest :status :succeeded
                                      :start_time (days-ago 6)
                                      :end_time   (t/plus (days-ago 6) (t/seconds 1))}
               :model/TransformRun _ {:transform_id canceled-latest :status :canceled
                                      :start_time (days-ago 5)
                                      :end_time   (t/plus (days-ago 5) (t/minutes 5))}
               ;; a TIMED-OUT run (2m) counts as finished
               :model/Transform    {timed-out :id} {}
               :model/TransformRun _ {:transform_id timed-out :status :succeeded
                                      :start_time (days-ago 4)
                                      :end_time   (t/plus (days-ago 4) (t/seconds 1))}
               :model/TransformRun _ {:transform_id timed-out :status :timeout
                                      :start_time (days-ago 3)
                                      :end_time   (t/plus (days-ago 3) (t/minutes 2))}
               ;; never ran at all
               :model/Transform    {never :id} {}]
              (let [by-entity (slow-findings-by-entity!)]
                (testing "flagged on its latest finished run - the 5m failed one, not the older 60s success"
                  (let [f (by-entity [:transform failing-latest])]
                    (is (some? f))
                    (is (= 300000 (:duration_ms f)))))
                (testing "a transform whose latest finished run is fast is not flagged"
                  (is (nil? (by-entity [:transform recovered]))))
                (testing "a slow canceled run is ignored - the latest finished run (fast) wins"
                  (is (nil? (by-entity [:transform canceled-latest]))))
                (testing "a timed-out run counts - flagged on its 2m duration"
                  (let [f (by-entity [:transform timed-out])]
                    (is (some? f))
                    (is (= 120000 (:duration_ms f)))))
                (testing "a never-run transform yields no finding"
                  (is (nil? (by-entity [:transform never]))))))))))))

(deftest slow-card-uses-median-test
  (testing "card slowness is the MEDIAN running_time, so outliers don't drag a typically-fast card over"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [now (t/offset-date-time)]
            (mt/with-temp
              [:model/Collection {coll-id :id} {}
               ;; odd count {1s 1s 60s}: the mean (20.7s) would flag it; the median (1s) must not
               :model/Card           {outlier-card :id} {:collection_id coll-id}
               :model/QueryExecution _ {:card_id outlier-card :started_at now
                                        :cache_hit false :running_time 1000}
               :model/QueryExecution _ {:card_id outlier-card :started_at now
                                        :cache_hit false :running_time 1000}
               :model/QueryExecution _ {:card_id outlier-card :started_at now
                                        :cache_hit false :running_time 60000}
               ;; even count {20s 30s}: the median is the average of the middle pair (25s)
               :model/Card           {even-card :id} {:collection_id coll-id}
               :model/QueryExecution _ {:card_id even-card :started_at now
                                        :cache_hit false :running_time 20000}
               :model/QueryExecution _ {:card_id even-card :started_at now
                                        :cache_hit false :running_time 30000}
               ;; even pair {10000 10001} straddling the 10s threshold: the unrounded median (10000.5)
               ;; must be what the SQL compares (flagged), and the stored duration_ms rounds up
               :model/Card           {half-card :id} {:collection_id coll-id}
               :model/QueryExecution _ {:card_id half-card :started_at now
                                        :cache_hit false :running_time 10000}
               :model/QueryExecution _ {:card_id half-card :started_at now
                                        :cache_hit false :running_time 10001}]
              (let [by-entity (slow-findings-by-entity!)]
                (testing "a fast card with one slow outlier execution is not flagged (the mean would have)"
                  (is (nil? (by-entity [:card outlier-card]))))
                (testing "even count: median is the mean of the two middle values"
                  (let [f (by-entity [:card even-card])]
                    (is (some? f))
                    (is (= 25000 (:duration_ms f)))))
                (testing "fractional median 10000.5 clears the 10000 threshold unrounded; duration_ms rounds to 10001"
                  (let [f (by-entity [:card half-card])]
                    (is (some? f))
                    (is (= 10001 (:duration_ms f)))))))))))))

(deftest slow-lookback-window-test
  (testing "only activity within the lookback window counts - older executions and runs are invisible"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds      10
                                         content-diagnostics-slow-transform-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          ;; freeze the clock so the scan-time cutoff (now - lookback) is identical to what the fixtures
          ;; compute - the exact >= boundary can then be pinned without racing the scan
          (mt/with-clock #t "2026-07-15T12:00Z[UTC]"
            (let [now    (t/offset-date-time)
                  cutoff (t/minus now (t/days @#'checkers.slow/lookback-days))]
              (mt/with-temp
                [:model/Collection {coll-id :id} {}
                 ;; an out-of-window slow execution must not drag a recently-fast card's median over
                 :model/Card           {recent-card :id} {:collection_id coll-id}
                 :model/QueryExecution _ {:card_id recent-card :started_at (t/minus cutoff (t/days 1))
                                          :cache_hit false :running_time 99999}
                 :model/QueryExecution _ {:card_id recent-card :started_at now
                                          :cache_hit false :running_time 500}
                 ;; executions exactly AT the cutoff count (inclusive >=); 1s older do not
                 :model/Card           {at-edge-card :id} {:collection_id coll-id}
                 :model/QueryExecution _ {:card_id at-edge-card :started_at cutoff
                                          :cache_hit false :running_time 30000}
                 :model/Card           {past-edge-card :id} {:collection_id coll-id}
                 :model/QueryExecution _ {:card_id past-edge-card
                                          :started_at (t/minus cutoff (t/seconds 1))
                                          :cache_hit false :running_time 30000}
                 ;; the same boundary for transform runs, keyed on start_time
                 :model/Transform    {at-edge-xform :id} {}
                 :model/TransformRun _ {:transform_id at-edge-xform :status :succeeded
                                        :start_time cutoff
                                        :end_time   (t/plus cutoff (t/minutes 1))}
                 :model/Transform    {past-edge-xform :id} {}
                 :model/TransformRun _ {:transform_id past-edge-xform :status :succeeded
                                        :start_time (t/minus cutoff (t/seconds 1))
                                        :end_time   (t/plus cutoff (t/minutes 1))}]
                (let [by-entity (slow-findings-by-entity!)]
                  (testing "an out-of-window slow execution doesn't affect the in-window median"
                    (is (nil? (by-entity [:card recent-card]))))
                  (testing "an execution exactly at the cutoff is included"
                    (is (some? (by-entity [:card at-edge-card]))))
                  (testing "an execution 1s before the cutoff is excluded"
                    (is (nil? (by-entity [:card past-edge-card]))))
                  (testing "a run started exactly at the cutoff is included"
                    (is (some? (by-entity [:transform at-edge-xform]))))
                  (testing "a run started 1s before the cutoff is excluded"
                    (is (nil? (by-entity [:transform past-edge-xform])))))))))))))

(deftest slow-threshold-frozen-at-scan-time-test
  (testing "threshold_ms is frozen in details at scan time; a later setting change does not rewrite it"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card {card :id} {:collection_id coll-id}
                       :model/QueryExecution _ {:card_id card :started_at (t/offset-date-time)
                                                :cache_hit false :running_time 30000}]
          (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds 10]
            (slow-findings-by-entity!))
          (testing "the frozen detail stays at the scan-time threshold (10s), not the new one (5s)"
            (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds 5]
              (let [f (t2/select-one :model/ContentDiagnosticsFinding
                                     :entity_type :card :entity_id card :finding_type :slow)]
                (is (= 10000 (get-in f [:details :threshold_ms])))))))))))

;;; ------------------------------------------------- API --------------------------------------------------

(deftest slow-api-hydration-test
  (testing "GET /slow serves leaf and container findings with hydrated context + culprits"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll-id :id} {:name "Analytics"}
             :model/Card           {slow-card :id} {:collection_id coll-id
                                                    :name          "Full Orders Export"
                                                    :type          :model
                                                    :view_count    5
                                                    :creator_id    (mt/user->id :rasta)}
             :model/QueryExecution _ {:card_id slow-card :started_at (t/offset-date-time)
                                      :cache_hit false :running_time 25000}
             :model/Dashboard      {dash-id :id} {:collection_id coll-id :name "Ops Dashboard"}
             :model/DashboardCard  _ {:dashboard_id dash-id :card_id slow-card}]
            (scan/scan!)
            (let [resp  (mt/user-http-request :crowberto :get 200 "ee/content-diagnostics/slow")
                  by-id (into {} (map (juxt (juxt :entity_type :entity_id) identity)) (:data resp))]
              (testing "the envelope carries last_scan_at + total"
                (is (contains? resp :last_scan_at))
                (is (pos-int? (:total resp))))
              (testing "leaf (card): top-level duration_ms + frozen threshold_ms + collection + creator"
                (let [f (by-id ["card" slow-card])]
                  (is (some? f))
                  (is (= "Full Orders Export" (:entity_display_name f)))
                  (is (= 25000 (:duration_ms f)))
                  (is (= 10000 (get-in f [:details :threshold_ms])))
                  (is (= coll-id (get-in f [:details :collection :id])))
                  (is (= (mt/user->id :rasta) (get-in f [:details :creator :id])))
                  (is (= "user" (get-in f [:details :creator :type])))
                  (testing "card has no owner column → owner null"
                    (is (nil? (get-in f [:details :owner]))))
                  (testing "slow leaves carry no last_active_at key (that column is stale-only)"
                    (is (not (contains? f :last_active_at))))))
              (testing "container (dashboard): representative duration + stored ids hydrated into slow_entities"
                (let [f (by-id ["dashboard" dash-id])]
                  (is (some? f))
                  (is (= 25000 (:duration_ms f)))
                  (is (nil? (get-in f [:details :slow_entity_ids])))
                  (let [entities (get-in f [:details :slow_entities])]
                    (is (= 1 (count entities)))
                    (testing "each culprit carries its own live view_count alongside id/name/type"
                      (is (= {:id slow-card :name "Full Orders Export"
                              :entity_type "card" :card_type "model" :view_count 5}
                             (first entities))))))))))))))

(deftest slow-api-subject-view-count-test
  (testing "GET /slow hydrates each finding's own live view_count into details; a transform omits it"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp
          [:model/Collection {coll-id :id}  {}
           :model/Collection {tcoll-id :id} {:namespace "transforms"}
           :model/Card       {card-id :id}  {:collection_id coll-id :view_count 7}
           :model/Dashboard  {dash-id :id}  {:collection_id coll-id :view_count 12}
           :model/Document   {doc-id :id}   {:collection_id coll-id
                                             :view_count    3
                                             :creator_id    (mt/user->id :rasta)
                                             :content_type  prose-mirror/prose-mirror-content-type
                                             :document      {:type "doc" :content []}}
           :model/Transform  {xform-id :id} {:collection_id tcoll-id}]
          (let [prefix (scope-prefix)]
            (doseq [[etype eid] [[:card card-id] [:dashboard dash-id] [:document doc-id] [:transform xform-id]]]
              (t2/insert! :model/ContentDiagnosticsFinding
                          {:scan_id      "vc"
                           :entity_type  etype
                           :entity_id    eid
                           :entity_name  (str prefix "-" (name etype))
                           :finding_type :slow
                           :duration_ms  20000
                           :details      {:threshold_ms 15000}}))
            (let [by-type (into {} (map (juxt :entity_type identity))
                                (:data (mt/user-http-request :crowberto :get 200
                                                             "ee/content-diagnostics/slow" :query prefix)))]
              (testing "card/dashboard/document each carry their own live view_count in details"
                (is (= 7  (get-in by-type ["card" :details :view_count])))
                (is (= 12 (get-in by-type ["dashboard" :details :view_count])))
                (is (= 3  (get-in by-type ["document" :details :view_count]))))
              (testing "a transform (no view_count column) omits the key entirely from details"
                (is (contains? by-type "transform"))
                (is (not (contains? (get-in by-type ["transform" :details]) :view_count))))
              (testing "view_count is hydrated live at read time, not frozen at scan time"
                (t2/update! :model/Card card-id {:view_count 99})
                (let [card-f (some #(when (= "card" (:entity_type %)) %)
                                   (:data (mt/user-http-request :crowberto :get 200
                                                                "ee/content-diagnostics/slow" :query prefix)))]
                  (is (= 99 (get-in card-f [:details :view_count]))))))))))))

(deftest slow-api-filter-and-sort-test
  (testing "GET /slow filters by entity-types/min-duration-ms and sorts by duration-ms/name"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Collection {tcoll-id :id} {:namespace "transforms"}
                         :model/Card {card-id :id} {:collection_id coll-id}
                         :model/Dashboard {dash-id :id} {:collection_id coll-id}
                         :model/Transform {xform-id :id} {:collection_id tcoll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (perms/grant-collection-read-permissions! (perms/all-users-group) tcoll-id)
            (let [prefix (scope-prefix)
                  insert (fn [etype eid nm duration]
                           (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id      "s"
                                                             :entity_type  etype
                                                             :entity_id    eid
                                                             :entity_name  (str prefix " " nm)
                                                             :finding_type :slow
                                                             :duration_ms  duration
                                                             :details      {:threshold_ms 15000}})))
                  card-fid  (insert :card      card-id  "Alpha" 20000)   ; leaf
                  dash-fid  (insert :dashboard dash-id  "Beta"  50000)   ; container (representative duration)
                  xform-fid (insert :transform xform-id "Gamma" 80000)   ; leaf
                  ids   (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                "ee/content-diagnostics/slow" :query prefix kvs)))))
                  order (fn [& kvs] (mapv :id (:data (apply mt/user-http-request :rasta :get 200
                                                            "ee/content-diagnostics/slow" :query prefix kvs))))]
              (testing "no filter → all three"
                (is (= #{card-fid dash-fid xform-fid} (ids))))
              (testing "entity-types (single + multi)"
                (is (= #{card-fid} (ids :entity-types "card")))
                (is (= #{card-fid dash-fid} (ids :entity-types ["card" "dashboard"]))))
              (testing "min-duration-ms floor - a container passes/fails on its representative duration"
                (is (= #{dash-fid xform-fid} (ids :min-duration-ms "50000")))  ; dash (50000) passes, card dropped
                (is (= #{xform-fid} (ids :min-duration-ms "80000"))))          ; dash now fails, leaf-only
              (testing "sort by duration-ms, both directions"
                (is (= [card-fid dash-fid xform-fid] (order :sort-column "duration-ms" :sort-direction "asc")))
                (is (= [xform-fid dash-fid card-fid] (order :sort-column "duration-ms" :sort-direction "desc"))))
              (testing "sort by name (Alpha < Beta < Gamma), both directions"
                (is (= [card-fid dash-fid xform-fid] (order :sort-column "name" :sort-direction "asc")))
                (is (= [xform-fid dash-fid card-fid] (order :sort-column "name" :sort-direction "desc")))))))))))

(deftest slow-api-paginates-test
  (testing "GET /slow honors limit/offset and reports the full valid total"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c1 :id} {:collection_id coll-id}
                         :model/Card {c2 :id} {:collection_id coll-id}
                         :model/Card {c3 :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix (scope-prefix)]
              (doseq [cid [c1 c2 c3]]
                (t2/insert! :model/ContentDiagnosticsFinding
                            {:scan_id "p" :entity_type :card :entity_id cid
                             :entity_name (str prefix "-" cid)
                             :finding_type :slow :duration_ms 20000 :details {:threshold_ms 15000}}))
              (let [page (fn [limit offset]
                           (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/slow"
                                                 :query prefix :limit limit :offset offset))]
                (testing "limit caps the page; total reflects the full valid set; limit/offset echoed back"
                  (let [r (page 2 0)]
                    (is (= 2 (count (:data r))))
                    (is (= 3 (:total r)))
                    (is (= 2 (:limit r)))
                    (is (= 0 (:offset r)))))
                (testing "offset advances to the remainder"
                  (is (= 1 (count (:data (page 2 2))))))))))))))

(deftest slow-api-include-personal-collections-test
  (testing "GET /slow excludes personal-collection findings by default; includes them with the param"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [pers-id (:id (collection/user->personal-collection (mt/user->id :rasta)))]
            (mt/with-temp [:model/Collection {reg-id :id}    {}
                           :model/Card       {reg-card :id}  {:collection_id reg-id}
                           :model/Card       {pers-card :id} {:collection_id pers-id}]
              (perms/grant-collection-read-permissions! (perms/all-users-group) reg-id)
              (let [prefix   (scope-prefix)
                    insert   (fn [card]
                               (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                                {:scan_id "p-scan" :entity_type :card :entity_id card
                                                                 :entity_name (str prefix "-" card)
                                                                 :finding_type :slow :duration_ms 20000 :details {}})))
                    reg-fid  (insert reg-card)
                    pers-fid (insert pers-card)
                    fetch    (fn [& kvs] (apply mt/user-http-request :rasta :get 200
                                                "ee/content-diagnostics/slow" :query prefix kvs))
                    fetched-ids (fn [resp] (set (map :id (:data resp))))]
                (testing "default (param omitted) → personal-collection finding excluded"
                  (let [resp (fetch)]
                    (is (contains? (fetched-ids resp) reg-fid))
                    (is (not (contains? (fetched-ids resp) pers-fid)))
                    (is (= 1 (:total resp)))))
                (testing "include-personal-collections=true → both returned, total counts both"
                  (let [resp (fetch :include-personal-collections true)]
                    (is (contains? (fetched-ids resp) reg-fid))
                    (is (contains? (fetched-ids resp) pers-fid))
                    (is (= 2 (:total resp)))))))))))))

(deftest slow-api-personal-culprits-follow-param-test
  (testing "GET /slow culprit hydration honors include-personal-collections like the findings filter"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (let [pers-id (:id (collection/user->personal-collection (mt/user->id :rasta)))]
            (mt/with-temp [:model/Collection {reg-id :id}    {}
                           :model/Dashboard  {dash-id :id}   {:collection_id reg-id}
                           :model/Card       {reg-card :id}  {:collection_id reg-id}
                           :model/Card       {pers-card :id} {:collection_id pers-id}]
              (perms/grant-collection-read-permissions! (perms/all-users-group) reg-id)
              (let [prefix      (scope-prefix)
                    fid         (first (t2/insert-returning-pks!
                                        :model/ContentDiagnosticsFinding
                                        {:scan_id "pc" :entity_type :dashboard :entity_id dash-id
                                         :entity_name (str prefix "-dash")
                                         :finding_type :slow :duration_ms 20000
                                         :details {:slow_entity_ids [reg-card pers-card]}}))
                    culprit-ids (fn [& kvs]
                                  (let [finding (some #(when (= fid (:id %)) %)
                                                      (:data (apply mt/user-http-request
                                                                    :rasta :get 200
                                                                    "ee/content-diagnostics/slow"
                                                                    :query prefix kvs)))]
                                    (into #{} (map :id) (get-in finding [:details :slow_entities]))))]
                (testing "default → the caller's own (readable) personal-collection culprit is hidden too"
                  (is (= #{reg-card} (culprit-ids))))
                (testing "include-personal-collections=true → both culprits hydrate"
                  (is (= #{reg-card pers-card} (culprit-ids :include-personal-collections true))))))))))))

(deftest slow-api-query-search-test
  (testing "GET /slow ?query= case-insensitively substring-matches the denormalized entity name"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {c-rev :id}  {:collection_id coll-id}
                         :model/Card {c-cost :id} {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix (scope-prefix)
                  insert (fn [card nm]
                           (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                            {:scan_id "q" :entity_type :card :entity_id card
                                                             :finding_type :slow :duration_ms 20000 :details {}
                                                             :entity_name (str prefix " " nm)})))
                  rev-fid  (insert c-rev  "Quarterly Revenue")
                  cost-fid (insert c-cost "Cost Analysis")
                  ids      (fn [& kvs] (set (map :id (:data (apply mt/user-http-request :rasta :get 200
                                                                   "ee/content-diagnostics/slow" kvs)))))]
              (testing "substring match, case-insensitive"
                (is (= #{rev-fid} (ids :query (str prefix " QUARTERLY REV"))))
                (is (= #{cost-fid} (ids :query (str prefix " cost")))))
              (testing "no match → empty"
                (is (empty? (ids :query (str prefix " zzz"))))))))))))

(deftest slow-api-permission-filtered-test
  (testing "GET /slow returns only findings whose entity the current user can read"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {readable :id}   {}
                         :model/Collection {unreadable :id} {}
                         :model/Card {r-card :id} {:collection_id readable}
                         :model/Card {u-card :id} {:collection_id unreadable}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
            (let [insert  (fn [card]
                            (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "perm" :entity_type :card :entity_id card
                                                              :finding_type :slow :duration_ms 20000 :details {}})))
                  r-fid   (insert r-card)
                  u-fid   (insert u-card)
                  ids-for (fn [user] (set (map :id (:data (mt/user-http-request
                                                           user :get 200 "ee/content-diagnostics/slow")))))]
              (testing "non-admin sees only the finding in the readable collection"
                (let [ids (ids-for :rasta)]
                  (is (contains? ids r-fid))
                  (is (not (contains? ids u-fid)))))
              (testing "superuser sees findings in every collection"
                (let [ids (ids-for :crowberto)]
                  (is (contains? ids r-fid))
                  (is (contains? ids u-fid)))))))))))

(deftest slow-api-hides-unreadable-culprits-test
  (testing "GET /slow omits culprit cards the caller can't read from a container's slow_entities"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {readable :id}   {}
                         :model/Collection {unreadable :id} {}
                         :model/Dashboard {dash-id :id} {:collection_id readable}
                         :model/Card {open-card :id}   {:collection_id readable}
                         :model/Card {secret-card :id} {:collection_id unreadable}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) readable)
            (let [prefix      (scope-prefix)
                  fid         (first (t2/insert-returning-pks!
                                      :model/ContentDiagnosticsFinding
                                      {:scan_id "perm" :entity_type :dashboard :entity_id dash-id
                                       :entity_name (str prefix "-dash")
                                       :finding_type :slow :duration_ms 20000
                                       :details {:slow_entity_ids [open-card secret-card]}}))
                  culprit-ids (fn [user]
                                (let [finding (some #(when (= fid (:id %)) %)
                                                    (:data (mt/user-http-request
                                                            user :get 200 "ee/content-diagnostics/slow"
                                                            :query prefix)))]
                                  (into #{} (map :id) (get-in finding [:details :slow_entities]))))]
              (testing "superuser sees both culprits"
                (is (= #{open-card secret-card} (culprit-ids :crowberto))))
              (testing "non-admin sees only the culprit they can read"
                (is (= #{open-card} (culprit-ids :rasta)))))))))))

(deftest slow-api-does-not-leak-across-finding-types-test
  (testing "a stale finding never surfaces in /slow, and a slow finding never surfaces in /stale"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-non-admin-groups-no-root-collection-perms
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         :model/Card {stale-card :id} {:collection_id coll-id}
                         :model/Card {slow-card :id}  {:collection_id coll-id}]
            (perms/grant-collection-read-permissions! (perms/all-users-group) coll-id)
            (let [prefix    (scope-prefix)
                  stale-fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id stale-card
                                                              :entity_name (str prefix "-stale")
                                                              :finding_type :stale :details {:threshold_days 90}}))
                  slow-fid  (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                             {:scan_id "x" :entity_type :card :entity_id slow-card
                                                              :entity_name (str prefix "-slow")
                                                              :finding_type :slow :duration_ms 20000
                                                              :details {:threshold_ms 15000}}))
                  ids  (fn [path] (set (map :id (:data (mt/user-http-request :rasta :get 200 path :query prefix)))))]
              (testing "/slow returns only the slow finding"
                (let [slow-ids (ids "ee/content-diagnostics/slow")]
                  (is (contains? slow-ids slow-fid))
                  (is (not (contains? slow-ids stale-fid)))))
              (testing "/stale returns only the stale finding"
                (let [stale-ids (ids "ee/content-diagnostics/stale")]
                  (is (contains? stale-ids stale-fid))
                  (is (not (contains? stale-ids slow-fid))))))))))))

(deftest slow-api-feature-gated-test
  (testing "GET /slow is gated on the :content-diagnostics premium feature (premium-handler)"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (testing "licensed → 200 with the paginated envelope"
        (mt/with-premium-features #{:content-diagnostics}
          (let [resp (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/slow")]
            (is (contains? resp :data))
            (is (contains? resp :total)))))
      (testing "unlicensed → 402"
        (mt/with-premium-features #{}
          (mt/user-http-request :rasta :get 402 "ee/content-diagnostics/slow"))))))

(deftest scan-runs-both-checkers-and-supersedes-per-type-test
  (testing "one scan writes stale + slow in a single scan_id batch; a rescan supersedes a fixed slow finding while a still-stale entity keeps an active stale finding"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [content-diagnostics-slow-card-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp [:model/Collection {coll-id :id} {}
                         ;; stale (old last_used_at) but fast
                         :model/Card {stale-card :id} {:collection_id coll-id
                                                       :last_used_at (t/minus (t/offset-date-time) (t/days 400))}
                         ;; slow (mean 30s) but fresh
                         :model/Card {slow-card :id}  {:collection_id coll-id :last_used_at (t/offset-date-time)}
                         :model/QueryExecution _ {:card_id slow-card :started_at (t/offset-date-time)
                                                  :cache_hit false :running_time 30000}]
            (let [scan-1    (:scan_id (scan/scan!))
                  stale-row (t2/select-one :model/ContentDiagnosticsFinding
                                           :entity_type :card :entity_id stale-card :finding_type :stale)
                  slow-row  (t2/select-one :model/ContentDiagnosticsFinding
                                           :entity_type :card :entity_id slow-card :finding_type :slow)]
              (testing "both finding types share one scan_id batch"
                (is (some? stale-row))
                (is (some? slow-row))
                (is (= scan-1 (:scan_id stale-row) (:scan_id slow-row))))
              ;; fix the slow card (drop its slow executions); stale card stays stale
              (t2/delete! :model/QueryExecution :card_id slow-card)
              (scan/scan!)
              (testing "the fixed slow finding is soft-invalidated"
                (is (some? (:invalidated_at (t2/select-one :model/ContentDiagnosticsFinding :id (:id slow-row))))))
              (testing "the still-stale entity keeps an active stale finding (per-type supersession)"
                (is (seq (t2/select :model/ContentDiagnosticsFinding
                                    :entity_type :card :entity_id stale-card
                                    :finding_type :stale :invalidated_at nil)))))))))))
