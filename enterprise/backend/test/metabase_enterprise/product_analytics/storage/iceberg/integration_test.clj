(ns ^:product-analytics/iceberg
 metabase-enterprise.product-analytics.storage.iceberg.integration-test
  "Integration tests for the Iceberg storage backend. These tests require the dev Iceberg stack
   (PostgreSQL catalog on localhost:5434) and are excluded from default CI runs via the
   :product-analytics/iceberg tag.

   The Iceberg write/read pipeline uses a local filesystem warehouse with the dev JDBC catalog.
   S3 connectivity is tested separately via the S3 client."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage.iceberg.buffer :as buffer]
   [metabase-enterprise.product-analytics.storage.iceberg.s3 :as iceberg.s3]
   [metabase-enterprise.product-analytics.storage.iceberg.test-util :as iceberg.tu]
   [metabase-enterprise.product-analytics.storage.iceberg.writer :as writer]
   [metabase.test.fixtures :as fixtures])
  (:import
   (java.time Instant OffsetDateTime ZoneOffset)
   (org.apache.iceberg.catalog Catalog Namespace SupportsNamespaces)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  iceberg.tu/with-iceberg-test-ns)

;;; ------------------------------------------- Catalog connectivity -------------------------------------------------

(deftest catalog-connects-and-lists-namespaces-test
  (testing "The JDBC catalog can list namespaces and our test namespace is present"
    (let [catalog    iceberg.tu/*test-catalog*
          namespaces (.listNamespaces ^SupportsNamespaces catalog)]
      (is (some? namespaces)
          "Should be able to list namespaces without error")
      (is (some #(= iceberg.tu/*test-namespace* %) namespaces)
          "The test namespace should appear in the list"))))

;;; -------------------------------------------- Table creation ------------------------------------------------------

(deftest ensure-tables-idempotent-test
  (testing "ensure-tables! creates all 4 PA tables and is idempotent"
    (writer/ensure-tables!)
    (let [tables-first (.listTables ^Catalog iceberg.tu/*test-catalog*
                                    ^Namespace iceberg.tu/*test-namespace*)]
      (is (= 4 (count tables-first))
          "Should create all 4 PA tables"))
    ;; Second call should be a no-op
    (writer/ensure-tables!)
    (let [tables-second (.listTables ^Catalog iceberg.tu/*test-catalog*
                                     ^Namespace iceberg.tu/*test-namespace*)]
      (is (= 4 (count tables-second))
          "Idempotent: still 4 tables after second call"))))

;;; --------------------------------------------- Write and read -----------------------------------------------------

(defn- now-odt
  ^OffsetDateTime []
  (.atOffset (Instant/now) ZoneOffset/UTC))

(deftest write-and-read-events-test
  (testing "write-events! writes records that can be read back via IcebergGenerics"
    (let [events [{:event_id   1001
                   :site_id    1
                   :session_id 1
                   :event_type 1
                   :event_name "home"
                   :url_path   "/home"
                   :created_at (now-odt)}
                  {:event_id   1002
                   :site_id    1
                   :session_id 1
                   :event_type 2
                   :event_name "signup"
                   :url_path   "/signup"
                   :created_at (now-odt)}]]
      (writer/write-events! events)
      (let [table       (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                    (iceberg.tu/test-table-id "pa_events"))
            all-records (iceberg.tu/read-all-records table)
            records     (filter #(#{1001 1002} (:event_id %)) all-records)]
        (is (= 2 (count records)))
        (is (= #{1 2} (set (map :event_type records))))
        (is (= #{"/home" "/signup"} (set (map :url_path records))))))))

(deftest write-and-read-sessions-test
  (testing "write-sessions! writes records that can be read back"
    (let [now      (now-odt)
          sessions [{:session_id   2001
                     :session_uuid (str (java.util.UUID/randomUUID))
                     :site_id      1
                     :browser      "Chrome"
                     :os           "macOS"
                     :device       "Desktop"
                     :created_at   now
                     :updated_at   now}]]
      (writer/write-sessions! sessions)
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_sessions"))
            records (iceberg.tu/read-all-records table)]
        (is (= 1 (count records)))
        (is (= 2001 (:session_id (first records))))
        (is (= "Chrome" (:browser (first records))))))))

(deftest write-and-read-sites-test
  (testing "write-sites! writes records to the unpartitioned sites table"
    (let [now   (now-odt)
          sites [{:id              1
                  :uuid            (str (java.util.UUID/randomUUID))
                  :name            "Test Site"
                  :allowed_domains "example.com"
                  :archived        false
                  :created_at      now
                  :updated_at      now}]]
      (writer/write-sites! sites)
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_sites"))
            records (iceberg.tu/read-all-records table)]
        (is (= 1 (count records)))
        (is (= "Test Site" (:name (first records))))
        (is (= false (:archived (first records))))))))

(deftest write-and-read-session-data-test
  (testing "write-session-data! writes records with timestamp field conversion"
    (let [now          (now-odt)
          session-data [{:session_id   3001
                         :data_key     "plan_type"
                         :string_value "pro"
                         :data_type    1
                         :created_at   now}
                        {:session_id   3001
                         :data_key     "signup_date"
                         :date_value   now
                         :data_type    2
                         :created_at   now}]]
      (writer/write-session-data! session-data)
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_session_data"))
            records (iceberg.tu/read-all-records table)]
        (is (= 2 (count records)))
        (is (= "plan_type" (:data_key (first records))))
        (is (= "pro" (:string_value (first records))))))))

;;; ------------------------------------------------ S3 access ------------------------------------------------------

(deftest s3-client-connectivity-test
  (testing "S3 client can connect and list objects in the configured bucket"
    (let [s3-available? (try
                          (with-open [_s (java.net.Socket. "localhost" (int 3900))]
                            true)
                          (catch Exception _ false))]
      (if-not s3-available?
        (println "Skipping S3 connectivity test: localhost:3900 unreachable")
        (let [client (iceberg.s3/create-s3-client)
              bucket "metabase-product-analytics"
              resp   (.listObjectsV2
                      client
                      (.build
                       (doto (software.amazon.awssdk.services.s3.model.ListObjectsV2Request/builder)
                         (.bucket bucket)
                         (.maxKeys (int 1)))))]
          (is (some? resp) "Should get a response from S3")
          (is (some? (.contents resp)) "Response should have a contents list"))))))

;;; ------------------------------------------ Buffer flush roundtrip -----------------------------------------------

(deftest buffer-flush-roundtrip-test
  (testing "offer -> drain -> write-events! -> read back from Iceberg"
    (let [buf    (buffer/create-buffer)
          now    (now-odt)
          events [{:event_id   5001
                   :site_id    1
                   :session_id 1
                   :event_type 1
                   :url_path   "/buffer-test"
                   :created_at now}
                  {:event_id   5002
                   :site_id    1
                   :session_id 1
                   :event_type 2
                   :url_path   "/buffer-test-2"
                   :created_at now}]]
      ;; Offer events into the buffer
      (doseq [e events]
        (buffer/offer! buf e))
      (is (= 2 (buffer/size buf)))
      ;; Drain and write
      (let [drained (buffer/drain! buf)]
        (is (= 2 (count drained)))
        (is (zero? (buffer/size buf)))
        (writer/write-events! drained))
      ;; Read back — events table may have records from other tests, so filter by event_ids
      (let [table       (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                    (iceberg.tu/test-table-id "pa_events"))
            all-records (iceberg.tu/read-all-records table)
            our-records (filter #(#{5001 5002} (:event_id %)) all-records)]
        (is (= 2 (count our-records)))))))
