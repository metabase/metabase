(ns metabase.indexes.serdes-test
  (:require
   [clojure.test :refer :all]
   [metabase.serialization.core :as serialization]
   [metabase.test :as mt]
   [metabase.transforms.query-test-util :as query-test-util]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type :query :query (query-test-util/make-query :source-table "venues")}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(deftest transform-indexes-inlined-test
  (testing "transform's managed indexes are inlined into its serialization, definition only"
    (mt/with-temp [:model/Transform  {transform-id :id} (temp-transform-spec)
                   :model/TableIndex _ {:transform_id  transform-id
                                        :index_name    "by_cat"
                                        :structured    {:kind :btree :name "by_cat"
                                                        :columns [{:name "category" :direction :asc}]}
                                        :status        :succeeded
                                        :error_message "boom"}]
      (let [exported (u/rfirst (serialization/export :model/Transform (t2/select :model/Transform :id transform-id)))
            idx      (first (:indexes exported))]
        (is (= 1 (count (:indexes exported))))
        (testing "serialized index keeps its definition and drops runtime/local state"
          (is (= "by_cat" (:index_name idx)))
          (is (= :btree (get-in idx [:structured :kind])))
          (is (not (contains? idx :status)))
          (is (not (contains? idx :error_message)))
          (is (not (contains? idx :table_id)))
          (is (not (contains? idx :id))))))))
