(ns metabase.search.appdb.specializations.postgres-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.api :as specialization]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [t]
                      (when (= :postgres (mdb/db-type))
                        (t))))

(deftest batch-upsert-test
  (mt/with-dynamic-fn-redefs [t2/query (fn [_conn query] query)]
    (let [query (specialization/batch-upsert! nil
                                              :some-table
                                              [{:a :b}
                                               {:b :c}])]
      (is (= [{:a :b} {:b :c}] (:values query)))
      (is (= {:a :excluded.a :b :excluded.b} (:do-update-set query))))))
