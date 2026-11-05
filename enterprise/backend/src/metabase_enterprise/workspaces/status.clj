(ns metabase-enterprise.workspaces.status
  "The status column of a workspace row is its lock. A request takes the lock by moving the row from the status it
  expects, in one conditional UPDATE that also sets a fresh random lock token, and a request whose UPDATE matches no
  row gets a 409. Its follow-up changes must present the token, so a request that stalled and lost the lock cannot
  overwrite the request that took it over. A row left in an in-flight status for longer than [[stale-after-minutes]]
  (by the app DB's clock, which writes `updated_at`) reads as `:failed`, so a crashed request does not hold its lock
  forever; a long request keeps it with [[refresh-lock!]]."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.workspaces.db :as ws.db]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(mr/def ::database-status
  [:enum :provisioning :provisioned :deprovisioning :failed])

(mr/def ::schema-status
  [:enum :adding :active :removing :failed])

(mr/def ::kind
  [:enum :database :schema])

(def stale-after-minutes
  "How long a row may stay in an in-flight status, without a [[refresh-lock!]], before it reads as `:failed`."
  10)

(def ^:private kinds
  {:database {:table     :workspace_database
              :in-flight #{:provisioning :deprovisioning}
              :row-fn    ws.db/workspace-database-without-details
              :noun      "Workspace database"}
   :schema   {:table     :workspace_schema
              :in-flight #{:adding :removing}
              :row-fn    ws.db/workspace-schema
              :noun      "Workspace schema"}})

(mu/defn staleness :- ::ws.db/staleness
  "When a row of `kind` reads as failed, for the queries that compute its `:stale` flag."
  [kind :- ::kind]
  {:in-flight (get-in kinds [kind :in-flight]), :minutes stale-after-minutes})

(mu/defn effective-status :- :keyword
  "The status a row read with its `:stale` flag (see [[staleness]]) reads as: `:failed` when stale, else its status."
  [status :- :keyword
   stale  :- :int]
  (if (= 1 stale) :failed status))

(defn new-lock-token
  "A fresh random lock token, for a row inserted in an in-flight status: the inserting request holds its lock."
  []
  (str (random-uuid)))

(defn- lost-lock!
  "Throws the 404 or 409 for a status change of the row of `kind` with `id` that matched nothing."
  [kind id from]
  (let [{:keys [row-fn noun]} (kinds kind)
        row                   (row-fn id (staleness kind))]
    (when-not row
      (throw (ex-info (tru "{0} {1} not found." noun id)
                      {:status-code 404, :id id})))
    (let [status (effective-status (:status row) (:stale row))]
      (throw (ex-info (tru "{0} {1} is {2}, not {3}, or another request holds it." noun id (name status)
                           (str/join ", " (sort (map name from))))
                      {:status-code 409, :id id, :status status})))))

(mu/defn take-lock! :- :string
  "Move the row of `kind` with `id` to status `to` if it reads as one of `from`, taking its lock, and return the new
  lock token. With `:failed` in `from`, a stale in-flight row is taken over. Throws a 404 when there is no such row,
  and a 409 naming the status it reads as when it is in another status, such as when a concurrent request changed it
  first."
  [kind :- ::kind
   id   :- ms/PositiveInt
   from :- [:set {:min 1} :keyword]
   to   :- :keyword]
  (let [{:keys [table in-flight]} (kinds kind)
        token                     (new-lock-token)
        stale-from                (if (from :failed) in-flight #{})]
    (when (zero? (ws.db/take-status! table id from stale-from stale-after-minutes to token))
      (lost-lock! kind id from))
    token))

(mu/defn change-status! :- :string
  "Move the row of `kind` with `id`, whose lock the caller holds with `token`, from one of `from` to `to`, and return
  the new lock token. Throws a 409 when the caller no longer holds the lock or the row is in another status."
  [kind  :- ::kind
   id    :- ms/PositiveInt
   token :- :string
   from  :- [:set {:min 1} :keyword]
   to    :- :keyword]
  (let [new-token (new-lock-token)]
    (when (zero? (ws.db/change-status! (get-in kinds [kind :table]) id token from to new-token))
      (lost-lock! kind id from))
    new-token))

(mu/defn refresh-lock! :- :nil
  "Restart the staleness clock of the row of `kind` with `id`, whose lock the caller holds with `token`, so a request
  that runs longer than [[stale-after-minutes]] is not taken over. Throws a 409 when the caller no longer holds it."
  [kind  :- ::kind
   id    :- ms/PositiveInt
   token :- :string]
  (when (zero? (ws.db/touch-lock! (get-in kinds [kind :table]) id token))
    (throw (ex-info (tru "{0} {1} is held by another request." (get-in kinds [kind :noun]) id)
                    {:status-code 409, :id id})))
  nil)
