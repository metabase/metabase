(ns metabase-enterprise.content-diagnostics.scan-test
  "The scan pipeline runs the instance-wide `stale` checker, persists a snapshot, and supersedes
  prior findings."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.detect :as detect]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase-enterprise.content-diagnostics.task :as cd.task]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- stale-instant
  "Comfortably past the staleness threshold, whatever its default — derived from the setting so a
  default change can't silently desync the fixture."
  []
  (t/minus (t/offset-date-time) (t/days (+ (cd.settings/content-diagnostics-stale-threshold-days) 30))))

(defn- fresh-instant []
  (t/offset-date-time))

(defn- finding-for
  [rows entity-type entity-id]
  (m/find-first #(and (= entity-type (:entity_type %)) (= entity-id (:entity_id %))) rows))

(deftest scan-detects-stale-test
  (mt/with-premium-features #{:content-diagnostics}
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (mt/with-temp [:model/Collection {coll-id :id} {}
                     ;; stale: last activity well past the threshold
                     :model/Card      {s1 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Card      {s2 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Card      {s3 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Dashboard {s4 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     :model/Dashboard {s5 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     :model/Document  {s6 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     ;; never-used arms: document never viewed (view_count 0; last_viewed_at is
                     ;; creation-stamped) / transform never ran — each + created before the cutoff
                     :model/Document  {s7 :id} {:collection_id coll-id :created_at (stale-instant)}
                     ;; transforms live in the :transforms collection namespace, not regular collections —
                     ;; irrelevant to the instance-wide scan, so no collection at all
                     :model/Transform {s8 :id} {:created_at (stale-instant)}
                     ;; fresh: used just now (or, for the never-run transform, created just now) — must NOT be flagged
                     :model/Card      {f1 :id} {:collection_id coll-id :last_used_at (fresh-instant)}
                     :model/Dashboard {f2 :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}
                     :model/Document  {f3 :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}
                     :model/Transform {f4 :id} {}]
        (let [stale-keys #{[:card s1] [:card s2] [:card s3] [:dashboard s4] [:dashboard s5]
                           [:document s6] [:document s7] [:transform s8]}
              fresh-keys #{[:card f1] [:dashboard f2] [:document f3] [:transform f4]}
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
          (testing "persisted findings carry finding_type + scope_collection_id + last_active_at + details"
            (let [row (finding-for rows :card s1)]
              (is (=? {:finding_type        :stale
                       ;; scope_collection_id is stamped at scan time from the entity's collection
                       :scope_collection_id coll-id
                       ;; threshold derived from the setting, not a literal — a default change must not desync
                       :details             {:threshold_days (cd.settings/content-diagnostics-stale-threshold-days)}
                       ;; last_active_at frozen from the card's last_used_at (top-level column, not in details)
                       :last_active_at      some?}
                      row))
              ;; details holds ONLY the threshold
              (is (= #{:threshold_days} (set (keys (:details row)))))))
          (testing "dashboard finding freezes last_active_at from last_viewed_at (per-entity-type alias)"
            (let [row (finding-for rows :dashboard s4)]
              (is (some? (:last_active_at row)))))
          (testing "never-used document (never viewed, created before the cutoff) lands with nil last_active_at"
            (let [row (finding-for rows :document s7)]
              (is (some? row))
              (is (nil? (:last_active_at row)))))
          (testing "never-ran transform (created before the cutoff) lands with nil last_active_at"
            (let [row (finding-for rows :transform s8)]
              (is (some? row))
              (is (nil? (:last_active_at row)))))
          (testing "denormalized columns (entity_name/created_at/creator_id/creator_name) are stamped at scan time"
            (let [row (finding-for rows :card s1)]
              (is (=? {:entity_name         some?
                       :entity_created_at   some?
                       :entity_creator_id   some?
                       :entity_creator_name some?}
                      row)))))))))

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
                                                       :entity_type :card
                                                       :entity_id [:in [resolved still]]
                                                       :invalidated_at nil)))]
            (testing "the re-flagged card stays active; the resolved one does not"
              (is (contains? active still))
              (is (not (contains? active resolved))))
            (testing "the resolved card's prior finding is soft-invalidated (kept + timestamped), not deleted"
              (let [rows (t2/select :model/ContentDiagnosticsFinding :entity_type :card :entity_id resolved)]
                (is (seq rows))                                     ; not hard-deleted — history retained
                (is (every? :invalidated_at rows))))))))))

(deftest scan-job-gated-on-premium-feature-test
  (let [scans (atom 0)]
    (mt/with-dynamic-fn-redefs [detect/scan! (fn [] (swap! scans inc))]
      (testing "the scheduled job body no-ops without the :content-diagnostics feature"
        (mt/with-premium-features #{}
          (#'cd.task/scan-when-enabled!)
          (is (zero? @scans))))
      (testing "the scheduled job body scans when the feature is present"
        (mt/with-premium-features #{:content-diagnostics}
          (#'cd.task/scan-when-enabled!)
          (is (= 1 @scans)))))))
