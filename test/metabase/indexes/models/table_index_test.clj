(ns metabase.indexes.models.table-index-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.test :as mt]
   [metabase.transforms.query-test-util :as query-test-util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(deftest roundtrip-and-defaults-test
  (testing "structured reads back with keyword-valued fields, and lifecycle defaults are set"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [{:keys [id]} (t2/insert-returning-instance!
                          :model/TableIndex
                          {:transform_id transform-id
                           :index_name   "by_cat"
                           :structured   {:kind :btree :name "by_cat" :columns [{:name "category" :direction :asc}]}})
            back (t2/select-one :model/TableIndex :id id)]
        (is (= :create-pending (:status back)) "before-insert defaults status to :create-pending")
        (is (= :btree (get-in back [:structured :kind])) "kind re-keywordized on read")
        (is (= :asc (get-in back [:structured :columns 0 :direction])))))))

(deftest invalid-structured-rejected-test
  (testing "the :structured transform validates against the schema on write"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (is (thrown?
           Exception
           (t2/insert! :model/TableIndex
                       {:transform_id transform-id
                        :index_name   "bad"
                        :structured   {:kind :not-a-kind :columns [{:name "a"}]}}))))))

(deftest invalid-status-rejected-test
  (testing "the :status transform rejects values outside the enum"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (is (thrown?
           Exception
           (t2/insert! :model/TableIndex
                       {:transform_id transform-id
                        :index_name   "bad-status"
                        :status       :bogus
                        :structured   {:kind :btree :name "x" :columns [{:name "a"}]}}))))))

(deftest running-transition-helpers-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                 :model/TableIndex {create-id :id} {:transform_id transform-id
                                                    :index_name   "create_idx"
                                                    :structured   {:kind :btree :name "create_idx"
                                                                   :columns [{:name "a"}]}}
                 :model/TableIndex {update-id :id} {:transform_id transform-id
                                                    :index_name   "update_idx"
                                                    :status       :update-pending
                                                    :structured   {:kind :btree :name "update_idx"
                                                                   :columns [{:name "b"}]}}
                 :model/TableIndex {failed-id :id} {:transform_id transform-id
                                                    :index_name   "failed_idx"
                                                    :status       :failed
                                                    :error_message "old failure"
                                                    :structured   {:kind :btree :name "failed_idx"
                                                                   :columns [{:name "c"}]}}
                 :model/TableIndex {running-id :id} {:transform_id transform-id
                                                     :index_name   "running_idx"
                                                     :status       :running
                                                     :structured   {:kind :btree :name "running_idx"
                                                                    :columns [{:name "e"}]}}
                 :model/TableIndex {deleted-id :id} {:transform_id transform-id
                                                     :index_name   "deleted_idx"
                                                     :status       :delete-pending
                                                     :structured   {:kind :btree :name "deleted_idx"
                                                                    :columns [{:name "d"}]}}]
    (let [ids (table-index/mark-runnable-indexes-running! [create-id update-id failed-id running-id])]
      (is (= #{create-id update-id failed-id running-id} ids))
      (is (= :running (t2/select-one-fn :status :model/TableIndex create-id)))
      (is (= :running (t2/select-one-fn :status :model/TableIndex update-id)))
      (is (= :running (t2/select-one-fn :status :model/TableIndex failed-id)))
      (is (= :running (t2/select-one-fn :status :model/TableIndex running-id)))
      (is (= :delete-pending (t2/select-one-fn :status :model/TableIndex deleted-id)))
      (t2/update! :model/TableIndex create-id {:status :succeeded})
      (table-index/mark-unverified-running-indexes-failed! ids "not verified")
      (is (= :succeeded (t2/select-one-fn :status :model/TableIndex create-id)))
      (is (= :failed (t2/select-one-fn :status :model/TableIndex update-id)))
      (is (= :failed (t2/select-one-fn :status :model/TableIndex failed-id)))
      (is (= :failed (t2/select-one-fn :status :model/TableIndex running-id)))
      (is (= "not verified" (t2/select-one-fn :error_message :model/TableIndex update-id))))))

(deftest mark-for-revalidation-test
  (testing "settled (succeeded/failed) requests are flipped to :verify-pending, clearing stale errors; rows with a
            real pending change, and delete-pending rows, are left untouched"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                   :model/TableIndex {create-id :id} {:transform_id transform-id
                                                      :index_name   "create_idx"
                                                      :structured   {:kind :btree :name "create_idx"
                                                                     :columns [{:name "a"}]}}
                   :model/TableIndex {update-id :id} {:transform_id transform-id
                                                      :index_name   "update_idx"
                                                      :status       :update-pending
                                                      :structured   {:kind :btree :name "update_idx"
                                                                     :columns [{:name "e"}]}}
                   :model/TableIndex {running-id :id} {:transform_id transform-id
                                                       :index_name   "running_idx"
                                                       :status       :running
                                                       :structured   {:kind :btree :name "running_idx"
                                                                      :columns [{:name "f"}]}}
                   :model/TableIndex {succeeded-id :id} {:transform_id transform-id
                                                         :index_name   "succeeded_idx"
                                                         :status       :succeeded
                                                         :structured   {:kind :btree :name "succeeded_idx"
                                                                        :columns [{:name "b"}]}}
                   :model/TableIndex {failed-id :id} {:transform_id transform-id
                                                      :index_name   "failed_idx"
                                                      :status       :failed
                                                      :error_message "old failure"
                                                      :structured   {:kind :btree :name "failed_idx"
                                                                     :columns [{:name "c"}]}}
                   :model/TableIndex {deleted-id :id} {:transform_id transform-id
                                                       :index_name   "deleted_idx"
                                                       :status       :delete-pending
                                                       :structured   {:kind :btree :name "deleted_idx"
                                                                      :columns [{:name "d"}]}}]
      (table-index/mark-for-revalidation! transform-id)
      (is (= :verify-pending (t2/select-one-fn :status :model/TableIndex succeeded-id)))
      (is (= :verify-pending (t2/select-one-fn :status :model/TableIndex failed-id)))
      (is (nil? (t2/select-one-fn :error_message :model/TableIndex failed-id)) "stale error cleared")
      (is (= :create-pending (t2/select-one-fn :status :model/TableIndex create-id)) "a real pending create is not masked")
      (is (= :update-pending (t2/select-one-fn :status :model/TableIndex update-id)) "a real pending update is not masked")
      (is (= :running (t2/select-one-fn :status :model/TableIndex running-id)) "a mid-run request is not masked")
      (is (= :delete-pending (t2/select-one-fn :status :model/TableIndex deleted-id)) "pending deletion not revived")))
  (testing "a nil transform-id is a no-op"
    (is (nil? (table-index/mark-for-revalidation! nil)))))

(deftest select-for-verification-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                 :model/TableIndex {running-id :id} {:transform_id transform-id
                                                     :index_name   "running_idx"
                                                     :status       :running
                                                     :structured   {:kind :btree :name "running_idx"
                                                                    :columns [{:name "a"}]}}
                 :model/TableIndex {pending-id :id} {:transform_id transform-id
                                                     :index_name   "pending_idx"
                                                     :status       :update-pending
                                                     :structured   {:kind :btree :name "pending_idx"
                                                                    :columns [{:name "b"}]}}
                 :model/TableIndex {deleted-id :id} {:transform_id transform-id
                                                     :index_name   "deleted_idx"
                                                     :status       :delete-pending
                                                     :structured   {:kind :btree :name "deleted_idx"
                                                                    :columns [{:name "c"}]}}]
    (is (= #{running-id deleted-id}
           (set (map :id (table-index/select-for-verification transform-id [running-id pending-id])))))))

(deftest ^:parallel rebuild-required?-test
  (testing ":create-pending needs a rebuild unless the kind's lifecycle is :standalone"
    (is (false? (table-index/rebuild-required?
                 {:status :create-pending :structured {:kind :btree}}
                 {:btree {:lifecycle :standalone}})))
    (is (true? (table-index/rebuild-required?
                {:status :create-pending :structured {:kind :sortkey}}
                {:sortkey {:lifecycle :inline}})))
    (testing "an unrecognized kind rebuilds too, rather than silently skip a real change"
      (is (true? (table-index/rebuild-required?
                  {:status :create-pending :structured {:kind :made-up}}
                  {})))))
  (testing ":update-pending and :delete-pending always need a rebuild, regardless of lifecycle"
    (is (true? (table-index/rebuild-required?
                {:status :update-pending :structured {:kind :btree}}
                {:btree {:lifecycle :standalone}})))
    (is (true? (table-index/rebuild-required?
                {:status :delete-pending :structured {:kind :btree}}
                {:btree {:lifecycle :standalone}}))))
  (testing ":running also needs a rebuild (mid-run)"
    (is (true? (table-index/rebuild-required?
                {:status :running :structured {:kind :btree}}
                {:btree {:lifecycle :standalone}})))))

(deftest select-pending-for-transform-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                 :model/TableIndex {create-id :id} {:transform_id transform-id
                                                    :index_name   "create_idx"
                                                    :structured   {:kind :btree :name "create_idx"
                                                                   :columns [{:name "a"}]}}
                 :model/TableIndex {update-id :id} {:transform_id transform-id
                                                    :index_name   "update_idx"
                                                    :status       :update-pending
                                                    :structured   {:kind :btree :name "update_idx"
                                                                   :columns [{:name "b"}]}}
                 :model/TableIndex {delete-id :id} {:transform_id transform-id
                                                    :index_name   "delete_idx"
                                                    :status       :delete-pending
                                                    :structured   {:kind :btree :name "delete_idx"
                                                                   :columns [{:name "c"}]}}
                 :model/TableIndex {running-id :id} {:transform_id transform-id
                                                     :index_name   "running_idx"
                                                     :status       :running
                                                     :structured   {:kind :btree :name "running_idx"
                                                                    :columns [{:name "d"}]}}
                 :model/TableIndex _ {:transform_id transform-id
                                      :index_name   "verify_idx"
                                      :status       :verify-pending
                                      :structured   {:kind :btree :name "verify_idx" :columns [{:name "e"}]}}
                 :model/TableIndex _ {:transform_id transform-id
                                      :index_name   "succeeded_idx"
                                      :status       :succeeded
                                      :structured   {:kind :btree :name "succeeded_idx" :columns [{:name "f"}]}}]
    (testing "returns rows with a real pending change; excludes :verify-pending and settled rows"
      (is (= #{create-id update-id delete-id running-id}
             (set (map :id (table-index/select-pending-for-transform transform-id))))))
    (testing "a nil transform-id is a no-op"
      (is (nil? (table-index/select-pending-for-transform nil))))))

(deftest select-create-pending-for-transform-test
  (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                 :model/TableIndex {create-id :id} {:transform_id transform-id
                                                    :index_name   "create_idx"
                                                    :structured   {:kind :btree :name "create_idx"
                                                                   :columns [{:name "a"}]}}
                 :model/TableIndex _ {:transform_id transform-id
                                      :index_name   "update_idx"
                                      :status       :update-pending
                                      :structured   {:kind :btree :name "update_idx" :columns [{:name "b"}]}}]
    (is (= [create-id] (map :id (table-index/select-create-pending-for-transform transform-id))))))

(deftest insert-checkpoint-reset-gating-test
  (testing "a fresh :standalone-kind create does not reset the incremental checkpoint -- it applies without a rebuild"
    (mt/with-temp [:model/Transform {transform-id :id} (assoc (temp-transform-spec)
                                                              :target {:database (mt/id) :type "table-incremental"
                                                                       :schema "public" :name (mt/random-name)}
                                                              :last_checkpoint_value "100")]
      (with-redefs [driver/supported-index-methods (fn [& _] {:btree {:lifecycle :standalone}})]
        (t2/insert! :model/TableIndex {:transform_id transform-id
                                       :index_name   "standalone_idx"
                                       :structured   {:kind :btree :name "standalone_idx" :columns [{:name "a"}]}})
        (is (= "100" (t2/select-one-fn :last_checkpoint_value :model/Transform transform-id))))))
  (testing "a fresh :inline-kind create resets the checkpoint -- it can only apply via a rebuild"
    (mt/with-temp [:model/Transform {transform-id :id} (assoc (temp-transform-spec)
                                                              :target {:database (mt/id) :type "table-incremental"
                                                                       :schema "public" :name (mt/random-name)}
                                                              :last_checkpoint_value "100")]
      (with-redefs [driver/supported-index-methods (fn [& _] {:sortkey {:lifecycle :inline}})]
        (t2/insert! :model/TableIndex {:transform_id transform-id
                                       :index_name   "sortkey"
                                       :structured   {:kind :sortkey :style :compound :columns [{:name "a"}]}})
        (is (nil? (t2/select-one-fn :last_checkpoint_value :model/Transform transform-id)))))))
