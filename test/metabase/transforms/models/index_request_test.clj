(ns metabase.transforms.models.index-request-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- temp-transform-spec []
  {:name   (mt/random-name)
   :source {:type "python" :source-database (mt/id) :body "import pandas as pd\n"}
   :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})

(deftest structured-roundtrip-test
  (testing "structured reads back with keyword-valued :kind and column :direction"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (let [{:keys [id]} (t2/insert-returning-instance!
                          :model/IndexRequest
                          {:transform_id transform-id
                           :index_name   "by_cat"
                           :structured   {:kind :btree :name "by_cat" :columns [{:name "category" :direction :asc}]}
                           :status       :pending})
            back (t2/select-one :model/IndexRequest :id id)]
        (is (= :pending (:status back)))
        (is (= :btree (get-in back [:structured :kind])) "kind re-keywordized on read")
        (is (= :asc (get-in back [:structured :columns 0 :direction])) "column direction re-keywordized")
        (is (nil? (:table_id back)) "table_id starts null, backfilled after sync")))))

(deftest invalid-structured-rejected-test
  (testing "before-insert validates the structured map against the schema"
    (mt/with-temp [:model/Transform {transform-id :id} (temp-transform-spec)]
      (is (thrown-with-msg?
           Exception #"Invalid index request structured"
           (t2/insert! :model/IndexRequest
                       {:transform_id transform-id
                        :index_name   "bad"
                        :structured   {:kind :not-a-kind :columns [{:name "a"}]}
                        :status       :pending}))))))
