(ns metabase.transforms-base.util-test
  (:require
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.sync.analyze :as analyze]
   [metabase.sync.field-values :as sync.field-values]
   [metabase.sync.sync-metadata :as sync-metadata]
   [metabase.test :as mt]
   [metabase.transforms-base.util :as transforms-base.u]
   [toucan2.core :as t2]))

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

(deftest complete-execution-without-table-remapping-test
  (testing "complete-execution! without :table-remapping syncs the declared target and passes no physical-target"
    (mt/with-premium-features #{:transforms-basic}
      (let [target    {:type "table" :schema nil :name "ce_no_remap_output"}
            captured  (atom nil)]
        (mt/with-temp [:model/Transform {transform-id :id :as transform}
                       {:target target
                        :source {:type  "query"
                                 :query {:database (mt/id) :type :query :query {:source-table 1}}}}]
          (let [;; The Transform after-insert hook provisions a Table row for the target.
                table-id (t2/select-one-fn :id :model/Table
                                           :db_id  (mt/id)
                                           :schema nil
                                           :name   "ce_no_remap_output")]
            (mt/with-dynamic-fn-redefs
              [transforms-base.u/sync-target!
               (fn
                 ([t db]    (reset! captured {:target t :physical nil})
                            (t2/select-one :model/Table table-id))
                 ([t db pt] (reset! captured {:target t :physical pt})
                            (t2/select-one :model/Table table-id)))]
              (transforms-base.u/complete-execution! transform {:publish-events? false})
              (is (= target
                     (select-keys (:target @captured) [:type :schema :name]))
                  "sync-target! receives the declared target")
              (is (nil? (:physical @captured))
                  "physical-target is nil when no :table-remapping is provided")
              (is (= transform-id
                     (t2/select-one-fn :transform_id :model/Table :id table-id))
                  "transform_id wired up on the synced table"))))))))

(deftest complete-execution-with-table-remapping-test
  (testing "complete-execution! with :table-remapping persists the logical row but hands sync the physical target"
    (mt/with-premium-features #{:transforms-basic}
      (let [target     {:type "table" :schema nil :name "ce_with_remap_output"}
            remap      {:schema "ws_xyz" :name "PUBLIC__CE_WITH_REMAP_OUTPUT"}
            captured   (atom nil)]
        (mt/with-temp [:model/Transform {transform-id :id :as transform}
                       {:target target
                        :source {:type  "query"
                                 :query {:database (mt/id) :type :query :query {:source-table 1}}}}]
          (let [;; Persisted row is at the *logical* (declared) identity.
                table-id (t2/select-one-fn :id :model/Table
                                           :db_id  (mt/id)
                                           :schema nil
                                           :name   "ce_with_remap_output")]
            (mt/with-dynamic-fn-redefs
              [transforms-base.u/sync-target!
               (fn
                 ([t db]    (reset! captured {:target t :physical nil})
                            (t2/select-one :model/Table table-id))
                 ([t db pt] (reset! captured {:target t :physical pt})
                            (t2/select-one :model/Table table-id)))]
              (transforms-base.u/complete-execution!
               transform {:publish-events? false :table-remapping remap})
              (is (= target
                     (select-keys (:target @captured) [:type :schema :name]))
                  "the logical target drives app-db lookup - it must be unchanged")
              (is (= (merge target remap)
                     (select-keys (:physical @captured) [:type :schema :name]))
                  "physical-target is the target merged with the workspace remap")
              (is (= transform-id
                     (t2/select-one-fn :transform_id :model/Table :id table-id))
                  "transform_id wired up on the synced (logical) table row")
              (is (nil? (t2/select-one :model/Table
                                       :db_id  (mt/id)
                                       :schema (:schema remap)
                                       :name   (:name remap)))
                  "no metabase_table row is persisted at the physical (remapped) identity"))))))))

(deftest complete-execution-runs-sync-despite-disable-sync-test
  (testing
   "disable-sync gates the automatic scheduled sync task, not sync in general. A transform's
   post-run sync of its own target is a user-triggered operation and must run even when
   :disable-sync is true — otherwise the target table row lands in metabase_table but
   metabase_field stays empty (\"Table '...' has no Fields associated with it\")."
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temporary-setting-values [metabase.warehouses.settings/disable-sync true]
        (let [target     {:type "table" :schema nil :name "ds_bypass_target"}
              sync-calls (atom [])]
          (mt/with-temp [:model/Transform transform
                         {:target target
                          :source {:type  "query"
                                   :query {:database (mt/id) :type :query :query {:source-table 1}}}}]
            (mt/with-dynamic-fn-redefs
              [sync-metadata/sync-table-metadata!
               (fn [table] (swap! sync-calls conj {:op :metadata :table-id (:id table)}) table)
               analyze/analyze-table!
               (fn [table] (swap! sync-calls conj {:op :analyze :table-id (:id table)}) table)
               sync.field-values/update-field-values-for-table!
               (fn [table] (swap! sync-calls conj {:op :field-values :table-id (:id table)}) table)]
              (transforms-base.u/complete-execution! transform {:publish-events? false})
              (let [ops (into #{} (map :op) @sync-calls)]
                (is (contains? ops :metadata)
                    "sync-table-metadata! must run so metabase_field rows get populated")
                (is (contains? ops :analyze)
                    "analyze-table! must run so fingerprints/semantic types are populated")
                (is (contains? ops :field-values)
                    "update-field-values-for-table! must run so dropdown FieldValues are populated")))))))))
