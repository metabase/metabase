(ns metabase-enterprise.remote-sync.source.ingestable-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.source.ingestable :as ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each test-helpers/clean-remote-sync-state)

(use-fixtures :once (fixtures/initialize :db))

(deftest ingestable-snapshot-test
  (testing "IngestableSnapshot wraps a snapshot and provides Ingestable interface"
    (let [mock-source (test-helpers/create-mock-source)
          ingestable (ingestable/->IngestableSnapshot (source.p/snapshot mock-source) (atom nil) (atom []))]

      (testing "ingest-list returns list of serdes paths"
        (let [paths (serialization/ingest-list ingestable)]
          (is (seq paths) "Should return non-empty list of paths")
          (is (every? vector? paths) "Each path should be a vector")
          (is (every? #(every? map? %) paths) "Each element in path should be a map")))

      (testing "ingest-one returns entity for a given path"
        (let [paths (serialization/ingest-list ingestable)
              first-path (first paths)
              entity (serialization/ingest-one ingestable first-path)]
          (is (map? entity) "Should return a map")
          (is (contains? entity :serdes/meta) "Should have serdes/meta key")))

      (testing "cache is populated after first ingest-list call"
        (let [ingestable (ingestable/->IngestableSnapshot (source.p/snapshot mock-source) (atom nil) (atom []))]
          (is (nil? @(:cache ingestable)) "Cache should be empty initially")
          (serialization/ingest-list ingestable)
          (is (map? @(:cache ingestable)) "Cache should be populated after ingest-list")
          (is (seq @(:cache ingestable)) "Cache should contain data"))))))

(deftest callback-ingestable-test
  (testing "CallbackIngestable wraps an ingestable and calls callback on ingest-one"
    (let [mock-source (test-helpers/create-mock-source)
          base-ingestable (ingestable/->IngestableSnapshot (source.p/snapshot mock-source) (atom nil) (atom []))
          calls (atom [])
          callback (fn [_ path] (swap! calls conj path))
          wrapped (ingestable/->CallbackIngestable base-ingestable callback)]

      (testing "ingest-list delegates to wrapped ingestable"
        (let [base-paths (serialization/ingest-list base-ingestable)
              wrapped-paths (serialization/ingest-list wrapped)]
          (is (= base-paths wrapped-paths) "Should return same paths as base ingestable")))

      (testing "ingest-one calls callback after loading entity"
        (let [paths (serialization/ingest-list wrapped)
              first-path (first paths)]
          (reset! calls [])
          (serialization/ingest-one wrapped first-path)
          (is (= 1 (count @calls)) "Callback should be called once")
          (is (= first-path (first @calls)) "Callback should receive the path")))

      (testing "callback is called for each ingest-one call"
        (let [paths (serialization/ingest-list wrapped)]
          (reset! calls [])
          (doseq [path (take 3 paths)]
            (serialization/ingest-one wrapped path))
          (is (= 3 (count @calls)) "Callback should be called three times"))))))

(deftest wrap-progress-ingestable-test
  (testing "wrap-progress-ingestable creates CallbackIngestable with progress tracking"
    ;; This test cannot use with-temp because the callback uses a separate connection to make
    ;; sure it is updating progress outside of the transaction serdes is using
    (mt/with-model-cleanup [:model/User :model/RemoteSyncTask]
      (let [user (first (t2/insert-returning-instances! :model/User {:first_name "Test"
                                                                     :last_name "User"
                                                                     :email "test2@example.com"
                                                                     :password "password123"}))
            task (first (t2/insert-returning-instances! :model/RemoteSyncTask {:sync_task_type "import"
                                                                               :initiated_by (:id user)}))
            task-id (:id task)
            mock-source (test-helpers/create-mock-source)
            base-ingestable (ingestable/->IngestableSnapshot (source.p/snapshot mock-source) (atom nil) (atom []))
            normalize 100]

        (testing "creates a CallbackIngestable"
          (let [wrapped (ingestable/wrap-progress-ingestable task-id normalize base-ingestable)]
            (is (instance? metabase_enterprise.remote_sync.source.ingestable.CallbackIngestable wrapped)
                "Should return CallbackIngestable instance")))

        (testing "updates task progress in database as items are ingested"
          (let [wrapped (ingestable/wrap-progress-ingestable task-id normalize base-ingestable)
                paths (serialization/ingest-list wrapped)
                total-paths (count paths)]

            (is (seq paths) "Should have paths to ingest")

            (let [initial-task (t2/select-one :model/RemoteSyncTask :id task-id)]
              (is (nil? (:progress initial-task)) "Progress should be nil initially"))

            (serialization/ingest-one wrapped (first paths))
            (let [task-after-first (t2/select-one :model/RemoteSyncTask :id task-id)]
              (is (some? (:progress task-after-first)) "Progress should be updated after first item")
              (is (< (abs (- (:progress task-after-first) (double (* (/ 1 total-paths) normalize)))) 0.01)
                  "Progress should reflect one item ingested")
              (is (some? (:last_progress_report_at task-after-first))
                  "last_progress_report_at should be set"))

            (serialization/ingest-one wrapped (second paths))
            (let [task-after-second (t2/select-one :model/RemoteSyncTask :id task-id)]
              (is (< (abs (- (:progress task-after-second) (double (* (/ 2 total-paths) normalize)))) 0.01)
                  "Progress should reflect two items ingested"))))

        (testing "progress reaches normalize value when all items ingested"
          (let [wrapped (ingestable/wrap-progress-ingestable task-id normalize base-ingestable)
                paths (serialization/ingest-list wrapped)]

            (doseq [path paths]
              (serialization/ingest-one wrapped path))

            (let [final-task (t2/select-one :model/RemoteSyncTask :id task-id)]
              (is (< (abs (- (:progress final-task) (double normalize))) 0.01)
                  "Progress should equal normalize value when all items ingested"))))))))

(deftest root-dependency-ingestable-test
  (testing "RootDependencyIngestable filters items based on root dependencies"
    (let [mock-source (test-helpers/create-mock-source)
          base-ingestable (ingestable/->IngestableSnapshot (source.p/snapshot mock-source) (atom nil) (atom []))]

      (testing "with no root dependencies, returns empty list"
        (let [wrapped (ingestable/wrap-root-dep-ingestable [] base-ingestable)
              paths (serialization/ingest-list wrapped)]
          (is (empty? paths) "Should return empty list when no root dependencies")))

      (testing "ingest-one delegates to wrapped ingestable"
        (let [paths (serialization/ingest-list base-ingestable)
              first-path (first paths)
              root-deps [{:model "Collection" :id "M-Q4pcV0qkiyJ0kiSWECl"}]
              wrapped (ingestable/wrap-root-dep-ingestable root-deps base-ingestable)
              entity (serialization/ingest-one wrapped first-path)]
          (is (map? entity) "Should return entity map from wrapped ingestable")))

      (testing "has dep-cache atom"
        (let [root-deps [{:model "Collection" :id "M-Q4pcV0qkiyJ0kiSWECl"}]
              wrapped (ingestable/wrap-root-dep-ingestable root-deps base-ingestable)]
          (is (map? @(:dep-cache wrapped)) "Should have dep-cache atom initialized as empty map"))))))

(deftest ingest-errors-test
  (testing "IngestableSnapshot collects parse errors and returns them via ingest-errors"
    (let [bad-yaml  "name: Bad Card\ndataset_query: [invalid\n"
          files     {"main" {"collections/coll01xxxxxxxxxxxxx_test/coll01xxxxxxxxxxxxx_test.yaml"
                             (test-helpers/generate-collection-yaml "coll01xxxxxxxxxxxxx" "Test")
                             "collections/coll01xxxxxxxxxxxxx_test/cards/bad-card.yaml"
                             bad-yaml}}
          snapshot  (source.p/snapshot (test-helpers/create-mock-source :initial-files files))
          ingestable (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))]

      (testing "ingest-list succeeds, skipping the bad file"
        (let [paths (serialization/ingest-list ingestable)]
          (is (seq paths) "Should return paths for valid files")))

      (testing "ingest-errors returns the parse failure"
        (let [errors (serialization/ingest-errors ingestable)]
          (is (= 1 (count errors)))
          (is (instance? Exception (first errors)))))))

  (testing "ingest-errors returns [] when all files parse successfully"
    (let [snapshot   (source.p/snapshot (test-helpers/create-mock-source))
          ingestable (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))]
      (serialization/ingest-list ingestable)
      (is (= [] (serialization/ingest-errors ingestable)))))

  (testing "ingest-errors returns [] before cache is populated"
    (let [bad-yaml  "name: Bad Card\ndataset_query: [invalid\n"
          files     {"main" {"collections/coll01xxxxxxxxxxxxx_test/coll01xxxxxxxxxxxxx_test.yaml"
                             (test-helpers/generate-collection-yaml "coll01xxxxxxxxxxxxx" "Test")
                             "collections/coll01xxxxxxxxxxxxx_test/cards/bad-card.yaml"
                             bad-yaml}}
          snapshot  (source.p/snapshot (test-helpers/create-mock-source :initial-files files))
          ingestable (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))]
      (is (= [] (serialization/ingest-errors ingestable))
          "Before ingest-list is called, ingest-errors should return [] not the real errors")))

  (testing "multiple bad files produce multiple errors"
    (let [bad-yaml-1 "name: Bad1\ndataset_query: [invalid\n"
          bad-yaml-2 "name: Bad2\ndataset_query: {broken\n"
          files      {"main" {"collections/coll01xxxxxxxxxxxxx_test/coll01xxxxxxxxxxxxx_test.yaml"
                              (test-helpers/generate-collection-yaml "coll01xxxxxxxxxxxxx" "Test")
                              "collections/coll01xxxxxxxxxxxxx_test/cards/bad1.yaml"
                              bad-yaml-1
                              "collections/coll01xxxxxxxxxxxxx_test/cards/bad2.yaml"
                              bad-yaml-2}}
          snapshot   (source.p/snapshot (test-helpers/create-mock-source :initial-files files))
          ingestable (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))]
      (serialization/ingest-list ingestable)
      (is (= 2 (count (serialization/ingest-errors ingestable)))
          "Each unparseable file should produce a separate error")))

  (testing "wrapper ingestables delegate ingest-errors"
    (let [bad-yaml  "name: Bad\ndataset_query: [invalid\n"
          files     {"main" {"collections/coll01xxxxxxxxxxxxx_test/coll01xxxxxxxxxxxxx_test.yaml"
                             (test-helpers/generate-collection-yaml "coll01xxxxxxxxxxxxx" "Test")
                             "collections/coll01xxxxxxxxxxxxx_test/cards/bad.yaml"
                             bad-yaml}}
          snapshot  (source.p/snapshot (test-helpers/create-mock-source :initial-files files))
          base      (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))
          callback  (ingestable/->CallbackIngestable base (fn [_ _]))
          root-dep  (ingestable/wrap-root-dep-ingestable [{:model "Collection" :id "coll01xxxxxxxxxxxxx"}] base)]
      ;; Trigger cache population
      (serialization/ingest-list base)

      (testing "CallbackIngestable delegates"
        (is (= 1 (count (serialization/ingest-errors callback)))))

      (testing "RootDependencyIngestable delegates"
        (is (= 1 (count (serialization/ingest-errors root-dep))))))))
