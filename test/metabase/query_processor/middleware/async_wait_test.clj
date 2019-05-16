(ns metabase.query-processor.middleware.async-wait-test
  (:require [clojure.core.async :as a]
            [expectations :refer [expect]]
            [metabase.models.database :refer [Database]]
            [metabase.query-processor.middleware.async-wait :as async-wait]
            [metabase.test.util.async :as tu.async]
            [metabase.util :as u]
            [toucan.util.test :as tt])
  (:import java.util.concurrent.Executors))

(def ^:private ^:dynamic *dynamic-var* false)

(defn- async-wait-bound-value
  "Check the bound value of `*dynamic-var*` when a function is executed after the `async-wait` using the thread pool for
  Database with `db-id`."
  [db-id]
  (let [bound-value (promise)]
    (tu.async/with-open-channels [canceled-chan (a/promise-chan)]
      ((async-wait/wait-for-turn
        (fn [& _]
          (deliver bound-value *dynamic-var*)))
       {:database db-id}
       identity
       identity
       canceled-chan))
    (u/deref-with-timeout bound-value 1000)))

;; basic sanity check: bound value of `*dynamic-var*` should be `false`
(expect
  false
  (tt/with-temp Database [{db-id :id}]
    (async-wait-bound-value db-id)))

;; bound dynamic vars should get re-bound by in the async wait fn
(expect
  ::wow
  (tt/with-temp Database [{db-id :id}]
    (binding [*dynamic-var* ::wow]
      (async-wait-bound-value db-id))))

;; binding should not be persisted between executions -- should be reset when we reuse a thread
(expect
  false
  (let [thread-pool (Executors/newSingleThreadExecutor)]
    (with-redefs [async-wait/db-thread-pool (constantly thread-pool)]
      (tt/with-temp Database [{db-id :id}]
        (binding [*dynamic-var* true]
          (async-wait-bound-value db-id))
        (async-wait-bound-value db-id)))))
