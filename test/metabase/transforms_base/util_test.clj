(ns metabase.transforms-base.util-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.sync.sync :as sync]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [toucan2.core :as t2]))

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

(deftest full-incremental-run?-pending-index-matrix-test
  (testing "an incremental transform's rebuild-vs-append decision given various pending index rows"
    (letfn [(spec []
              {:name   (mt/random-name)
               :source {:type "query" :query {:database (mt/id) :type "native" :native {:query "SELECT 1"}}}
               :target {:database (mt/id) :type "table-incremental" :schema "public" :name (mt/random-name)}})
            ;; Inserting a :model/TableIndex row can itself reset the transform's checkpoint (see
            ;; `checkpoint-reset-required-for-insert?`); re-set a known value afterward so each case starts from a
            ;; deterministic non-nil checkpoint, isolating the pending-row logic under test.
            (reset-checkpoint! [tid] (t2/update! :model/Transform tid {:last_checkpoint_value "100"}))]
      (testing "no pending index rows: appends"
        (mt/with-temp [:model/Transform {tid :id} (spec)]
          (reset-checkpoint! tid)
          (is (false? (transforms-base.u/full-incremental-run? (t2/select-one :model/Transform tid))))))
      (testing "a :verify-pending bystander row never forces a rebuild"
        (mt/with-temp [:model/Transform {tid :id} (spec)
                       :model/TableIndex _ {:transform_id tid :index_name "idx" :status :verify-pending
                                            :structured {:kind :btree :name "idx" :columns [{:name "a"}]}}]
          (reset-checkpoint! tid)
          (is (false? (transforms-base.u/full-incremental-run? (t2/select-one :model/Transform tid))))))
      (testing "a :standalone create-pending row applies in place -- appends"
        (mt/with-temp [:model/Transform {tid :id} (spec)
                       :model/TableIndex _ {:transform_id tid :index_name "idx" :status :create-pending
                                            :structured {:kind :btree :name "idx" :columns [{:name "a"}]}}]
          (reset-checkpoint! tid)
          (with-redefs [driver/supported-index-methods (fn [& _] {:btree {:lifecycle :standalone}})]
            (is (false? (transforms-base.u/full-incremental-run? (t2/select-one :model/Transform tid)))))))
      (testing "an :inline create-pending row can only apply via a rebuild"
        (mt/with-temp [:model/Transform {tid :id} (spec)
                       :model/TableIndex _ {:transform_id tid :index_name "idx" :status :create-pending
                                            :structured {:kind :sortkey :style :compound :columns [{:name "a"}]}}]
          (reset-checkpoint! tid)
          (with-redefs [driver/supported-index-methods (fn [& _] {:sortkey {:lifecycle :inline}})]
            (is (true? (transforms-base.u/full-incremental-run? (t2/select-one :model/Transform tid)))))))
      (testing "a :standalone update-pending row still needs a rebuild -- no in-place DDL for updates"
        (mt/with-temp [:model/Transform {tid :id} (spec)
                       :model/TableIndex _ {:transform_id tid :index_name "idx" :status :update-pending
                                            :structured {:kind :btree :name "idx" :columns [{:name "a"}]}}]
          (reset-checkpoint! tid)
          (with-redefs [driver/supported-index-methods (fn [& _] {:btree {:lifecycle :standalone}})]
            (is (true? (transforms-base.u/full-incremental-run? (t2/select-one :model/Transform tid)))))))
      (testing "an :inline update-pending row needs a rebuild"
        (mt/with-temp [:model/Transform {tid :id} (spec)
                       :model/TableIndex _ {:transform_id tid :index_name "idx" :status :update-pending
                                            :structured {:kind :sortkey :style :compound :columns [{:name "a"}]}}]
          (reset-checkpoint! tid)
          (with-redefs [driver/supported-index-methods (fn [& _] {:sortkey {:lifecycle :inline}})]
            (is (true? (transforms-base.u/full-incremental-run? (t2/select-one :model/Transform tid))))))))))

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
