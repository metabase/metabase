(ns metabase.transforms-base.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.sync.sync :as sync]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]))

(set! *warn-on-reflection* true)

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
        (mt/with-temp [:model/Table {table-id :id} {:db_id  (mt/id)
                                                    :schema nil
                                                    :name   "disable_auto_sync_target"}]
          (with-redefs [sync/sync-table! (fn [_] (swap! calls inc))]
            (mt/with-temporary-setting-values [disable-auto-sync true]
              (transforms-base.u/activate-table-and-mark-computed!
               (mt/db)
               {:type "table" :schema nil :name "disable_auto_sync_target"}))
            (is (= 1 @calls)
                "Expected the transform path to run sync/sync-table! exactly once with disable-auto-sync on.")))))))
