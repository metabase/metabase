(ns metabase.query-processor.execute-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel native-form-test
  (testing "Native form should have inlined parameters."
    (is (=? {:status :completed
             :data   {:native_form {:query "SELECT \"PUBLIC\".\"CATEGORIES\".\"ID\" AS \"ID\" FROM \"PUBLIC\".\"CATEGORIES\" WHERE \"PUBLIC\".\"CATEGORIES\".\"NAME\" = 'BBQ' LIMIT 1"}}}
            (qp/process-query (mt/mbql-query categories {:fields [$id]
                                                         :filter [:= $name "BBQ"]
                                                         :limit  1}))))))
