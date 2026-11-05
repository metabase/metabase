(ns metabase-enterprise.workspaces.status
  "The status column of a workspace row is its lock: a change of status is a conditional UPDATE from the status the
  caller expects, and a caller whose UPDATE matches no row gets a 409. A row left in an in-flight status for longer
  than [[stale-after]] reads as `:failed`, so a crashed request does not hold its lock forever."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms])
  (:import
   (java.time Duration OffsetDateTime)))

(set! *warn-on-reflection* true)

(mr/def ::database-status
  [:enum :provisioning :provisioned :deprovisioning :failed])

(def stale-after
  "How long a row may stay in an in-flight status before it reads as `:failed`."
  (Duration/ofMinutes 10))

(def ^:private in-flight-database-statuses
  #{:provisioning :deprovisioning})

(mu/defn stale-before :- (ms/InstanceOfClass OffsetDateTime)
  "The instant before which an in-flight row, last updated then, reads as `:failed` at `now`."
  [now :- (ms/InstanceOfClass OffsetDateTime)]
  (.minus now stale-after))

(mu/defn database-status :- ::database-status
  "The status a `workspace_database` row with `status`, last updated at `updated-at`, reads as at `now`: `status`, or
  `:failed` when that is in flight and `updated-at` is more than [[stale-after]] before `now`."
  [status     :- ::database-status
   updated-at :- (ms/InstanceOfClass OffsetDateTime)
   now        :- (ms/InstanceOfClass OffsetDateTime)]
  (if (and (in-flight-database-statuses status)
           (.isBefore ^OffsetDateTime updated-at (stale-before now)))
    :failed
    status))

(mu/defn transition-database-status!
  "Move the `workspace_database` row with `id` to status `to` if it reads as one of `from` (see [[database-status]]),
  in a single conditional UPDATE. Throws a 404 when there is no such row, and a 409 naming the status it reads as when
  the row is in another status, such as when a concurrent request changed it first."
  [id   :- ms/PositiveInt
   from :- [:set {:min 1} ::database-status]
   to   :- ::database-status]
  (let [now        (OffsetDateTime/now)
        stale-from (if (from :failed) in-flight-database-statuses #{})]
    (when (zero? (ws.db/update-workspace-database-status! id from stale-from (stale-before now) to))
      (let [row (ws.db/workspace-database-without-details id)]
        (when-not row
          (throw (ex-info (tru "Workspace database {0} not found." id)
                          {:status-code 404, :workspace-database-id id})))
        (let [status (database-status (:status row) (:updated_at row) now)]
          (throw (ex-info (tru "Workspace database {0} is {1}, not {2}." id (name status)
                               (str/join ", " (sort (map name from))))
                          {:status-code 409, :workspace-database-id id, :status status})))))))
