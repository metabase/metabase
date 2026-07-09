(ns metabase-enterprise.content-diagnostics.scan-test
  "The scan pipeline runs the instance-wide `stale` checker, persists a snapshot, and supersedes
  prior findings."
  (:require
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase-enterprise.content-diagnostics.scan :as scan]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase-enterprise.content-diagnostics.task.scan :as task.scan]
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
                     :model/Card      {stale-card-1 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Card      {stale-card-2 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Card      {stale-card-3 :id} {:collection_id coll-id :last_used_at (stale-instant)}
                     :model/Dashboard {stale-dash-1 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     :model/Dashboard {stale-dash-2 :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     :model/Document  {stale-doc :id} {:collection_id coll-id :last_viewed_at (stale-instant)}
                     ;; never-used arms: document never viewed (view_count 0; last_viewed_at is
                     ;; creation-stamped) / transform never ran — each + created before the cutoff
                     :model/Document  {never-viewed-doc :id} {:collection_id coll-id :created_at (stale-instant)}
                     ;; transforms live in the :transforms collection namespace, not regular collections —
                     ;; irrelevant to the instance-wide scan, so no collection at all
                     :model/Transform {never-ran-transform :id} {:created_at (stale-instant)}
                     ;; fresh: used just now (or, for the never-run transform, created just now) — must NOT be flagged
                     :model/Card      {fresh-card :id} {:collection_id coll-id :last_used_at (fresh-instant)}
                     :model/Dashboard {fresh-dash :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}
                     :model/Document  {fresh-doc :id} {:collection_id coll-id :last_viewed_at (fresh-instant)}
                     :model/Transform {fresh-transform :id} {}]
        (scan/scan!)
        (let [stale-keys #{[:card stale-card-1] [:card stale-card-2] [:card stale-card-3]
                           [:dashboard stale-dash-1] [:dashboard stale-dash-2]
                           [:document stale-doc] [:document never-viewed-doc]
                           [:transform never-ran-transform]}
              fresh-keys #{[:card fresh-card] [:dashboard fresh-dash]
                           [:document fresh-doc] [:transform fresh-transform]}
              ;; recover this run's scan_id from a guaranteed-flagged temp entity — scan! returns nil,
              ;; the persisted findings are the result
              scan-id    (t2/select-one-fn :scan_id :model/ContentDiagnosticsFinding
                                           :entity_type :card :entity_id stale-card-1)
              rows       (t2/select :model/ContentDiagnosticsFinding :scan_id scan-id)
              found-keys (set (map (juxt :entity_type :entity_id) rows))]
          (testing "the run persisted one scan_id batch of findings"
            (is (string? scan-id))
            (is (seq rows))
            (is (= 1 (count (into #{} (map :scan_id) rows)))))
          (testing "every stale temp entity produced a :stale finding; no fresh one did"
            (is (every? found-keys stale-keys))
            (is (empty? (set/intersection found-keys fresh-keys))))
          (testing "persisted findings carry finding_type + scope_collection_id + last_active_at + details"
            (let [row (finding-for rows :card stale-card-1)]
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
            (let [row (finding-for rows :dashboard stale-dash-1)]
              (is (some? (:last_active_at row)))))
          (testing "never-used document (never viewed, created before the cutoff) lands with nil last_active_at"
            (let [row (finding-for rows :document never-viewed-doc)]
              (is (some? row))
              (is (nil? (:last_active_at row)))))
          (testing "never-ran transform (created before the cutoff) lands with nil last_active_at"
            (let [row (finding-for rows :transform never-ran-transform)]
              (is (some? row))
              (is (nil? (:last_active_at row)))))
          (testing "denormalized columns (entity_name/created_at/creator_id/creator_name) are stamped at scan time"
            (let [row (finding-for rows :card stale-card-1)]
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
          (scan/scan!)                                            ; scan 1: both stale
          (t2/update! :model/Card resolved {:last_used_at (fresh-instant)})  ; resolved is now fresh
          (scan/scan!)                                            ; scan 2: only `still` is stale
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
    (mt/with-dynamic-fn-redefs [scan/scan! (fn [] (swap! scans inc))]
      (testing "the scheduled job body no-ops without the :content-diagnostics feature"
        (mt/with-premium-features #{}
          (#'task.scan/scan-when-enabled!)
          (is (zero? @scans))))
      (testing "the scheduled job body scans when the feature is present"
        (mt/with-premium-features #{:content-diagnostics}
          (#'task.scan/scan-when-enabled!)
          (is (= 1 @scans)))))))
