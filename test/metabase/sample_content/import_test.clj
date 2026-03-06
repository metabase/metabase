(ns metabase.sample-content.import-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.appearance.core :as appearance]
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

(deftest import-error-does-not-block-startup-test
  (testing "If import throws, it's caught and logged — doesn't propagate"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db!)
      (sample-data/extract-and-sync-sample-database!)
      (with-redefs [sample-content.import/do-import! (fn [] (throw (ex-info "boom" {})))]
        ;; should not throw
        (is (nil? (sample-content.import/import!)))))))
