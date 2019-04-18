(ns metabase.query-processor.middleware.async-wait
  "Middleware that limits the number of concurrent queries for each database.

  Each connected database is limited to a maximum of 15 simultaneous queries (configurable) using these methods; any
  additional queries will park the thread. Super-useful for writing high-performance API endpoints. Prefer these
  methods to the old-school synchronous versions.

  How is this achieved? For each Database, we'll maintain a channel that acts as a counting semaphore; the channel
  will initially contain 15 permits. Each incoming request will asynchronously read from the channel until it acquires
  a permit, then put it back when it finishes."
  (:require [clojure.core.async :as a]
            [metabase.async.semaphore-channel :as semaphore-channel]
            [metabase.models.setting :refer [defsetting]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

(defsetting max-simultaneous-queries-per-db
  (trs "Maximum number of simultaneous queries to allow per connected Database.")
  :type    :integer
  :default 15)

(defonce ^:private db-semaphore-channels (atom {}))

(defn- fetch-db-semaphore-channel
  "Fetch the counting semaphore channel for a Database, creating it if not already created."
  [database-or-id]
  (let [id (u/get-id database-or-id)]
    (or
     ;; channel already exists
     (@db-semaphore-channels id)
     ;; channel does not exist, Create a channel and stick it in the atom
     (let [ch     (semaphore-channel/semaphore-channel (max-simultaneous-queries-per-db))
           new-ch ((swap! db-semaphore-channels update id #(or % ch)) id)]
       ;; ok, if the value swapped into the atom was a different channel (another thread beat us to it) then close our
       ;; newly created channel
       (when-not (= ch new-ch)
         (a/close! ch))
       ;; return the newly created channel
       new-ch))))

(defn wait-for-permit
  "Middleware that throttles the number of concurrent queries for each connected database, parking the thread until a
  permit becomes available."
  [qp]
  (fn [{database-id :database, :as query} respond raise canceled-chan]
    (let [semaphore-chan (fetch-db-semaphore-channel database-id)
          output-chan    (semaphore-channel/do-after-receiving-permit semaphore-chan
                           qp query respond raise canceled-chan)]
      (a/go
        (respond (a/<! output-chan))
        (a/close! output-chan))
      (a/go
        (when (a/<! canceled-chan)
          (a/close! output-chan)))
      nil)))
