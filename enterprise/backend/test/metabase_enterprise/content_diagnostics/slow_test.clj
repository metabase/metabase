(ns metabase-enterprise.content-diagnostics.slow-test
  "The `slow` checker flags card/transform leaves (over a duration threshold) and dashboard/document
  containers that embed a slow card, freezing `threshold_ms` (and leaf `duration_ms`) at scan time. The
  `/slow` endpoint serves them with leaf-vs-container `details` and hydrated roll-up culprits."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private prose-mirror-content-type "application/json+vnd.prose-mirror")

(defn- slow-findings-by-entity!
  "Run a scan and index its `:slow` findings by `[entity-type entity-id]`."
  []
  (let [scan-id (:scan_id (detect/scan!))]
    (into {}
          (map (juxt (juxt :entity_type :entity_id) identity))
          (t2/select :model/ContentDiagnosticsFinding :scan_id scan-id :finding_type :slow))))

(deftest slow-checker-detects-leaves-and-containers-test
  (testing "card/transform leaves and dashboard/document container roll-ups are flagged; fast ones are not"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [slow-card-threshold-seconds      10
                                         slow-transform-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll-id :id} {}
             ;; slow card: mean running_time 30s > 10s threshold (cache hits are ignored)
             :model/Card           {slow-card :id} {:collection_id coll-id :name "Full Orders Export"}
             :model/QueryExecution _ {:card_id slow-card :started_at (t/offset-date-time)
                                      :cache_hit false :running_time 30000}
             :model/QueryExecution _ {:card_id slow-card :started_at (t/offset-date-time)
                                      :cache_hit false :running_time 30000}
             ;; a cache hit at a huge time must NOT count toward the mean
             :model/QueryExecution _ {:card_id slow-card :started_at (t/offset-date-time)
                                      :cache_hit true :running_time 99999}
             ;; fast card: 500ms < 10s — never flagged, and never a culprit
             :model/Card           {fast-card :id} {:collection_id coll-id :name "Quick Lookup"}
             :model/QueryExecution _ {:card_id fast-card :started_at (t/offset-date-time)
                                      :cache_hit false :running_time 500}
             ;; container roll-ups: a dashboard and a document embedding the slow card
             :model/Dashboard      {dash-id :id}  {:collection_id coll-id}
             :model/DashboardCard  _ {:dashboard_id dash-id :card_id slow-card}
             :model/DashboardCard  _ {:dashboard_id dash-id :card_id fast-card}
             :model/Document       {doc-id :id}   {:collection_id coll-id
                                                   :creator_id    (mt/user->id :rasta)
                                                   :content_type  prose-mirror-content-type
                                                   :document      {:type "doc"
                                                                   :content [{:type "cardEmbed"
                                                                              :attrs {:id slow-card}}]}}
             ;; a dashboard with only the fast card must NOT be flagged
             :model/Dashboard      {fast-dash :id} {:collection_id coll-id}
             :model/DashboardCard  _ {:dashboard_id fast-dash :card_id fast-card}
             ;; transform leaves: one slow succeeded run (60s), one fast (1s)
             :model/Transform      {slow-xform :id} {}
             :model/TransformRun   _ {:transform_id slow-xform :status :succeeded
                                      :start_time (t/offset-date-time 2026 6 1 3 0 0)
                                      :end_time   (t/offset-date-time 2026 6 1 3 1 0)}
             :model/Transform      {fast-xform :id} {}
             :model/TransformRun   _ {:transform_id fast-xform :status :succeeded
                                      :start_time (t/offset-date-time 2026 6 1 3 0 0)
                                      :end_time   (t/offset-date-time 2026 6 1 3 0 1)}]
            (let [by-entity (slow-findings-by-entity!)]
              (testing "slow card leaf: frozen duration_ms (mean) + threshold_ms"
                (let [f (by-entity [:card slow-card])]
                  (is (some? f))
                  (is (= 30000 (get-in f [:details :duration_ms])))
                  (is (= 10000 (get-in f [:details :threshold_ms])))))
              (testing "fast card is not flagged"
                (is (nil? (by-entity [:card fast-card]))))
              (testing "slow transform leaf: 60s duration over the 10s threshold, both frozen in ms"
                (let [f (by-entity [:transform slow-xform])]
                  (is (some? f))
                  (is (= 60000 (get-in f [:details :duration_ms])))
                  (is (= 10000 (get-in f [:details :threshold_ms])))))
              (testing "fast transform is not flagged"
                (is (nil? (by-entity [:transform fast-xform]))))
              (testing "dashboard container rolls up only the slow card it embeds"
                (let [f (by-entity [:dashboard dash-id])]
                  (is (some? f))
                  (is (= [slow-card] (get-in f [:details :slow_entity_ids])))))
              (testing "dashboard with only fast cards is not flagged"
                (is (nil? (by-entity [:dashboard fast-dash]))))
              (testing "document container rolls up the embedded slow card"
                (let [f (by-entity [:document doc-id])]
                  (is (some? f))
                  (is (= [slow-card] (get-in f [:details :slow_entity_ids]))))))))))))

(deftest serve-slow-endpoint-hydration-test
  (testing "GET /slow serves leaf and container findings with hydrated context + culprits"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-temporary-setting-values [slow-card-threshold-seconds 10]
        (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
          (mt/with-temp
            [:model/Collection {coll-id :id} {:name "Analytics"}
             :model/Card           {slow-card :id} {:collection_id coll-id
                                                    :name          "Full Orders Export"
                                                    :type          :model
                                                    :creator_id    (mt/user->id :rasta)}
             :model/QueryExecution _ {:card_id slow-card :started_at (t/offset-date-time)
                                      :cache_hit false :running_time 25000}
             :model/Dashboard      {dash-id :id} {:collection_id coll-id :name "Ops Dashboard"}
             :model/DashboardCard  _ {:dashboard_id dash-id :card_id slow-card}]
            (detect/scan!)
            (let [resp (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/slow")
                  by-id (into {} (map (juxt (juxt :entity_type :entity_id) identity)) (:data resp))]
              (testing "the envelope carries last_scan_at + total"
                (is (contains? resp :last_scan_at))
                (is (pos-int? (:total resp))))
              (testing "leaf (card) finding: duration_ms/threshold_ms + collection breadcrumb + creator"
                (let [f (by-id ["card" slow-card])]
                  (is (some? f))
                  (is (= "Full Orders Export" (:entity_display_name f)))
                  (is (= 25000 (get-in f [:details :duration_ms])))
                  (is (= 10000 (get-in f [:details :threshold_ms])))
                  (is (= coll-id (get-in f [:details :collection :id])))
                  (is (= (mt/user->id :rasta) (get-in f [:details :creator :id])))
                  (is (= "user" (get-in f [:details :creator :type])))
                  (testing "card has no owner column → owner null"
                    (is (nil? (get-in f [:details :owner]))))))
              (testing "container (dashboard) finding: stored ids hydrated into slow_entities objects"
                (let [f (by-id ["dashboard" dash-id])]
                  (is (some? f))
                  (is (nil? (get-in f [:details :slow_entity_ids])))
                  (let [entities (get-in f [:details :slow_entities])]
                    (is (= 1 (count entities)))
                    (is (= {:id slow-card :name "Full Orders Export"
                            :entity_type "card" :card_type "model"}
                           (first entities)))))))))))))
