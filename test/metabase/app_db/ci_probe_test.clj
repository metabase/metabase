(ns metabase.app-db.ci-probe-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [toucan2.core :as t2]))

(deftest ci-probe-42862-no-idle-in-transaction-search-path-connection-test
  (when (= :postgres (mdb/db-type))
    (let [rows (t2/query {:select [:pid :state :query]
                          :from   [:pg_stat_activity]
                          :where  [:and
                                   [:= :datname [:current_database]]
                                   [:= :state "idle in transaction"]
                                   [:ilike :query "%search_path%"]]})]
      (is (= [] rows)))))
