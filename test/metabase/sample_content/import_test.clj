(ns metabase.sample-content.import-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.appearance.core :as appearance]
   [metabase.sample-content.export :as sample-content.export]
   [metabase.sample-content.import :as sample-content.import]
   [metabase.sample-data.core :as sample-data]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Guard tests -------------------------------------------------------

(deftest should-import?-no-sample-db-test
  (testing "should-import? returns false when there's no sample database"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (is (false? (#'sample-content.import/should-import?))))))

(deftest should-import?-already-imported-test
  (testing "should-import? returns false when example-dashboard-id is already set"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      ;; Simulate that import already ran by inserting the setting
      (mt/with-temporary-setting-values [example-dashboard-id 42]
        (is (false? (#'sample-content.import/should-import?)))))))

(deftest should-import?-disabled-via-config-test
  (testing "should-import? returns false when MB_LOAD_SAMPLE_CONTENT=false"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      (mt/with-temp-env-var-value! [:mb-load-sample-content "false"]
        (is (false? (#'sample-content.import/should-import?)))))))

(deftest should-import?-positive-test
  (testing "should-import? returns true on a fresh install with sample DB synced"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      (is (true? (#'sample-content.import/should-import?))))))

;;; ------------------------------------------------ Import tests ------------------------------------------------------

(deftest import-integration-test
  (testing "Full import creates collections, cards, dashboards, and sets example-dashboard-id"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      (#'sample-content.import/do-import!)
      (testing "At least one sample collection exists"
        (is (t2/exists? :model/Collection :is_sample true)))
      (testing "At least one card was created"
        (is (pos? (t2/count :model/Card))))
      (testing "The example dashboard was created"
        (is (t2/exists? :model/Dashboard :entity_id "xBLdW9FsgRuB2HGhWiBa_")))
      (testing "example-dashboard-id setting was set"
        (is (some? (appearance/example-dashboard-id)))))))

(deftest import-idempotency-test
  (testing "Calling import! a second time is a no-op because example-dashboard-id is already set"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      (#'sample-content.import/do-import!)
      (let [dash-count-before (t2/count :model/Dashboard)
            card-count-before (t2/count :model/Card)]
        ;; import! (the public fn) should see example-dashboard-id is set and skip
        (sample-content.import/import!)
        (is (= dash-count-before (t2/count :model/Dashboard))
            "No new dashboards should be created on second import")
        (is (= card-count-before (t2/count :model/Card))
            "No new cards should be created on second import")))))

(defn- strip-volatile
  "Remove fields that legitimately change between export runs (e.g. the current
  Metabase version stamped onto cards). Keep everything else so the round-trip
  test catches serdes-shape drift."
  [entities]
  (mapv #(dissoc % :metabase_version) entities))

(deftest round-trip-test
  (testing "Each entity type round-trips: re-extracting after import matches the source EDN.
           This catches serdes breaking changes — if a future refactor drops fields, renames
           portable refs, or changes normalization, this test will fail loudly and force us
           to regenerate sample-content.edn (or fix the serdes regression) instead of
           shipping broken sample content."
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      (#'sample-content.import/do-import!)
      (let [source         (#'sample-content.import/load-edn "sample-content.edn")
            collection-ids (t2/select-fn-set :id :model/Collection :is_sample true)
            re-extracted   {:collections (#'sample-content.export/extract-collections)
                            :cards       (#'sample-content.export/extract-cards collection-ids)
                            :dashboards  (#'sample-content.export/extract-dashboards collection-ids)
                            :documents   (#'sample-content.export/extract-documents collection-ids)}]
        (doseq [k [:collections :cards :dashboards :documents]]
          (testing (str k " round-trip")
            (is (= (count (get source k)) (count (get re-extracted k)))
                "entity count must match source EDN")
            (is (= (strip-volatile (get source k))
                   (strip-volatile (get re-extracted k)))
                "each entity must re-extract identically to the source EDN")))))))

(deftest import-error-does-not-block-startup-test
  (testing "If import throws, it's caught and logged — doesn't propagate"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      (with-redefs [sample-content.import/do-import! (fn [] (throw (ex-info "boom" {})))]
        ;; should not throw
        (is (nil? (sample-content.import/import!)))))))
