(ns metabase-enterprise.remote-sync.source.ingestable-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as rst]
   [metabase-enterprise.remote-sync.source.ingestable :as ingestable]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase-enterprise.remote-sync.test-helpers :as test-helpers]
   [metabase-enterprise.serialization.core :as ee.serialization]
   [metabase.audit-app.events.audit-log]
   [metabase.test.fixtures :as fixtures]
   [metabase.users.settings]))

(set! *warn-on-reflection* true)

(comment metabase.audit-app.events.audit-log/keep-me
         metabase.users.settings/keep-me)

(use-fixtures :each test-helpers/clean-remote-sync-state)

(use-fixtures :once (fixtures/initialize :db))

(def ^:private default-keys
  #{[:model/Collection "M-Q4pcV0qkiyJ0kiSWECl"]
    [:model/Card "f1C68pznmrpN1F5xFDj6d"]
    [:model/Dashboard "Q_jD-f-9clKLFZ2TfUG2h"]})

(defn- snapshot-ingestable
  ([] (snapshot-ingestable (test-helpers/create-mock-source)))
  ([source] (ingestable/->IngestableSnapshot (source.p/snapshot source) (atom nil) (atom []))))

(deftest ingestable-snapshot-test
  (testing "IngestableSnapshot wraps snapshot and provides Ingestable interface"
    (let [ingestable (snapshot-ingestable)]
      (testing "ingest-list returns [model ref] keys"
        (is (= default-keys (set (ee.serialization/ingest-list ingestable)))))
      (testing "ingest-many returns entities aligned with keys"
        (let [ks [[:model/Card "f1C68pznmrpN1F5xFDj6d"] [:model/Collection "M-Q4pcV0qkiyJ0kiSWECl"]]]
          (is (=? [{:name "Some Question" :entity_id "f1C68pznmrpN1F5xFDj6d" :serdes/meta [{:model "Card"}]}
                   {:name "Some Collection" :entity_id "M-Q4pcV0qkiyJ0kiSWECl" :serdes/meta [{:model "Collection"}]}]
                  (ee.serialization/ingest-many ingestable ks)))))
      (testing "ingest-many returns nil for unknown key"
        (is (= [nil] (ee.serialization/ingest-many ingestable [[:model/Card "nope"]])))))
    (testing "cache is populated after first ingest-list call"
      (let [ingestable (snapshot-ingestable)]
        (is (nil? @(:cache ingestable)) "Cache should be empty initially")
        (ee.serialization/ingest-list ingestable)
        (is (= default-keys (set (keys @(:cache ingestable)))))))))

(deftest cached-file-paths-test
  (testing "cached-file-paths reports repo file each entity was read from"
    (let [ingestable (snapshot-ingestable)]
      (ee.serialization/ingest-list ingestable)
      (is (= #{{:model_type "Collection" :entity_id "M-Q4pcV0qkiyJ0kiSWECl"
                :path "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/M-Q4pcV0qkiyJ0kiSWECl_some_collection.yaml"}
               {:model_type "Card" :entity_id "f1C68pznmrpN1F5xFDj6d"
                :path "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/cards/f1C68pznmrpN1F5xFDj6d_some_question.yaml"}
               {:model_type "Dashboard" :entity_id "Q_jD-f-9clKLFZ2TfUG2h"
                :path "collections/M-Q4pcV0qkiyJ0kiSWECl_some_collection/dashboards/Q_jD-f-9clKLFZ2TfUG2h_shared_dashboard.yaml"}}
             (set (ingestable/cached-file-paths ingestable)))))))

(deftest callback-ingestable-test
  (testing "CallbackIngestable wraps ingestable and calls callback on ingest-many"
    (let [base-ingestable (snapshot-ingestable)
          calls           (atom [])
          wrapped         (ingestable/->CallbackIngestable base-ingestable (fn [entities ks] (swap! calls conj [entities ks])))]
      (testing "ingest-list delegates to wrapped ingestable"
        (is (= (ee.serialization/ingest-list base-ingestable)
               (ee.serialization/ingest-list wrapped))))
      (testing "ingest-many calls callback once per batch with entities and keys"
        (let [ks (vec (take 2 (ee.serialization/ingest-list wrapped)))]
          (reset! calls [])
          (let [entities (ee.serialization/ingest-many wrapped ks)]
            (is (= [[entities ks]] @calls))
            (is (every? map? entities)))))
      (testing "callback is called for each ingest-many call"
        (reset! calls [])
        (doseq [k (take 3 (ee.serialization/ingest-list wrapped))]
          (ee.serialization/ingest-many wrapped [k]))
        (is (= 3 (count @calls)))))))

(deftest wrap-progress-ingestable-test
  (let [base-ingestable (snapshot-ingestable)
        ks              (vec (ee.serialization/ingest-list base-ingestable))
        total           (count ks)
        approx=         (fn [expected actual] (< (abs (- expected actual)) 1e-9))]
    (is (pos? total))
    (testing "n-th of 2N entity reads, each entity read once to order load and once to load it, reports lo + n/2N * (hi - lo)"
      (let [writes  (atom [])
            report  (rst/make-progress-reporter 1 {:throttle-ms 0 :write-fn (fn [f] (swap! writes conj f))})
            wrapped (ingestable/wrap-progress-ingestable report [0.05 0.7] base-ingestable)]
        (is (instance? metabase_enterprise.remote_sync.source.ingestable.CallbackIngestable wrapped))
        (doseq [k (concat ks ks)]
          (ee.serialization/ingest-many wrapped [k]))
        (is (= (* 2 total) (count @writes)) "one report per entity read")
        (is (every? true? (map approx=
                               (map #(+ 0.05 (* (/ % (* 2 total)) 0.65)) (range 1 (inc (* 2 total))))
                               @writes)))
        (is (= 0.7 (last @writes)) "last read lands on hi exactly")))
    (testing "batch of entities reports progress once for whole batch"
      (let [writes  (atom [])
            report  (rst/make-progress-reporter 1 {:throttle-ms 0 :write-fn (fn [f] (swap! writes conj f))})
            wrapped (ingestable/wrap-progress-ingestable report [0.05 0.7] base-ingestable)]
        (ee.serialization/ingest-many wrapped ks)
        (ee.serialization/ingest-many wrapped ks)
        (ee.serialization/ingest-many wrapped ks)
        (is (= 3 (count @writes)))
        (is (every? true? (map approx= [0.375 0.7 0.7] @writes)) "extra reads never go past hi")))
    (testing "missing entities do not advance progress"
      (let [writes  (atom [])
            report  (rst/make-progress-reporter 1 {:throttle-ms 0 :write-fn (fn [f] (swap! writes conj f))})
            wrapped (ingestable/wrap-progress-ingestable report [0.0 1.0] base-ingestable)]
        (ee.serialization/ingest-many wrapped [[:model/Card "nope"]])
        (is (= [] @writes))))
    (testing "failing report is logged and entity is still ingested"
      (let [wrapped (ingestable/wrap-progress-ingestable (fn [_] (throw (RuntimeException. "db down"))) [0.0 1.0] base-ingestable)]
        (is (some? (first (ee.serialization/ingest-many wrapped [(first ks)]))))))
    (testing "cancellation raised by report propagates and stops ingestion"
      (let [wrapped (ingestable/wrap-progress-ingestable (fn [_] (throw (ex-info "cancelled" {:cancelled? true}))) [0.0 1.0] base-ingestable)]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cancelled"
                              (ee.serialization/ingest-many wrapped [(first ks)])))))))

(deftest root-dependency-ingestable-test
  (testing "RootDependencyIngestable filters items based on root dependencies"
    (let [base-ingestable (snapshot-ingestable)]
      (testing "with no root dependencies, returns empty list"
        (is (empty? (ee.serialization/ingest-list (ingestable/wrap-root-dep-ingestable [] base-ingestable)))))
      (testing "keeps root and entities that refer to it, directly or transitively"
        (let [wrapped (ingestable/wrap-root-dep-ingestable [[:model/Collection "M-Q4pcV0qkiyJ0kiSWECl"]] base-ingestable)]
          (is (= default-keys (set (ee.serialization/ingest-list wrapped))))))
      (testing "keeps only dependents of card root"
        (let [wrapped (ingestable/wrap-root-dep-ingestable [[:model/Card "f1C68pznmrpN1F5xFDj6d"]] base-ingestable)]
          (is (= #{[:model/Card "f1C68pznmrpN1F5xFDj6d"] [:model/Dashboard "Q_jD-f-9clKLFZ2TfUG2h"]}
                 (set (ee.serialization/ingest-list wrapped))))))
      (testing "root absent from snapshot yields empty list"
        (let [wrapped (ingestable/wrap-root-dep-ingestable [[:model/Collection "absentabsentabsent123"]] base-ingestable)]
          (is (empty? (ee.serialization/ingest-list wrapped)))))
      (testing "ingest-many delegates to wrapped ingestable"
        (let [wrapped (ingestable/wrap-root-dep-ingestable [[:model/Collection "M-Q4pcV0qkiyJ0kiSWECl"]] base-ingestable)]
          (is (=? [{:entity_id "M-Q4pcV0qkiyJ0kiSWECl"}]
                  (ee.serialization/ingest-many wrapped [[:model/Collection "M-Q4pcV0qkiyJ0kiSWECl"]]))))))))

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
        (let [paths (ee.serialization/ingest-list ingestable)]
          (is (seq paths) "Should return paths for valid files")))
      (testing "ingest-errors returns the parse failure"
        (let [errors (ee.serialization/ingest-errors ingestable)]
          (is (= 1 (count errors)))
          (is (instance? Exception (first errors))))))))

(deftest ingest-errors-test-2
  (testing "ingest-errors returns [] when all files parse successfully"
    (let [snapshot   (source.p/snapshot (test-helpers/create-mock-source))
          ingestable (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))]
      (ee.serialization/ingest-list ingestable)
      (is (= [] (ee.serialization/ingest-errors ingestable))))))

(deftest ingest-errors-test-3
  (testing "ingest-errors returns [] before cache is populated"
    (let [bad-yaml  "name: Bad Card\ndataset_query: [invalid\n"
          files     {"main" {"collections/coll01xxxxxxxxxxxxx_test/coll01xxxxxxxxxxxxx_test.yaml"
                             (test-helpers/generate-collection-yaml "coll01xxxxxxxxxxxxx" "Test")
                             "collections/coll01xxxxxxxxxxxxx_test/cards/bad-card.yaml"
                             bad-yaml}}
          snapshot  (source.p/snapshot (test-helpers/create-mock-source :initial-files files))
          ingestable (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))]
      (is (= [] (ee.serialization/ingest-errors ingestable))
          "Before ingest-list is called, ingest-errors should return [] not the real errors"))))

(deftest ingest-errors-test-4
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
      (ee.serialization/ingest-list ingestable)
      (is (= 2 (count (ee.serialization/ingest-errors ingestable)))
          "Each unparseable file should produce a separate error"))))

(deftest ingest-errors-test-5
  (testing "wrapper ingestables delegate ingest-errors"
    (let [bad-yaml  "name: Bad\ndataset_query: [invalid\n"
          files     {"main" {"collections/coll01xxxxxxxxxxxxx_test/coll01xxxxxxxxxxxxx_test.yaml"
                             (test-helpers/generate-collection-yaml "coll01xxxxxxxxxxxxx" "Test")
                             "collections/coll01xxxxxxxxxxxxx_test/cards/bad.yaml"
                             bad-yaml}}
          snapshot  (source.p/snapshot (test-helpers/create-mock-source :initial-files files))
          base      (ingestable/->IngestableSnapshot snapshot (atom nil) (atom []))
          callback  (ingestable/->CallbackIngestable base (fn [_ _]))
          root-dep  (ingestable/wrap-root-dep-ingestable [[:model/Collection "coll01xxxxxxxxxxxxx"]] base)]
      (ee.serialization/ingest-list base)
      (testing "CallbackIngestable delegates"
        (is (= 1 (count (ee.serialization/ingest-errors callback)))))
      (testing "RootDependencyIngestable delegates"
        (is (= 1 (count (ee.serialization/ingest-errors root-dep))))))))
