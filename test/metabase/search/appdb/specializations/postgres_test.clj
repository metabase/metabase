(ns metabase.search.appdb.specializations.postgres-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.search.appdb.specialization.api :as specialization]
   [toucan2.core :as t2]))

(use-fixtures :each (fn [t]
                      (when (= :postgres (mdb/db-type))
                        (t))))

(deftest batch-upsert-test
  (with-redefs [t2/query identity]
    (let [query (specialization/batch-upsert! :some-table
                                              [{:display_data :a}
                                               {:legacy_input :b}])]
      (is (= [{:display_data :a} {:legacy_input :b}] (:values query)))
      (is (= {:display_data :excluded.display_data :legacy_input :excluded.legacy_input} (:do-update-set query))))))
