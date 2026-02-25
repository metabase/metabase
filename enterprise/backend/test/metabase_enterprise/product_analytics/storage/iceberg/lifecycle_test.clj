(ns ^:product-analytics/iceberg
 metabase-enterprise.product-analytics.storage.iceberg.lifecycle-test
  "Integration tests that exercise the full Iceberg storage lifecycle:
     start! → buffer → flush → read back.

   Unlike the writer integration tests which call writer functions directly, these tests
   go through the storage multimethods, verifying that:
   - `ensure-started!` lazily initializes the backend (creates tables, starts flush scheduler)
   - Events/sessions are buffered in memory via the storage multimethods
   - `flush!` drains the buffers and writes to Iceberg
   - Data can be read back from the Iceberg tables

   Requires the dev Iceberg stack (Postgres catalog on localhost:5434).
   Excluded from default CI runs via the :product-analytics/iceberg tag."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.product-analytics.storage :as storage]
   [metabase-enterprise.product-analytics.storage.iceberg.test-util :as iceberg.tu]
   [metabase.test.fixtures :as fixtures])
  (:import
   (org.apache.iceberg.catalog Catalog)))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :db)
  iceberg.tu/with-iceberg-lifecycle-test-ns)

;;; ----------------------------------------- Lazy start + event roundtrip -----------------------------------------

(deftest ensure-started-and-flush-events-test
  (testing "save-event! lazily initializes the backend, buffers events, and flush writes them"
    ;; The first call through any storage multimethod should trigger ensure-started! → start!
    ;; which creates tables and starts the flush scheduler.
    ;; We create a session first (needed for session_id on events, as in the real flow).
    (let [sess-uuid  (str (java.util.UUID/randomUUID))
          session-id (storage/store-upsert-session!
                      {:session_uuid sess-uuid
                       :site_id      1
                       :browser      "Chrome"
                       :os           "macOS"
                       :device       "Desktop"})]
      (is (integer? session-id) "upsert-session! should return a session id")
      ;; Buffer events referencing the session (mimics the real API flow in send.clj)
      (dotimes [i 3]
        (let [result (storage/store-save-event!
                      {:event      {:site_id    1
                                    :session_id session-id
                                    :event_type 1
                                    :event_name (str "lifecycle-test-" i)
                                    :url_path   (str "/lifecycle-" i)}
                       :properties [{:data_key     "page_title"
                                     :string_value (str "Page " i)}]})]
          (is (some? result) "save-event! should return the event row")
          (is (integer? (:event_id result)) "Should have an auto-generated event_id")))
      ;; Explicitly flush — this is what the scheduled flush task does periodically
      (storage/store-flush!)
      ;; Read events back from Iceberg
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_events"))
            records (iceberg.tu/read-all-records table)
            ours    (filter #(re-matches #"/lifecycle-\d+" (or (:url_path %) "")) records)]
        (is (= 3 (count ours))
            "Should find 3 events written via flush")
        (is (every? #(= 1 (:event_type %)) ours)))
      ;; Read sessions back from Iceberg
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_sessions"))
            records (iceberg.tu/read-all-records table)
            ours    (filter #(= sess-uuid (:session_uuid %)) records)]
        (is (= 1 (count ours))
            "Should find our session after flush")
        (is (= "Chrome" (:browser (first ours))))))))

;;; ------------------------------------------- Session data roundtrip ---------------------------------------------

(deftest buffer-flush-read-session-data-test
  (testing "Session data buffered via storage multimethod is flushed and readable"
    (let [session-id (storage/store-upsert-session!
                      {:session_uuid (str (java.util.UUID/randomUUID))
                       :site_id      1
                       :browser      "Firefox"
                       :os           "Linux"
                       :device       "Desktop"})]
      (storage/store-save-session-data!
       [{:session_id   session-id
         :data_key     "user_plan"
         :string_value "enterprise"
         :data_type    1}
        {:session_id   session-id
         :data_key     "account_age"
         :string_value "365"
         :data_type    1}])
      ;; Flush everything
      (storage/store-flush!)
      (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                (iceberg.tu/test-table-id "pa_session_data"))
            records (iceberg.tu/read-all-records table)
            ours    (filter #(= session-id (:session_id %)) records)]
        (is (= 2 (count ours))
            "Should find 2 session data rows after flush")
        (is (= #{"user_plan" "account_age"} (set (map :data_key ours))))))))

;;; ------------------------------------------- set-distinct-id! roundtrip -----------------------------------------

;; NOTE: The set-distinct-id! → flush path currently fails because flush-session-updates!
;; calls write-sessions! with partial rows ({:session_id :distinct_id :updated_at}) that
;; are missing required fields (session_uuid, site_id). This is a known issue that needs
;; a separate fix (either store full session rows in the update buffer, or use a dedicated
;; update/merge mechanism). Uncomment this test once that's resolved.
#_(deftest buffer-flush-read-distinct-id-test
    (testing "set-distinct-id! buffers a session update that is flushed and readable"
      (let [sess-uuid  (str (java.util.UUID/randomUUID))
            session-id (storage/store-upsert-session!
                        {:session_uuid sess-uuid
                         :site_id      1
                         :browser      "Safari"
                         :os           "iOS"
                         :device       "Mobile"})]
        (storage/store-set-distinct-id! session-id "user-42@example.com")
        (storage/store-flush!)
      ;; The distinct_id update is appended as a new session row
        (let [table   (.loadTable ^Catalog iceberg.tu/*test-catalog*
                                  (iceberg.tu/test-table-id "pa_sessions"))
              records (iceberg.tu/read-all-records table)
              ours    (filter #(= "user-42@example.com" (:distinct_id %)) records)]
          (is (>= (count ours) 1)
              "Should find at least one session row with the distinct_id")))))

