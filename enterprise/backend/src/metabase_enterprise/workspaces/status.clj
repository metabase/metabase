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

(mr/def ::schema-status
  [:enum :adding :active :removing :failed])

(def stale-after
  "How long a row may stay in an in-flight status before it reads as `:failed`."
  (Duration/ofMinutes 10))

(def ^:private kinds
  {:database {:table     :workspace_database
              :in-flight #{:provisioning :deprovisioning}
              :row-fn    ws.db/workspace-database-without-details
              :noun      "Workspace database"}
   :schema   {:table     :workspace_schema
              :in-flight #{:adding :removing}
              :row-fn    ws.db/workspace-schema
              :noun      "Workspace schema"}})

(mu/defn stale-before :- (ms/InstanceOfClass OffsetDateTime)
  "The instant before which an in-flight row, last updated then, reads as `:failed` at `now`."
  [now :- (ms/InstanceOfClass OffsetDateTime)]
  (.minus now stale-after))

(defn- reads-as
  [kind status ^OffsetDateTime updated-at now]
  (if (and ((get-in kinds [kind :in-flight]) status)
           (.isBefore updated-at (stale-before now)))
    :failed
    status))

(defn- transition!
  [kind id from to]
  (let [{:keys [table in-flight row-fn noun]} (kinds kind)
        now        (OffsetDateTime/now)
        stale-from (if (from :failed) in-flight #{})]
    (when (zero? (ws.db/update-status! table id from stale-from (stale-before now) to))
      (let [row (row-fn id)]
        (when-not row
          (throw (ex-info (tru "{0} {1} not found." noun id)
                          {:status-code 404, :id id})))
        (let [status (reads-as kind (:status row) (:updated_at row) now)]
          (throw (ex-info (tru "{0} {1} is {2}, not {3}." noun id (name status)
                               (str/join ", " (sort (map name from))))
                          {:status-code 409, :id id, :status status})))))))

(mu/defn database-status :- ::database-status
  "The status a `workspace_database` row with `status`, last updated at `updated-at`, reads as at `now`: `status`, or
  `:failed` when that is `:provisioning` or `:deprovisioning` and `updated-at` is more than [[stale-after]] before
  `now`."
  [status     :- ::database-status
   updated-at :- (ms/InstanceOfClass OffsetDateTime)
   now        :- (ms/InstanceOfClass OffsetDateTime)]
  (reads-as :database status updated-at now))

(mu/defn schema-status :- ::schema-status
  "The status a `workspace_schema` row with `status`, last updated at `updated-at`, reads as at `now`: `status`, or
  `:failed` when that is `:adding` or `:removing` and `updated-at` is more than [[stale-after]] before `now`."
  [status     :- ::schema-status
   updated-at :- (ms/InstanceOfClass OffsetDateTime)
   now        :- (ms/InstanceOfClass OffsetDateTime)]
  (reads-as :schema status updated-at now))

(mu/defn transition-database-status!
  "Move the `workspace_database` row with `id` to status `to` if it reads as one of `from` (see [[database-status]]),
  in a single conditional UPDATE. Throws a 404 when there is no such row, and a 409 naming the status it reads as when
  the row is in another status, such as when a concurrent request changed it first."
  [id   :- ms/PositiveInt
   from :- [:set {:min 1} ::database-status]
   to   :- ::database-status]
  (transition! :database id from to))

(mu/defn transition-schema-status!
  "Move the `workspace_schema` row with `id` to status `to` if it reads as one of `from` (see [[schema-status]]), like
  [[transition-database-status!]]."
  [id   :- ms/PositiveInt
   from :- [:set {:min 1} ::schema-status]
   to   :- ::schema-status]
  (transition! :schema id from to))
