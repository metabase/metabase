(ns metabase.transforms-base.util-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.sync.sync :as sync]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.util.date-2 :as u.date]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Merge target helpers -------------------------------------------------

(deftest merge-target?-test
  (testing "true only for a table-incremental target with a merge strategy"
    (is (transforms-base.u/merge-target?
         {:target {:type "table-incremental"
                   :target-incremental-strategy {:type "merge" :unique-key [{:name "id"}]}}}))
    (is (not (transforms-base.u/merge-target?
              {:target {:type "table-incremental"
                        :target-incremental-strategy {:type "append"}}})))
    (is (not (transforms-base.u/merge-target? {:target {:type "table"}})))))

(deftest merge-target-unique-key-test
  (testing "returns the physical column names of the merge key"
    (is (= ["id"]
           (transforms-base.u/merge-target-unique-key
            {:target {:target-incremental-strategy {:type "merge" :unique-key [{:name "id"}]}}})))
    (is (= ["order_id" "region"]
           (transforms-base.u/merge-target-unique-key
            {:target {:target-incremental-strategy
                      {:type "merge" :unique-key [{:name "order_id"} {:name "region"}]}}}))))
  (testing "nil when the target isn't a merge target"
    (is (nil? (transforms-base.u/merge-target-unique-key
               {:target {:target-incremental-strategy {:type "append"}}})))))

(deftest validate-merge-unique-key!-test
  (testing "returns the key when every column is present in the target columns"
    (is (= ["id"] (transforms-base.u/validate-merge-unique-key! ["id"] ["id" "status"])))
    (is (= ["a" "b"] (transforms-base.u/validate-merge-unique-key! ["a" "b"] ["a" "b" "c"]))))
  (testing "throws when a key column is not among the target columns"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"not present in the target"
         (transforms-base.u/validate-merge-unique-key! ["id" "ghost"] ["id" "status"])))
    (testing "the thrown error carries a user-facing :transform-message"
      (is (-> (try
                (transforms-base.u/validate-merge-unique-key! ["ghost"] ["id"])
                (catch clojure.lang.ExceptionInfo e
                  (ex-data e)))
              :transform-message
              some?)))))

(deftest throw-if-db-routing-enabled!-oss-test
  (testing "on OSS (no :database-routing premium feature) the check is a no-op"
    (mt/with-premium-features #{}
      (is (nil? (transforms-base.u/throw-if-db-routing-enabled!
                 {:name "OSS transform"}
                 (mt/db))))))
  (when config/ee-available?
    (testing "with :database-routing premium feature enabled, the check throws on a routing-enabled database"
      (mt/with-premium-features #{:database-routing}
        (mt/with-temp [:model/DatabaseRouter _ {:database_id    (mt/id)
                                                :user_attribute "db_name"}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #".*database routing turned on"
               (transforms-base.u/throw-if-db-routing-enabled!
                {:name "Routing transform"}
                (mt/db)))))))))

(deftest activate-table-syncs-despite-disable-auto-sync-test
  (testing "disable-auto-sync gates *automatic* syncs only; a transform finalizing its"
    (testing "output table still calls sync/sync-table! so the new table's fields are populated."
      (let [calls (atom 0)]
        (mt/with-temp [:model/Table _ {:db_id  (mt/id)
                                       :schema nil
                                       :name   "disable_auto_sync_target"}]
          (with-redefs [sync/sync-table! (fn [_] (swap! calls inc))]
            (mt/with-temporary-setting-values [disable-auto-sync true]
              (transforms-base.u/activate-table-and-mark-computed!
               (mt/db)
               {:type "table" :schema nil :name "disable_auto_sync_target"}))
            (is (= 1 @calls)
                "Expected the transform path to run sync/sync-table! exactly once with disable-auto-sync on.")))))))

(deftest ^:parallel full-incremental-run?-test
  (testing "true for an incremental transform with no checkpoint yet"
    (is (true? (transforms-base.u/full-incremental-run?
                {:target {:type "table-incremental"} :last_checkpoint_value nil}))))
  (testing "false for an incremental transform that has already recorded a watermark"
    (is (false? (transforms-base.u/full-incremental-run?
                 {:target {:type "table-incremental"} :last_checkpoint_value "42"}))))
  (testing "false for non-incremental targets regardless of checkpoint value"
    (is (false? (transforms-base.u/full-incremental-run?
                 {:target {:type "table"} :last_checkpoint_value nil})))
    (is (false? (transforms-base.u/full-incremental-run?
                 {:target {:type :table} :last_checkpoint_value nil}))))
  (testing "accepts both string and keyword target types"
    (is (true? (transforms-base.u/full-incremental-run?
                {:target {:type :table-incremental} :last_checkpoint_value nil})))))

(deftest ^:parallel supported-checkpoint-column?-test
  (testing "numeric and date/datetime columns are supported"
    (is (transforms-base.u/supported-checkpoint-column? {:base-type :type/Integer}))
    (is (transforms-base.u/supported-checkpoint-column? {:base-type :type/Float}))
    (is (transforms-base.u/supported-checkpoint-column? {:base-type :type/Date}))
    (is (transforms-base.u/supported-checkpoint-column? {:base-type :type/DateTime}))
    (is (transforms-base.u/supported-checkpoint-column? {:base-type :type/DateTimeWithTZ}))
    (is (transforms-base.u/supported-checkpoint-column? {:base-type :type/Instant})))
  (testing "coerced columns count via their effective type"
    (is (transforms-base.u/supported-checkpoint-column? {:base-type      :type/BigInteger
                                                         :effective-type :type/Instant})))
  (testing "time-only and non-orderable columns are not supported"
    (is (not (transforms-base.u/supported-checkpoint-column? {:base-type :type/Time})))
    (is (not (transforms-base.u/supported-checkpoint-column? {:base-type :type/TimeWithTZ})))
    (is (not (transforms-base.u/supported-checkpoint-column? {:base-type :type/Text})))
    (is (not (transforms-base.u/supported-checkpoint-column? {:base-type :type/Boolean})))))

(deftest ^:parallel apply-lookback-test
  (let [apply-lookback @#'transforms-base.u/apply-lookback]
    (testing "temporal checkpoints are pushed back by value units"
      (is (= (t/local-date-time 2026 1 27 21 0 4)
             (apply-lookback (t/local-date-time 2026 1 31 21 0 4) {:base-type :type/DateTime} {:value 4 :unit "day"})))
      (is (= (t/local-date-time 2026 1 31 19 0 4)
             (apply-lookback (t/local-date-time 2026 1 31 21 0 4) {:base-type :type/DateTime} {:value 2 :unit "hour"})))
      (is (= (t/local-date 2026 1 24)
             (apply-lookback (t/local-date 2026 1 31) {:base-type :type/Date} {:value 1 :unit "week"}))))
    (testing "a coerced numeric column (e.g. a unix timestamp) is temporal via its effective type"
      (is (= (u.date/parse "2026-01-30T21:00:04Z")
             (apply-lookback (u.date/parse "2026-01-31T21:00:04Z")
                             {:base-type :type/BigInteger :effective-type :type/Instant}
                             {:value 1 :unit "day"}))))
    (testing "a lookback on a non-temporal checkpoint throws a user-facing error"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supported for date or datetime"
           (apply-lookback (biginteger 42) {:base-type :type/Integer} {:value 4 :unit "day"}))))
    (testing "a lookback on a time-only checkpoint throws a user-facing error"
      ;; time-only watermarks wrap at midnight, and day-based units would throw inside u.date/add
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supported for date or datetime"
           (apply-lookback (t/local-time 21 0 4) {:base-type :type/Time} {:value 2 :unit "hour"})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"only supported for date or datetime"
           (apply-lookback (t/offset-time 21 0 4) {:base-type :type/TimeWithTZ} {:value 1 :unit "day"}))))
    (testing "a lookback without a unit throws a user-facing error"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"requires a unit"
           (apply-lookback (t/local-date-time 2026 1 31 21 0 4) {:base-type :type/DateTime} {:value 4}))))
    (testing "a lookback with a non-positive value throws instead of silently skipping data"
      ;; a negative window would move `lo` forward past the watermark, permanently skipping rows
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"positive integer value"
           (apply-lookback (t/local-date-time 2026 1 31 21 0 4) {:base-type :type/DateTime} {:value 0 :unit "day"})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"positive integer value"
           (apply-lookback (t/local-date-time 2026 1 31 21 0 4) {:base-type :type/DateTime} {:value -4 :unit "day"}))))))

(deftest ^:parallel checkpoint-compare-test
  (let [checkpoint-compare @#'transforms-base.u/checkpoint-compare]
    (testing "numeric values compare numerically across numeric classes"
      (is (neg? (checkpoint-compare :type/Integer (biginteger 41) 42)))
      (is (zero? (checkpoint-compare :type/Integer (biginteger 42) 42))))
    (testing "temporal values compare as instants even across temporal classes"
      (is (neg? (checkpoint-compare :type/DateTimeWithTZ
                                    (t/instant "2026-01-30T10:00:00Z")
                                    (t/offset-date-time "2026-01-31T10:00:00Z"))))
      (is (pos? (checkpoint-compare :type/DateTime
                                    (t/local-date-time 2026 2 1 0 0 0)
                                    (t/local-date-time 2026 1 31 0 0 0)))))))

(deftest ^:parallel checkpoint-span-attrs-test
  (testing "nil source-range-params yields an empty attrs map"
    (is (= {} (transforms-base.u/checkpoint-span-attrs nil))))
  (testing "field-id only (no lo/hi) yields just :transform/checkpoint-field-id"
    (is (= {:transform/checkpoint-field-id 42}
           (transforms-base.u/checkpoint-span-attrs {:checkpoint-filter-field-id 42}))))
  (testing "numeric lo/hi are encoded as strings"
    (is (= {:transform/checkpoint-field-id 7
            :transform/checkpoint-lo       "10"
            :transform/checkpoint-hi       "100"}
           (transforms-base.u/checkpoint-span-attrs
            {:checkpoint-filter-field-id 7
             :lo {:value 10}
             :hi {:value 100}}))))
  (testing "temporal hi is formatted as an ISO string"
    (let [attrs (transforms-base.u/checkpoint-span-attrs
                 {:checkpoint-filter-field-id 9
                  :hi {:value (t/local-date-time 2024 1 16 10 0 0)}})]
      (is (= 9 (:transform/checkpoint-field-id attrs)))
      (is (string? (:transform/checkpoint-hi attrs)))
      (is (re-find #"2024-01-16" (:transform/checkpoint-hi attrs))))))
