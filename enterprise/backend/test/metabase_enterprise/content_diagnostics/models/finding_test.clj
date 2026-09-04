(ns metabase-enterprise.content-diagnostics.models.finding-test
  "Schema ↔ model contract for `content_diagnostics_finding`: a round-trip pins that the migration's
  columns and the model's `deftransforms` agree on every supported app-db (H2 locally; the CI backend
  matrices re-run this against Postgres and MySQL)."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.models.finding :as finding]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
   [metabase-enterprise.content-diagnostics.test-util :as cd.test-util]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest finding-round-trip-test
  (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
    (let [fid (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                               {:scan_id      "round-trip"
                                                :entity_type  :card
                                                :entity_id    1
                                                :finding_type :stale
                                                :details      {:threshold_days 90}}))
          row (t2/select-one :model/ContentDiagnosticsFinding :id fid)]
      (testing "keyword + JSON transforms round-trip; detected_at defaults; rows start active"
        (is (=? {:scan_id        "round-trip"
                 :entity_type    :card
                 :finding_type   :stale
                 :details        {:threshold_days 90}
                 :detected_at    some?
                 :invalidated_at nil}
                row)))
      (testing "stamping invalidated_at round-trips (the active-set filter's column)"
        (t2/update! :model/ContentDiagnosticsFinding fid {:invalidated_at (t/offset-date-time)})
        (is (some? (:invalidated_at (t2/select-one :model/ContentDiagnosticsFinding :id fid))))))))

(deftest stale-threshold-setting-default-test
  (testing "the staleness window defaults to 90 days"
    (is (= 90 (cd.settings/content-diagnostics-stale-threshold-days)))))

(deftest finding-retention-setting-default-test
  (testing "invalidated findings are kept for 30 days before the trimmer deletes them"
    (is (= 30 (cd.settings/content-diagnostics-finding-retention-days)))))

(deftest slow-threshold-setting-defaults-test
  (testing "the slow-card query-time threshold defaults to 15 seconds"
    (is (= 15 (cd.settings/content-diagnostics-slow-card-threshold-seconds))))
  (testing "the slow-transform run-time threshold defaults to 60 seconds"
    (is (= 60 (cd.settings/content-diagnostics-slow-transform-threshold-seconds)))))

(deftest imbalanced-threshold-setting-defaults-test
  (testing "crowded: collection >100 direct items"
    (is (= 100 (cd.settings/content-diagnostics-crowded-collection-threshold-items))))
  (testing "crowded: dashboard >20 dashcards on any one tab"
    (is (= 20 (cd.settings/content-diagnostics-crowded-dashboard-threshold-dashcards-per-tab))))
  (testing "crowded: dashboard >5 tabs"
    (is (= 5 (cd.settings/content-diagnostics-crowded-dashboard-threshold-tabs))))
  (testing "crowded: document >20 embedded cards"
    (is (= 20 (cd.settings/content-diagnostics-crowded-document-threshold-cards))))
  (testing "sparse: non-empty collection <5 direct items"
    (is (= 5 (cd.settings/content-diagnostics-sparse-collection-threshold-items))))
  (testing "sparse: non-empty dashboard <4 dashcards total"
    (is (= 4 (cd.settings/content-diagnostics-sparse-dashboard-threshold-dashcards)))))

;; `duplicated` has no settings-defaults test: a duplicate is definitionally a cluster of >= 2, so there
;; is no threshold to configure.

(deftest duplicated-details-round-trip-test
  (testing "the duplicated details envelope survives the JSON round-trip"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (let [details {:normalized_name      "orders by month"
                     :duplicate_entity_ids [10 11]}
            fid     (first (t2/insert-returning-pks! :model/ContentDiagnosticsFinding
                                                     {:scan_id         "dup-round-trip"
                                                      :entity_type     :card
                                                      :entity_id       1
                                                      :finding_type    :duplicated
                                                      :duplicate_count 2
                                                      :details         details}))
            row     (t2/select-one :model/ContentDiagnosticsFinding :id fid)]
        (is (= details (:details row)))
        (is (= 2 (:duplicate_count row)))))))

;;; ----------------------------------- trimming invalidated findings -----------------------------------

(def ^:private long-ago
  "Cutoff for every trim below. Years back, so a run matches only this suite's own rows - at a cutoff
  of `now` it would delete whatever expired findings another suite left in the shared app DB."
  (t/minus (t/offset-date-time) (t/years 5)))

(defn- insert-finding!
  [entity-id invalidated-at]
  (cd.test-util/insert-finding! "finding-trim-test" entity-id invalidated-at))

(deftest delete-invalidated-before-cutoff-test
  (testing "only findings invalidated before the cutoff are deleted"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (let [old    (insert-finding! 1 (t/minus long-ago (t/days 1)))
            recent (insert-finding! 2 (t/plus long-ago (t/days 1)))]
        (finding/delete-invalidated-before! long-ago)
        (is (= #{recent}
               (t2/select-pks-set :model/ContentDiagnosticsFinding
                                  {:where [:in :id [old recent]]})))))))

(deftest delete-invalidated-before-spares-active-findings-test
  (testing "active findings (invalidated_at NULL) survive however old they are"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      ;; the expired peer keeps the assertion discriminating - without it, a trim that deleted
      ;; nothing at all would pass just as well
      (let [active  (insert-finding! 3 nil)
            expired (insert-finding! 4 (t/minus long-ago (t/days 1)))]
        (finding/delete-invalidated-before! long-ago)
        (is (= #{active}
               (t2/select-pks-set :model/ContentDiagnosticsFinding
                                  {:where [:in :id [active expired]]})))))))

(deftest delete-invalidated-before-clears-more-than-one-batch-test
  (testing "every matching finding is deleted, not just the first batch"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (let [ids (mapv #(insert-finding! % (t/minus long-ago (t/days 1))) (range 1000 1005))]
        ;; the count is what pins this - stopping after one batch would return 2, not 5
        (is (= 5 (with-redefs [finding/delete-batch-size 2]
                   (finding/delete-invalidated-before! long-ago))))
        (is (empty? (t2/select-pks-set :model/ContentDiagnosticsFinding
                                       {:where [:in :id ids]})))))))
