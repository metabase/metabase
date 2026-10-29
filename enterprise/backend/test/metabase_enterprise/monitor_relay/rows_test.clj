(ns metabase-enterprise.monitor-relay.rows-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.monitor-relay.rows :as relay.rows]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test])
  (:import
   (java.time Instant LocalDateTime OffsetDateTime ZonedDateTime ZoneId ZoneOffset)))

(set! *warn-on-reflection* true)

(deftest ^:parallel timestamp-test
  (testing "timestamps are UTC ISO 8601 strings with milliseconds and Z"
    (is (= [{:ts "2026-10-27T22:04:05.123Z"}
            {:ts "2026-10-27T22:04:05.000Z"}
            {:ts "2026-10-28T03:04:05.123Z"}
            {:ts "2026-10-27T22:04:05.123Z"}
            {:ts "2026-10-27T22:04:05.123Z"}]
           (relay.rows/encode :login [{:ts (OffsetDateTime/of 2026 10 27 22 4 5 123456789 ZoneOffset/UTC)}
                                      {:ts (OffsetDateTime/of 2026 10 27 22 4 5 0 ZoneOffset/UTC)}
                                      {:ts (OffsetDateTime/of 2026 10 27 22 4 5 123000000 (ZoneOffset/ofHours -5))}
                                      {:ts (ZonedDateTime/of 2026 10 28 7 4 5 123000000 (ZoneId/of "Asia/Tokyo"))}
                                      {:ts (Instant/parse "2026-10-27T22:04:05.123456Z")}]))))
  (testing "a timestamp without a zone reads as UTC"
    (is (= [{:ts "2026-10-27T22:04:05.123Z"}]
           (relay.rows/encode :audit [{:ts (LocalDateTime/of 2026 10 27 22 4 5 123000000)}])))))

(deftest ^:parallel flag-test
  (testing "flags are booleans, whether the engine returns booleans or 0 and 1"
    (is (= [{:is_native_flag true, :has_error false, :card_is_public nil, :result_rows 1}]
           (relay.rows/encode :execution [{:is_native_flag 1, :has_error 0, :card_is_public nil, :result_rows 1}])))
    (is (= [{:has_access true} {:has_access false}]
           (relay.rows/encode :view [{:has_access true} {:has_access 0}])))
    (is (= [{:id 4, :field_id 4, :semantic_type_set true}]
           (relay.rows/encode :field_user_settings [{:id 4, :field_id 4, :semantic_type_set 1}]))))
  (testing "a literal 1 that is not a flag stays a number"
    (is (= [{:database_id 1, :active 1}]
           (relay.rows/encode :database [{:database_id 1, :active 1}])))))

(deftest ^:parallel text-test
  (testing "JSON and text columns are sent as stored, never parsed"
    (let [details "{\"emails\":[\"a@example.com\"]}"]
      (is (= [{:details_json details, :topic "card-create", :model_id nil}]
             (relay.rows/encode :audit [{:details_json details, :topic "card-create", :model_id nil}])))))
  (testing "a value of another type is sent as its string"
    (is (= [{:session_id "2a2b4f5e-0000-0000-0000-000000000000"}]
           (relay.rows/encode :login [{:session_id (parse-uuid "2a2b4f5e-0000-0000-0000-000000000000")}])))))

(def secret-key
  "A key for `MB_ENCRYPTION_SECRET_KEY` in the relay's tests."
  "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ=")

(deftest decrypt-test
  (encryption-test/with-secret-key secret-key
    (let [details "{\"emails\":[\"outside@example.com\"]}"
          uuid    "8f3e4c1a-1b2c-4d5e-8f90-a1b2c3d4e5f6"]
      (testing "the columns Metabase encrypts are decrypted"
        (is (= [{:channel_id 1, :details details}]
               (relay.rows/encode :pulse_channel [{:channel_id 1, :details (encryption/encrypt details)}])))
        (is (= [{:handler_id 1, :details details}]
               (relay.rows/encode :notification_recipient [{:handler_id 1, :details (encryption/encrypt details)}])))
        (is (= [{:card_id 1, :public_uuid uuid} {:card_id 2, :public_uuid nil}]
               (relay.rows/encode :card [{:card_id 1, :public_uuid (encryption/encrypt uuid)}
                                         {:card_id 2, :public_uuid nil}]))))
      (testing "a value stored as plaintext is sent as it is"
        (is (= [{:dashboard_id 1, :public_uuid uuid}]
               (relay.rows/encode :dashboard [{:dashboard_id 1, :public_uuid uuid}]))))
      (testing "a value that does not decrypt is sent as stored"
        (let [other (encryption/encrypt uuid {:secret-key (encryption/secret-key->hash "another key of 16+ chars")})]
          (is (= [{:card_id 1, :public_uuid other}]
                 (relay.rows/encode :card [{:card_id 1, :public_uuid other}])))))
      (testing "other kinds decrypt nothing"
        (let [stored (encryption/encrypt details)]
          (is (= [{:details_json stored}]
                 (relay.rows/encode :audit [{:details_json stored}]))))))))
