(ns ^:mb/once metabase.task.delete-inactive-tables-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.task.delete-inactive-tables :as delete-inactive-tables]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest delete-inactive-tables-test
  (let [one-day-less-than-threshold (t/minus (t/zoned-date-time)
                                             (t/days (dec @#'delete-inactive-tables/inactive-table-max-days)))
        older-than-threshold        (t/minus (t/zoned-date-time)
                                             (t/days (inc @#'delete-inactive-tables/inactive-table-max-days)))]
    (mt/with-temp
      [:model/Database {db-id :id}                 {}
       :model/Table    {new-active-table-id :id}   {:db_id       db-id
                                                    :active      true
                                                    :updated_at  one-day-less-than-threshold}
       :model/Table    {old-active-table-id :id}   {:db_id       db-id
                                                    :active      true
                                                    :updated_at  older-than-threshold}
       :model/Table    {new-inactive-table-id :id} {:db_id       db-id
                                                    :active      false
                                                    :updated_at  one-day-less-than-threshold}
       :model/Table    _old-inactive-table         {:db_id       db-id
                                                    :active      false
                                                    :updated_at  older-than-threshold}]

      (#'delete-inactive-tables/delete-inactive-tables!)
      (testing "inactive tables that are older than threshold should be deleted"
        (is (= #{new-active-table-id old-active-table-id new-inactive-table-id}
               (t2/select-pks-set :model/Table :db_id db-id)))))))
