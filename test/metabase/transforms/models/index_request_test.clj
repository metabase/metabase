(ns metabase.transforms.models.index-request-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.transforms.models.index-request :as ir]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type "python" :source-database (mt/id) :body "import pandas as pd\n"}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(deftest create-and-read-roundtrip-test
  (testing "a created request reads back with keyword-valued structured fields and :pending status"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [req  (ir/create-index-request! transform-id
                                           {:kind :btree :name "by_cat" :columns [{:name "category" :direction :asc}]})
            back (t2/select-one :model/IndexRequest :id (:id req))]
        (is (= :pending (:status back)))
        (is (= "by_cat" (:index_name back)))
        (is (= :btree (get-in back [:structured :kind])) "kind re-keywordized on read")
        (is (= :asc (get-in back [:structured :columns 0 :direction])) "column direction re-keywordized")
        (is (nil? (:table_id back)) "table_id starts null, backfilled after sync")))))

(deftest inline-kind-gets-name-from-kind-test
  (testing "inline kinds with no :name get a stable per-transform index_name from their :kind"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [req (ir/create-index-request! transform-id
                                          {:kind :sortkey :style :compound :columns [{:name "a"}]})]
        (is (= "sortkey" (:index_name req)))))))

;; Note: the `(transform_id, index_name)` unique constraint is declared in the migration. We don't assert it here
;; because a constraint violation aborts the enclosing Postgres test transaction, which then breaks `with-temp`
;; cleanup. The migration + lint cover it.

(deftest invalid-structured-rejected-test
  (testing "before-insert validates the structured map against the schema"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (is (thrown-with-msg? Exception #"Invalid index request structured"
                            (ir/create-index-request! transform-id {:kind :not-a-kind :columns [{:name "a"}]}))))))

(deftest status-and-drop-lifecycle-test
  (testing "mark-status! records error/executed-at; drop excludes from the active read"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [{:keys [id]} (ir/create-index-request! transform-id {:kind :btree :name "lc" :columns [{:name "a"}]})]
        (ir/mark-status! id :failed :error-message "boom" :executed-at (java.time.OffsetDateTime/now))
        (let [back (t2/select-one :model/IndexRequest :id id)]
          (is (= :failed (:status back)))
          (is (= "boom" (:error_message back)))
          (is (some? (:last_executed_at back))))
        (is (= 1 (count (ir/requests-for-transform transform-id))) "active read sees it before drop")
        (ir/drop-index-request! id)
        (is (empty? (ir/requests-for-transform transform-id)) "active read excludes dropped")
        (is (= 1 (count (ir/dropped-requests-for-transform transform-id))))))))

(deftest backfill-table-id-test
  (testing "backfill-table-id! sets table_id on a transform's requests"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [{:keys [id]} (ir/create-index-request! transform-id {:kind :btree :name "bf" :columns [{:name "a"}]})
            table-id (t2/select-one-pk :model/Table)]
        (when table-id
          (ir/backfill-table-id! transform-id table-id)
          (is (= table-id (:table_id (t2/select-one :model/IndexRequest :id id)))))))))
