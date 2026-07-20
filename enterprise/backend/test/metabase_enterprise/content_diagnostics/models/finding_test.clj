(ns metabase-enterprise.content-diagnostics.models.finding-test
  "Schema ↔ model contract for `content_diagnostics_finding`: a round-trip pins that the migration's
  columns and the model's `deftransforms` agree on every supported app-db (H2 locally; the CI backend
  matrices re-run this against Postgres and MySQL)."
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase-enterprise.content-diagnostics.settings :as cd.settings]
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

(deftest slow-threshold-setting-defaults-test
  (testing "the slow-card query-time threshold defaults to 15 seconds"
    (is (= 15 (cd.settings/content-diagnostics-slow-card-threshold-seconds))))
  (testing "the slow-transform run-time threshold defaults to 60 seconds"
    (is (= 60 (cd.settings/content-diagnostics-slow-transform-threshold-seconds)))))

;; `duplicated` has no settings-defaults test: a duplicate is definitionally a cluster of >= 2, so there
;; is no threshold to configure.

(deftest duplicated-details-round-trip-test
  (testing "the duplicated details envelope - a nested matches vector - survives the JSON round-trip"
    (mt/with-model-cleanup [:model/ContentDiagnosticsFinding]
      (let [details {:matches              [{:match_type "name" :entity_ids [10 11]}]
                     :normalized_name      "orders by month"
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
