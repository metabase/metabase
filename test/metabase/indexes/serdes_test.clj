(ns metabase.indexes.serdes-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [metabase.transforms.query-test-util :as query-test-util]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(deftest transform-indexes-inlined-test
  (testing "a transform's managed indexes are inlined into its serialization, definition only"
    (mt/with-temp [:model/Transform  {transform-id :id} (temp-transform-spec)
                   :model/TableIndex {idx-id :id} {:transform_id  transform-id
                                                   :index_name    "by_cat"
                                                   :structured    {:kind :btree :name "by_cat"
                                                                   :columns [{:name "category" :direction :asc}]}
                                                   :status        :succeeded
                                                   :error_message "boom"}]
      (let [hydrated (u/rfirst (serdes/extract-query "Transform" {:where [:= :id transform-id]}))]
        (testing "extract-query hydrates the index under :indexes"
          (is (= [idx-id] (map :id (:indexes hydrated)))))
        (testing "the serialized index keeps its definition and drops runtime/local state"
          (let [idx (-> (serdes/extract-one "Transform" {} hydrated) :indexes first)]
            (is (= "by_cat" (:index_name idx)))
            (is (= :btree (get-in idx [:structured :kind])))
            (is (not (contains? idx :status)))
            (is (not (contains? idx :error_message)))
            (is (not (contains? idx :table_id)))
            (is (not (contains? idx :id)))))))))
