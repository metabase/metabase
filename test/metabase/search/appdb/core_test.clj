(ns metabase.search.appdb.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.core :as mdb]
   [metabase.events.core :as events]
   [metabase.search.engine :as search.engine]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(deftest locale-change-reindexes-after-commit-test
  (when (= :postgres (mdb/db-type))
    (let [reindex-connectable (promise)]
      (with-redefs [search.engine/reindex! (fn [& _] (deliver reindex-connectable t2.conn/*current-connectable*))]
        (t2/with-transaction [_conn]
          (events/publish-event! :event/setting-update {:details {:key :site-locale}})
          (is (not (realized? reindex-connectable))))
        (is (nil? (deref reindex-connectable 5000 ::timed-out)))))))
