(ns ^:product-analytics/iceberg
 metabase-enterprise.product-analytics.storage.iceberg.s3-integration-test
  "Integration tests that exercise the full Iceberg write pipeline against a real S3-compatible
   service (Garage on localhost:3900). These tests verify that both staged and native S3 write
   paths work end-to-end, including metadata/manifest writes during commit.

   Requires the dev Iceberg stack (Postgres catalog on localhost:5434) AND Garage on localhost:3900.
   Excluded from default CI runs via the :product-analytics/iceberg tag."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage.iceberg.settings :as iceberg.settings]
   [metabase-enterprise.product-analytics.storage.iceberg.test-util :as iceberg.tu]
   [metabase-enterprise.product-analytics.storage.iceberg.writer :as writer]
   [metabase.test.fixtures :as fixtures])
  (:import
   (java.time Instant OffsetDateTime ZoneOffset)
   (org.apache.iceberg.catalog Catalog)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  iceberg.tu/with-iceberg-s3-test-ns)

(defn- now-odt
  ^OffsetDateTime []
  (.atOffset (Instant/now) ZoneOffset/UTC))

;;; ---------------------------------------------- Staged upload path ------------------------------------------------

(deftest write-events-staged-s3-test
  (testing "write-events! with staged uploads writes data to S3 and reads it back"
    (writer/ensure-tables!)
    (let [events [{:event_id   8001
                   :site_id    1
                   :session_id 1
                   :event_type "pageview"
                   :event_name "staged-test"
                   :url_path   "/staged-s3-test"
                   :created_at (now-odt)}
                  {:event_id   8002
                   :site_id    1
                   :session_id 1
                   :event_type "click"
                   :event_name "staged-click"
                   :url_path   "/staged-s3-click"
                   :created_at (now-odt)}]]
      (with-redefs [iceberg.settings/product-analytics-iceberg-s3-staging-uploads (constantly true)]
        (writer/write-events! events))
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_events"))
            records (iceberg.tu/read-all-records table)
            ours    (filter #(#{8001 8002} (:event_id %)) records)]
        (is (= 2 (count ours))
            "Should write 2 events via staged upload to S3")
        (is (= #{"pageview" "click"} (set (map :event_type ours))))
        (is (= #{"/staged-s3-test" "/staged-s3-click"} (set (map :url_path ours))))))))

;;; ---------------------------------------------- Native upload path ------------------------------------------------

(deftest write-events-native-s3-test
  (testing "write-events! with native S3FileIO writes data to S3 and reads it back"
    (writer/ensure-tables!)
    (let [events [{:event_id   8101
                   :site_id    1
                   :session_id 1
                   :event_type "pageview"
                   :event_name "native-test"
                   :url_path   "/native-s3-test"
                   :created_at (now-odt)}
                  {:event_id   8102
                   :site_id    1
                   :session_id 1
                   :event_type "click"
                   :event_name "native-click"
                   :url_path   "/native-s3-click"
                   :created_at (now-odt)}]]
      (with-redefs [iceberg.settings/product-analytics-iceberg-s3-staging-uploads (constantly false)]
        (writer/write-events! events))
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_events"))
            records (iceberg.tu/read-all-records table)
            ours    (filter #(#{8101 8102} (:event_id %)) records)]
        (is (= 2 (count ours))
            "Should write 2 events via native S3FileIO")
        (is (= #{"pageview" "click"} (set (map :event_type ours))))
        (is (= #{"/native-s3-test" "/native-s3-click"} (set (map :url_path ours))))))))

;;; ------------------------------------------- Sessions via S3 ----------------------------------------------------

(deftest write-sessions-s3-test
  (testing "write-sessions! writes session data to S3-backed Iceberg table"
    (writer/ensure-tables!)
    (let [now      (now-odt)
          sessions [{:session_id   8201
                     :session_uuid (str (java.util.UUID/randomUUID))
                     :site_id      1
                     :browser      "Firefox"
                     :os           "Linux"
                     :device       "Desktop"
                     :created_at   now
                     :updated_at   now}]]
      (with-redefs [iceberg.settings/product-analytics-iceberg-s3-staging-uploads (constantly true)]
        (writer/write-sessions! sessions))
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_sessions"))
            records (iceberg.tu/read-all-records table)
            ours    (filter #(= 8201 (:session_id %)) records)]
        (is (= 1 (count ours)))
        (is (= "Firefox" (:browser (first ours))))))))
