(ns metabase.explorations.task.collect-orphaned-results
  "Collects `stored_result` rows — the serialized warehouse rows behind an exploration's charts — that
  nothing can reach any more.

  No FK can do this. Every FK involved points *at* `stored_result`, so a cascade only ever strips a
  blob's referents: deleting an exploration takes its `exploration_query_result` rows (through
  thread → query) and its `stored_result_use` rows, and leaves the blob. Cascades run parent → child,
  and here the blob is the parent, so the direction is wrong by construction. What is actually needed
  is refcount semantics — collect when the last referent goes — which SQL cannot express
  declaratively, hence a sweep.

  Reachability is what defines an orphan, and it runs through exactly two columns:

  1. `exploration_query_result.stored_result_id` — the exploration's own charts (see
     [[metabase.explorations.models.exploration-query-result/stored-results]]).
  2. `stored_result_use.card_id` — the ephemeral `report_card` behind a static `cardEmbed` in an
     exploration's Summary document, served by `POST /api/card/:card-id/query` with a
     `stored_result_id`. A composite embed combines several source snapshots into a *new* blob that
     no `exploration_query_result` ever points at, so without this arm the sweep would collect the
     Summary's chart out from under it one grace period after it was added.

  `stored_result_use.exploration_id` is bookkeeping rather than reachability, and is deliberately
  *not* consulted: restarting a thread deletes its query rows — and with them the
  `exploration_query_result` rows — while leaving the exploration's use rows behind, so treating one
  as a reason to keep would leak a blob on every restart. A `card_id` use row is different in kind:
  it is the embed's only reference, and it is cascade-deleted with the Card, so it releases the blob
  exactly when the last referent goes. Deleting the blob cascades every use row away."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private grace-period-minutes
  "How long a blob must have existed before it can be collected.

  Today the writer inserts the blob and its `exploration_query_result` in one transaction
  ([[metabase.explorations.runner]]), so a committed blob always has its referent and no window
  exists. This guards the sweep against a future writer that links the two in separate transactions,
  where an unguarded sweep would delete a blob out from under work still in flight."
  60)

(def ^:private batch-size
  "Rows per delete. Blobs are large, so keep each transaction small rather than deleting a backlog
  (every result the instance has ever orphaned, on first run) in one statement."
  500)

(defn- orphaned-blob-ids
  "Up to [[batch-size]] `stored_result` ids that nothing reaches — neither an
  `exploration_query_result` nor a Summary embed's Card — and that are older
  than [[grace-period-minutes]]."
  []
  (mapv :id
        (t2/query
         {'select   ['sr.id]
          'from     [['stored_result 'sr]]
          'where    ['and
                     ['not ['exists ^:allow-subquery {'select [1]
                                                      'from   [['exploration_query_result 'eqr]]
                                                      'where  ['= 'eqr.stored_result_id 'sr.id]}]]
                     ['not ['exists ^:allow-subquery {'select [1]
                                                      'from   [['stored_result_use 'sru]]
                                                      'where  ['and
                                                               ['= 'sru.stored_result_id 'sr.id]
                                                               ['not= 'sru.card_id nil]]}]]
                     ['< 'sr.created_at (t/minus (t/offset-date-time)
                                                 (t/minutes grace-period-minutes))]]
          'order-by [['sr.id 'asc]]
          'limit    batch-size})))

(defn collect-orphaned-results!
  "Delete every unreachable `stored_result`, in batches. Returns the number collected."
  []
  (loop [total 0]
    (let [ids (orphaned-blob-ids)]
      (if (empty? ids)
        (do (when (pos? total)
              (log/infof "Collected %d orphaned exploration result blob(s)" total))
            total)
        ;; Selected and deleted as two statements: MySQL/MariaDB reject deleting from a table that a
        ;; subquery in the same statement reads (error 1093).
        (let [deleted (t2/delete! :model/StoredResult 'id [:in ids])]
          (if (pos? deleted)
            (recur (+ total (long deleted)))
            ;; Nothing deleted despite finding rows — another writer got there first. Stop rather
            ;; than spin on the same batch.
            total))))))

(task/defjob ^{:doc "Collects exploration result blobs that nothing references any more."}
  CollectOrphanedExplorationResults [_]
  (task-history/with-task-history {:task "collect-orphaned-exploration-results"}
    (collect-orphaned-results!)))

(def ^:private job-key "metabase.task.collect-orphaned-exploration-results.job")
(def ^:private trigger-key "metabase.task.collect-orphaned-exploration-results.trigger")
(def ^:private cron-schedule "0 30 */12 * * ? *") ;; every 12 hours, offset off the hour

(defmethod task/init! ::CollectOrphanedExplorationResults [_]
  (let [job     (jobs/build
                 (jobs/of-type CollectOrphanedExplorationResults)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule cron-schedule)
                   (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
