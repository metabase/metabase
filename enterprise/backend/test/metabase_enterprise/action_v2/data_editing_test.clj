(ns metabase-enterprise.action-v2.data-editing-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.action-v2.data-editing :as data-editing]
   [metabase.test :as mt]
   [toucan2.core :as t2])
  (:import
   (java.util.concurrent ArrayBlockingQueue)))

(set! *warn-on-reflection* true)

(deftest invalidate-field-values-statement-count-test
  (testing "checking 10 category columns for new values runs as many statements as checking 40, queuing only stale ones"
    (mt/with-temp [:model/Database {db-id :id} {}]
      (mt/with-model-cleanup [:model/Table]
        (let [statements (fn [n]
                           (let [table-id  (t2/insert-returning-pk! :model/Table {:db_id db-id :name (str "editing_" n) :active true})
                                 field-ids (t2/insert-returning-pks! :model/Field
                                                                     (for [i (range n)]
                                                                       {:table_id         table-id
                                                                        :name             (str "column_" i)
                                                                        :base_type        :type/Text
                                                                        :database_type    "TEXT"
                                                                        :semantic_type    :type/Category
                                                                        :has_field_values :list}))
                                 queue     (ArrayBlockingQueue. 10)]
                             (t2/insert! :model/FieldValues (for [field-id field-ids]
                                                              {:field_id field-id :type :full :values ["known"]}))
                             (binding [data-editing/*field-value-invalidate-queue* queue]
                               (t2/with-call-count [call-count]
                                 (#'data-editing/invalidate-field-values!
                                  table-id
                                  [(into {:column_0 "new"} (for [i (range 1 n)] [(keyword (str "column_" i)) "known"]))])
                                 (is (= [[(first field-ids)]] (vec queue)))
                                 (call-count)))))]
          (statements 2)
          (is (= (statements 10) (statements 40))))))))
