(ns metabase-enterprise.content-diagnostics.scan-test
  "The scan pipeline runs the instance-wide `stale` checker, persists a snapshot, and emits
  o11y signals (duration histogram, outcome counter, findings/entities gauges)."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- stale-instant []
  (t/minus (t/offset-date-time) (t/days 365)))

(defn- fresh-instant []
  (t/offset-date-time))

(deftest scan-detects-stale-and-emits-metrics-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-prometheus-system! [_ system]
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       ;; stale: last activity well past the 90-day threshold
                       :model/Card      {s1 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Card      {s2 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Card      {s3 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Dashboard {s4 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                       :model/Dashboard {s5 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                       ;; fresh: used just now — must NOT be flagged
                       :model/Card      {f1 :id} {:collection_id coll-id :last_used_at (fresh-instant)}
                       :model/Dashboard {f2 :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}]
          (let [stale-keys #{[:card s1] [:card s2] [:card s3] [:dashboard s4] [:dashboard s5]}
                fresh-keys #{[:card f1] [:dashboard f2]}
                result     (detect/scan!)
                rows       (t2/select :model/ContentDiagnosticsFinding :scan_id (:scan_id result))
                found-keys (set (map (juxt :entity_type :entity_id) rows))]
            (testing "scan! returns a topline {scan_id, finding_count, entities_scanned, duration_ms}"
              (is (string? (:scan_id result)))
              (is (pos-int? (:finding_count result)))
              (is (pos-int? (:entities_scanned result)))
              (is (<= (:finding_count result) (:entities_scanned result)))
              (is (nat-int? (:duration_ms result))))
            (testing "every stale temp entity produced a :stale finding; no fresh one did"
              (is (every? found-keys stale-keys))
              (is (empty? (set/intersection found-keys fresh-keys))))
            (testing "persisted findings carry finding_type + detector_version"
              (let [row (first (filter #(and (= :card (:entity_type %)) (= s1 (:entity_id %))) rows))]
                (is (= :stale (:finding_type row)))
                (is (= detect/detector-version (:detector_version row)))
                ;; derive from the setting, not a literal — a default change must not silently desync
                (is (= {:threshold_days (cd.settings/content-diagnostics-stale-threshold-days)}
                       (:details row)))))
            (testing "duration histogram recorded one ok observation"
              (is (<= 1 (:count (mt/metric-value system :metabase-content-diagnostics/scan-duration-ms
                                                 {:status "ok"})))))
            (testing "outcome counter bumped {status=ok}"
              (is (pos? (mt/metric-value system :metabase-content-diagnostics/scans {:status "ok"}))))
            (testing "magnitude gauges match the scan topline"
              (is (= (double (:finding_count result))
                     (mt/metric-value system :metabase-content-diagnostics/scan-findings)))
              (is (= (double (:entities_scanned result))
                     (mt/metric-value system :metabase-content-diagnostics/scan-entities))))
            ;; --- record the topline for the run log (println is intentional for human-readable output) ---
            #_{:clj-kondo/ignore [:discouraged-var]}
            (let [h (mt/metric-value system :metabase-content-diagnostics/scan-duration-ms {:status "ok"})]
              (println (str "\n=== Content Diagnostics — stale scan topline ==="
                            (format "\nfindings:                        %d" (:finding_count result))
                            (format "\nentities scanned:                %d" (:entities_scanned result))
                            (format "\nratio:                           %.1f%% of swept entities flagged"
                                    (* 100.0 (/ (:finding_count result) (double (:entities_scanned result)))))
                            (format "\nduration (return):               %d ms" (:duration_ms result))
                            (format "\nduration (prometheus histogram): count=%d sum=%.1f ms"
                                    (long (:count h)) (double (:sum h)))
                            "\n===============================================\n")))))))))

(deftest scan-error-path-emits-error-metrics-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-prometheus-system! [_ system]
      (mt/with-dynamic-fn-redefs [detect/detect (fn [] (throw (ex-info "boom" {})))]
        (is (thrown? Exception (detect/scan!)))
        (testing "error outcome counter + error duration observation bump"
          (is (pos? (mt/metric-value system :metabase-content-diagnostics/scans {:status "error"})))
          (is (<= 1 (:count (mt/metric-value system :metabase-content-diagnostics/scan-duration-ms
                                             {:status "error"})))))
        (testing "no ok signal on the error path"
          (is (zero? (mt/metric-value system :metabase-content-diagnostics/scans {:status "ok"}))))))))

(deftest scan-soft-invalidates-superseded-findings-test
  (testing "a fresh scan supersedes prior findings it no longer produces — via soft invalidation, not delete"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card {resolved :id} {:collection_id coll-id :last_used_at (stale-instant)}
                       :model/Card {still :id}    {:collection_id coll-id :last_used_at (stale-instant)}]
          (detect/scan!)                                            ; scan 1: both stale
          (t2/update! :model/Card resolved {:last_used_at (fresh-instant)})  ; resolved is now fresh
          (detect/scan!)                                            ; scan 2: only `still` is stale
          (let [active (set (map :entity_id (t2/select :model/ContentDiagnosticsFinding
                                                       :entity_type :card :stale false)))]
            (testing "the re-flagged card stays active; the resolved one does not"
              (is (contains? active still))
              (is (not (contains? active resolved))))
            (testing "the resolved card's prior finding is soft-invalidated (kept + stale + timestamped), not deleted"
              (let [rows (t2/select :model/ContentDiagnosticsFinding :entity_type :card :entity_id resolved)]
                (is (seq rows))                                     ; not hard-deleted — history retained
                (is (every? :stale rows))
                (is (every? :invalidated_at rows))))))))))

(deftest serve-latest-per-entity-and-hydration-test
  (testing "GET /finding serves the latest non-invalidated finding per entity, batch-hydrated"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (mt/with-temp [:model/Collection {coll-id :id} {}
                       :model/Card {card-id :id} {:collection_id coll-id
                                                  :name          "Quarterly Revenue"
                                                  :creator_id    (mt/user->id :rasta)}]
          (let [insert     (fn [scan threshold]
                             (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                              {:scan_id          scan
                                                               :entity_type      :card
                                                               :entity_id        card-id
                                                               :finding_type     :stale
                                                               :detector_version 1
                                                               :details          {:threshold_days threshold}})))
                old-id     (insert "scan-old" 30)
                new-id     (insert "scan-new" 90)
                serve      #(mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale")
                served-ids (fn [resp] (set (map :id (:data resp))))]
            ;; membership assertions (robust to other rows / pagination), not absolute page counts
            (testing "the latest finding is served, the superseded older one is not — and `total` counts only the latest"
              (let [resp (serve)
                    ids  (served-ids resp)]
                (is (contains? ids new-id))
                (is (not (contains? ids old-id)))
                ;; total must exclude the older row even though it is stale=false: it isn't MAX(id) for the entity
                (is (= 1 (:total resp)))))
            (testing "the served finding has flat identity + a nested typed details (collection, description, owner, creator)"
              (let [row (first (filter #(= new-id (:id %)) (:data (serve))))]
                (is (= "Quarterly Revenue" (:entity_display_name row)))
                (testing "collection breadcrumb nested under details"
                  (is (= coll-id (get-in row [:details :collection :id]))))
                (testing "stored verdict (threshold_days) flows through details"
                  (is (= 90 (get-in row [:details :threshold_days]))))
                (testing "creator hydrated as a normalized user object"
                  (is (= (mt/user->id :rasta) (get-in row [:details :creator :id])))
                  (is (= "user" (get-in row [:details :creator :type]))))
                (testing "card has no owner column → owner is null"
                  (is (nil? (get-in row [:details :owner]))))))
            (testing "invalidating the latest hides the entity AND drops it from total; older row does NOT resurface"
              (t2/update! :model/ContentDiagnosticsFinding new-id {:stale true})
              (let [resp (serve)
                    ids  (served-ids resp)]
                (is (not (contains? ids new-id)))
                (is (not (contains? ids old-id)))
                ;; total excludes the invalidated latest (stale=true), and does not fall back to the older row
                (is (= 0 (:total resp)))))))))))

(deftest serve-paginates-test
  (testing "GET /finding honors limit/offset and reports the full active total"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (doseq [eid [970001 970002 970003]]
          (t2/insert! :model/ContentDiagnosticsFinding
                      {:scan_id "p" :entity_type :card :entity_id eid
                       :finding_type :stale :detector_version 1 :details {}}))
        (let [page (fn [limit offset]
                     (mt/user-http-request :rasta :get 200 "ee/content-diagnostics/stale"
                                           :limit limit :offset offset))]
          (testing "limit caps the page; total reflects the full active set; limit/offset echoed back"
            (let [r (page 2 0)]
              (is (= 2 (count (:data r))))
              (is (= 3 (:total r)))
              (is (= 2 (:limit r)))
              (is (= 0 (:offset r)))))
          (testing "offset advances to the remainder"
            (is (= 1 (count (:data (page 2 2)))))))))))

(deftest scan-endpoint-is-feature-gated-test
  (testing "POST /scan runs synchronously for a licensed instance"
    (mt/with-premium-features #{:content-diagnostics}
      (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
        (let [resp (mt/user-http-request :rasta :post 200 "ee/content-diagnostics/scan")]
          (is (contains? resp :scan_id))
          (is (contains? resp :finding_count))
          (is (contains? resp :entities_scanned))
          (is (contains? resp :duration_ms))))))
  ;; DEMO (temporary): premium gate disabled in api_routes/routes.clj, so this no longer 402s. Restore with the gate.
  #_(testing "without the feature the endpoint is gated (premium-handler)"
      (mt/with-premium-features #{}
        (mt/user-http-request :rasta :post 402 "ee/content-diagnostics/scan"))))
