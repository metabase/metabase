(ns metabase.query-processor.middleware.update-used-cards
  (:require
   [java-time.api :as t]
   [metabase.db :as mdb]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.grouper :as grouper]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2])
  (:import
   [java.sql SQLException]))

(set! *warn-on-reflection* true)

(def ^:private update-used-card-interval-seconds 20)

(def ^:private cluster-lock-timeout-seconds 0.5)

(def ^:private max-update-retries 2)

(def ^:private pause-before-update-retry-seconds 1)

(mu/defn- do-with-pg-cluster-lock
  "TODO: Make this more reusable"
  ([lock-name thunk]
   (do-with-pg-cluster-lock lock-name {} thunk))
  ([lock-name :- :keyword {:keys [timeout max-retries]
                           :or {timeout cluster-lock-timeout-seconds
                                max-retries max-update-retries}} thunk]
   (let [stringified-kw (str (namespace lock-name) "/" (name lock-name))]
     (case (mdb/db-type)
       ;; MySQL does not support transaction-level timeouts so this technique is not appropriate
       ;; h2 cannot be used in cluster mode so we do not need locking
       (:h2 :mysql) (thunk)
       :postgres
       (loop [retries 0]
         (let [result (try
                        (t2/with-transaction [_conn]
                          (t2/query [(format "SET LOCAL lock_timeout = '%ss'" timeout)])
                          (when-not (t2/query-one {:select [:lock.lock_name]
                                                   :from [[:metabase_cluster_lock :lock]]
                                                   :where [:= :lock.lock_name stringified-kw]
                                                   :for :update})
                            (t2/query-one {:insert-into [:metabase_cluster_lock]
                                           :columns [:lock_name]
                                           :values [[stringified-kw]]}))
                          (thunk))
                        ;; TODO: Catch SQLExceptions here and return Throwable specifying when the failure was due to lock timeout
                        (catch Throwable e
                          (if (and (instance? SQLException (ex-cause e)) ;; assume we want to retry on any kind of sql error
                                   (< retries max-retries))
                            (do
                              (log/debugf "Retrying card update in %s seconds, %s retries remaining"
                                          pause-before-update-retry-seconds
                                          (- max-update-retries retries))
                              ::retryable)
                            (throw (ex-info "Failed to run statement with cluster lock"
                                            {:retries retries
                                             :lock-timeout timeout}
                                            e)))))]
           (when (= result ::retryable)
             (Thread/sleep ^int (* 1000 pause-before-update-retry-seconds))
             (recur (inc retries)))))))))

(defn- update-used-cards!*
  [card-id-timestamps]
  (let [card-id->timestamp (update-vals (group-by :id card-id-timestamps)
                                        (fn [xs] (apply t/max (map :timestamp xs))))]
    (log/debugf "Update last_used_at of %d cards" (count card-id->timestamp))
    (try
      (do-with-pg-cluster-lock ::used-at-update
                               (fn []
                                 (t2/update! :model/Card :id [:in (keys card-id->timestamp)]
                                             {:last_used_at (into [:case]
                                                                  (mapcat (fn [[id timestamp]]
                                                                            [[:= :id id] [:greatest [:coalesce :last_used_at (t/offset-date-time 0)] timestamp]])
                                                                          card-id->timestamp))
                                           ;; Set updated_at to its current value to prevent it from updating automatically
                                              :updated_at :updated_at})))
      (catch Throwable e
        (log/error e "Error updating used cards")))))

(defonce ^:private
  update-used-cards-queue
  (delay
    (grouper/start!
     update-used-cards!*
     :capacity 500
     :interval (* update-used-card-interval-seconds 1000))))

(mu/defn update-used-cards! :- ::qp.schema/qp
  "Middleware that get all card-ids that were used during a query execution and updates their `last_used_at`.
  Should be used after query is fully preprocessed.

  Including but not limited to cards used as:
  - the source card for other queries
  - definition for sandbox rules
  - card references in native query
  - dashcard on dashboard
  - alert/pulse"
  [qp :- ::qp.schema/qp]
  (mu/fn [query :- ::qp.schema/query
          rff   :- ::qp.schema/rff]
    (let [now  (t/offset-date-time)
          rff* (fn [metadata]
                 (doseq [card-id (distinct (lib.metadata/invoked-ids (qp.store/metadata-provider) :metadata/card))]
                   (grouper/submit! @update-used-cards-queue {:id        card-id
                                                              :timestamp now}))
                 (rff metadata))]
      (qp query rff*))))
