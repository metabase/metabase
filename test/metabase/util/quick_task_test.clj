(ns metabase.util.quick-task-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.app-db.core :as mdb]
   [metabase.util.quick-task :as quick-task]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- transaction-seen
  "What a task sees of the transaction of the thread that submitted it."
  []
  {:connection?     (some? t2.conn/*current-connectable*)
   :in-transaction? (mdb/in-transaction?)})

(deftest task-submitted-in-transaction-runs-outside-it-test
  (let [seen (promise)]
    (t2/with-transaction [_conn]
      (is (some? (quick-task/submit-task! #(deliver seen (transaction-seen)))))
      (is (= {:connection? false :in-transaction? false} (deref seen 60000 ::timeout))
          "the task runs on a connection of its own while the transaction is open"))))

(deftest task-submitted-outside-transaction-runs-at-once-test
  (let [fut (quick-task/submit-task! (fn [] :done))]
    (is (some? fut))
    @fut
    (is (.isDone ^java.util.concurrent.Future fut))))
