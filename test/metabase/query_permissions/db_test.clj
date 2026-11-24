(ns metabase.query-permissions.db-test
  (:require
   [clojure.test :refer :all]
   [metabase.query-permissions.db :as query-permissions.db]
   [metabase.test :as mt]))

(deftest partitioned-reads-test
  (let [table-ids (set (map mt/id [:venues :users :checkins :categories :orders]))
        field-ids (set (map #(apply mt/id %) [[:venues :name] [:users :name] [:checkins :date] [:categories :name]]))
        reads     (fn []
                    {:field-tables (query-permissions.db/field-table-ids field-ids)
                     :databases    (query-permissions.db/table-id->database-id table-ids)})
        single    (reads)]
    (is (= 4 (count (:field-tables single))))
    (is (= table-ids (set (keys (:databases single)))))
    (is (= single (mt/with-partition-size 2 (reads))))))
