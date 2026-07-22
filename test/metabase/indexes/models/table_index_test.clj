(ns metabase.indexes.models.table-index-test
  (:require
   [clojure.test :refer :all]
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
  (testing "every applicable request is flipped to :update-pending, clearing stale errors; delete-pending rows untouched"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                   :model/TableIndex {create-id :id} {:transform_id transform-id
                                                      :index_name   "create_idx"
                                                      :structured   {:kind :btree :name "create_idx"
                                                                     :columns [{:name "a"}]}}
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
      (is (= :update-pending (t2/select-one-fn :status :model/TableIndex create-id)))
      (is (= :update-pending (t2/select-one-fn :status :model/TableIndex succeeded-id)))
      (is (= :update-pending (t2/select-one-fn :status :model/TableIndex failed-id)))
      (is (nil? (t2/select-one-fn :error_message :model/TableIndex failed-id)) "stale error cleared")
      (is (= :delete-pending (t2/select-one-fn :status :model/TableIndex deleted-id)) "pending deletion not revived")))
  (testing "a nil transform-id is a no-op"
    (is (nil? (table-index/mark-for-revalidation! nil)))))

(deftest pending-changes-for-transform?-test
  (testing "any unsettled request forces the transform's next run to be a full rebuild"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                   :model/TableIndex {index-id :id} {:transform_id transform-id
                                                     :index_name   "idx"
                                                     :status       :succeeded
                                                     :structured   {:kind :btree :name "idx"
                                                                    :columns [{:name "a"}]}}]
      (is (false? (table-index/pending-changes-for-transform? transform-id))
          "a settled (:succeeded) request needs no rebuild")
      ;; :failed is included: its index DDL already ran against a materialized table, so only a full rebuild
      ;; safely re-attempts it instead of appending duplicate rows from the stale checkpoint.
      (doseq [status [:create-pending :update-pending :delete-pending :running :failed]]
        (t2/update! :model/TableIndex index-id {:status status})
        (is (true? (table-index/pending-changes-for-transform? transform-id))
            (str status " forces a full rebuild")))))
  (testing "a nil transform-id is not pending"
    (is (false? (table-index/pending-changes-for-transform? nil)))))

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

(deftest select-applicable-for-transform-test
  (testing "returns the transform's rows ordered by name, excluding delete-pending"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)
                   :model/TableIndex {b-id :id} {:transform_id transform-id
                                                 :index_name   "b_idx"
                                                 :structured   {:kind :btree :name "b_idx" :columns [{:name "x"}]}}
                   :model/TableIndex {a-id :id} {:transform_id transform-id
                                                 :index_name   "a_idx"
                                                 :structured   {:kind :btree :name "a_idx" :columns [{:name "y"}]}}
                   :model/TableIndex _ {:transform_id transform-id
                                        :index_name   "deleted_idx"
                                        :status       :delete-pending
                                        :structured   {:kind :btree :name "deleted_idx" :columns [{:name "z"}]}}]
      (is (= [a-id b-id]
             (map :id (table-index/select-applicable-for-transform transform-id)))))))

(deftest transform-edit-marks-indexes-for-revalidation-test
  (testing "editing a transform's target flips its applicable indexes to :update-pending; delete-pending untouched"
    (mt/with-temp [:model/Transform {transform-id :id :as transform} (temp-transform-spec)
                   :model/TableIndex {create-id :id} {:transform_id transform-id
                                                      :index_name   "create_idx"
                                                      :structured   {:kind :btree :name "create_idx"
                                                                     :columns [{:name "a"}]}}
                   :model/TableIndex {succeeded-id :id} {:transform_id transform-id
                                                         :index_name   "succeeded_idx"
                                                         :status       :succeeded
                                                         :structured   {:kind :btree :name "succeeded_idx"
                                                                        :columns [{:name "b"}]}}
                   :model/TableIndex {deleted-id :id} {:transform_id transform-id
                                                       :index_name   "deleted_idx"
                                                       :status       :delete-pending
                                                       :structured   {:kind :btree :name "deleted_idx"
                                                                      :columns [{:name "c"}]}}]
      (t2/update! :model/Transform transform-id {:target (assoc (:target transform) :name (mt/random-name))})
      (is (= :update-pending (t2/select-one-fn :status :model/TableIndex create-id)))
      (is (= :update-pending (t2/select-one-fn :status :model/TableIndex succeeded-id)))
      (is (= :delete-pending (t2/select-one-fn :status :model/TableIndex deleted-id))))))

(deftest deleting-transform-removes-its-indexes-test
  (testing "the transform_id FK cascades, so deleting a transform drops its index requests"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (t2/insert! :model/TableIndex {:transform_id transform-id
                                     :index_name   "idx"
                                     :structured   {:kind :btree :name "idx" :columns [{:name "a"}]}})
      (is (t2/exists? :model/TableIndex :transform_id transform-id))
      (t2/delete! :model/Transform transform-id)
      (is (not (t2/exists? :model/TableIndex :transform_id transform-id))))))
