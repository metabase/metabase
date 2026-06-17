(ns metabase.indexes.models.table-index-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.query-test-util :as query-test-util]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(deftest roundtrip-and-status-default-test
  (testing "structured reads back with keyword-valued fields, and status defaults to :pending"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [{:keys [id]} (t2/insert-returning-instance!
                          :model/TableIndex
                          {:transform_id transform-id
                           :index_name   "by_cat"
                           :structured   {:kind :btree :name "by_cat" :columns [{:name "category" :direction :asc}]}})
            back (t2/select-one :model/TableIndex :id id)]
        (is (= :pending (:status back)) "before-insert defaults status to :pending")
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
