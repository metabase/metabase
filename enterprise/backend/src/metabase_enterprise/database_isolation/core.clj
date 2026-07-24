(ns metabase-enterprise.database-isolation.core
  "Standing schema-level isolation for a warehouse database.

   [[provision!]] creates (or reuses) a dedicated warehouse schema plus a
   confined principal — write access only inside that schema, read-only on the
   requested namespaces — and returns an opaque isolation id. [[with-isolation]]
   is the sole eliminator: it runs its body with every connection to the
   database swapped to the confined principal, so a mis-targeted write fails at
   the warehouse with a permission error. [[decommission!]] tears the warehouse
   resources down; [[sweep-stale!]] garbage-collects idle isolations.

   One isolation per database; the id is the capability handle. Consumers never
   see the row or the credentials."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.database-isolation.models.database-isolation]
   [metabase-enterprise.database-isolation.provisioner :as iso.provisioner]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.util :as driver.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(comment metabase-enterprise.database-isolation.models.database-isolation/keep-me)

(mr/def ::provisioner
  [:fn {:error/message "a DatabaseProvisioner"}
   #(satisfies? iso.provisioner/DatabaseProvisioner %)])

(mr/def ::database
  [:map [:id pos-int?] [:engine :any]])

(def ^:private in-flight-statuses
  #{:provisioning :decommissioning})

(defn- iso-descriptor
  "The descriptor map the driver isolation multimethods derive warehouse
   identifiers from. The `iso` prefix keeps the generated names disjoint from
   workspace ones (whose descriptor ids are bare WorkspaceDatabase row ids)."
  [row-id]
  {:id   (str "iso" row-id)
   :name (str "database-isolation-" row-id)})

(defn- assert-driver-support!
  [database]
  (let [driver (driver.u/database->driver database)]
    ;; :workspace is the historical support key for the driver isolation
    ;; multimethods; renaming it to something workspace-neutral is deferred.
    (when-not (driver.u/supports? driver :workspace database)
      (throw (ex-info (tru "Driver {0} does not support database isolation." driver)
                      {:error-type  ::unsupported-driver
                       :status-code 400
                       :driver      driver
                       :database-id (:id database)})))))

(defn- busy! [row]
  (throw (ex-info (tru "Database isolation {0} has a lifecycle transition in flight." (:id row))
                  {:error-type   ::isolation-busy
                   :status-code  409
                   :isolation-id (:id row)
                   :status       (:status row)})))

(defn- provision-init!
  "Run details → init! → grant! for a row already claimed as `:provisioning`;
   persist the outcome. Throws `::provisioning-failed` (recording the failure
   on the row) — never falls back."
  [provisioner database row-id read-namespaces]
  (try
    (let [driver (driver.u/database->driver database)
          iso    (iso-descriptor row-id)
          iso*   (merge iso (iso.provisioner/details provisioner driver database iso))]
      (iso.provisioner/init! provisioner driver database iso*)
      (iso.provisioner/grant! provisioner driver database iso* (vec read-namespaces))
      (t2/update! :model/DatabaseIsolation row-id
                  {:schema           (:schema iso*)
                   :database_details (:database_details iso*)
                   :read_namespaces  (vec (sort read-namespaces))
                   :status           :provisioned
                   :status_details   nil
                   :last_used_at     :%now})
      row-id)
    (catch Throwable e
      (t2/update! :model/DatabaseIsolation row-id
                  {:status :provisioning-failure, :status_details (ex-message e)})
      (throw (ex-info (tru "Provisioning database isolation failed: {0}" (ex-message e))
                      {:error-type   ::provisioning-failed
                       :status-code  500
                       :database-id  (:id database)
                       :isolation-id row-id}
                      e)))))

(defn- regrant!
  "Grant read on any of `read-namespaces` the provisioned `row` does not already
   hold, and persist the union. No-op (no DDL) when nothing is missing."
  [provisioner database row read-namespaces]
  (let [existing (set (:read_namespaces row))
        missing  (vec (sort (remove existing read-namespaces)))]
    (when (seq missing)
      (let [driver (driver.u/database->driver database)
            iso    (merge (iso-descriptor (:id row))
                          (select-keys row [:schema :database_details]))]
        (try
          (iso.provisioner/grant! provisioner driver database iso missing)
          (t2/update! :model/DatabaseIsolation (:id row)
                      {:read_namespaces (vec (sort (into existing missing)))})
          (catch Throwable e
            (throw (ex-info (tru "Granting read access for database isolation failed: {0}" (ex-message e))
                            {:error-type   ::provisioning-failed
                             :status-code  500
                             :isolation-id (:id row)
                             :namespaces   missing}
                            e))))))
    (:id row)))

(mu/defn provision! :- pos-int?
  "Idempotent acquire of the standing isolation for `database`: returns its
   isolation id. Reuses a live provisioned isolation (granting read on any
   namespaces in `read-namespaces` it does not already hold — grant composition
   is a set union); otherwise creates the warehouse schema + confined principal
   and persists the row. Single-flight per row via a conditional status UPDATE.

   Throws `::unsupported-driver` when the driver has no isolation impl,
   `::isolation-busy` when a transition is already in flight, and
   `::provisioning-failed` on any warehouse failure — never a silent fallback.

   Must not be called inside a [[with-isolation]] frame for the same database:
   the provisioning DDL would run as the confined principal."
  ([database read-namespaces]
   (provision! database read-namespaces iso.provisioner/database-provisioner))
  ([database        :- ::database
    read-namespaces :- [:set :string]
    provisioner     :- ::provisioner]
   (assert-driver-support! database)
   (let [db-id (:id database)]
     (loop [attempt 0]
       (let [row (t2/select-one :model/DatabaseIsolation :database_id db-id)]
         (cond
           (nil? row)
           (let [[row-id insert-error]
                 (try
                   [(t2/insert-returning-pk! :model/DatabaseIsolation
                                             {:database_id     db-id
                                              :status          :provisioning
                                              :read_namespaces []})
                    nil]
                   (catch Throwable e [nil e]))]
             (cond
               row-id
               (provision-init! provisioner database row-id read-namespaces)

               ;; unique-constraint race: someone else inserted; re-dispatch on their row
               (and (< attempt 3) (t2/exists? :model/DatabaseIsolation :database_id db-id))
               (recur (inc attempt))

               :else
               (throw insert-error)))

           (= :provisioned (:status row))
           (regrant! provisioner database row read-namespaces)

           (in-flight-statuses (:status row))
           (busy! row)

           ;; failure state — claim the retry with the conditional-UPDATE guard
           :else
           (if (pos? (t2/update! :model/DatabaseIsolation
                                 :id (:id row)
                                 :status [:not-in (conj in-flight-statuses :provisioned)]
                                 {:status :provisioning, :status_details nil}))
             (provision-init! provisioner database (:id row) read-namespaces)
             (if (< attempt 3)
               (recur (inc attempt))
               (busy! row)))))))))

(defn- provisioned-row
  "The `:provisioned` isolation row for `isolation-id`, or a loud
   `::unknown-isolation` throw — possession of a valid id is the only way in."
  [isolation-id]
  (let [row (t2/select-one :model/DatabaseIsolation :id isolation-id)]
    (when-not (and row (= :provisioned (:status row)))
      (throw (ex-info (tru "No provisioned database isolation with id {0}." isolation-id)
                      {:error-type   ::unknown-isolation
                       :status-code  404
                       :isolation-id isolation-id
                       :status       (:status row)})))
    row))

(mu/defn isolation-schema :- :string
  "The warehouse schema of provisioned isolation `isolation-id` — the only
   namespace its principal can write. Throws `::unknown-isolation`."
  [isolation-id :- pos-int?]
  (:schema (provisioned-row isolation-id)))

(defn do-with-isolation
  "Impl for [[with-isolation]]."
  [isolation-id thunk]
  (let [row (provisioned-row isolation-id)]
    (t2/update! :model/DatabaseIsolation (:id row) {:last_used_at :%now})
    (driver.conn/with-swapped-connection-details (:database_id row) (:database_details row)
      (thunk))))

(defmacro with-isolation
  "Run `body` inside isolation `isolation-id`: every connection to the
   isolation's database resolves the confined principal's credentials for the
   dynamic scope, so a write outside the isolation schema is a warehouse
   permission error. Total: either enters the frame or throws
   `::unknown-isolation`. Touches the isolation's `last_used_at`.

   Frames for the same database do not nest (the underlying connection swap
   throws)."
  {:style/indent 1}
  [isolation-id & body]
  `(do-with-isolation ~isolation-id (fn [] ~@body)))

(mu/defn decommission! :- :nil
  "Destroy the warehouse resources of isolation `isolation-id` (schema, tables,
   principal) and delete the row. Idempotent: unknown id is a no-op. Works from
   any non-in-flight state — identifiers are the persisted ones, or recomputed
   from the row id when provisioning crashed before persisting. Throws
   `::isolation-busy` mid-transition, `::decommission-failed` on warehouse
   failure (recorded on the row; retryable)."
  ([isolation-id]
   (decommission! isolation-id iso.provisioner/database-provisioner))
  ([isolation-id :- pos-int?
    provisioner  :- ::provisioner]
   (when-let [row (t2/select-one :model/DatabaseIsolation :id isolation-id)]
     (when (zero? (t2/update! :model/DatabaseIsolation
                              :id isolation-id
                              :status [:not-in in-flight-statuses]
                              {:status :decommissioning, :status_details nil}))
       (busy! row))
     (try
       (let [database (t2/select-one :model/Database :id (:database_id row))
             driver   (driver.u/database->driver database)
             iso      (iso-descriptor isolation-id)
             computed (delay (iso.provisioner/details provisioner driver database iso))
             schema   (or (not-empty (:schema row)) (:schema @computed))
             details  (if (seq (:database_details row))
                        (:database_details row)
                        (:database_details @computed))]
         (iso.provisioner/destroy! provisioner driver database
                                   (assoc iso :schema schema :database_details details))
         (t2/delete! :model/DatabaseIsolation :id isolation-id))
       (catch Throwable e
         (t2/update! :model/DatabaseIsolation isolation-id
                     {:status :decommissioning-failure, :status_details (ex-message e)})
         (throw (ex-info (tru "Decommissioning database isolation failed: {0}" (ex-message e))
                         {:error-type   ::decommission-failed
                          :status-code  500
                          :isolation-id isolation-id}
                         e)))))
   nil))

(mu/defn sweep-stale! :- [:sequential pos-int?]
  "Decommission every provisioned isolation whose `last_used_at` is older than
   `:idle-for` (a `java.time.Duration`). Per-isolation failures are logged and
   skipped so one broken teardown cannot wedge the sweep. Returns the ids
   decommissioned."
  ([opts]
   (sweep-stale! opts iso.provisioner/database-provisioner))
  ([{:keys [idle-for]} :- [:map [:idle-for (ms/InstanceOfClass java.time.Duration)]]
    provisioner :- ::provisioner]
   (let [cutoff (t/minus (t/offset-date-time) idle-for)]
     (into []
           (keep (fn [id]
                   (try
                     (decommission! id provisioner)
                     id
                     (catch Throwable e
                       (log/warnf e "Failed to decommission stale database isolation %d" id)
                       nil))))
           (t2/select-pks-vec :model/DatabaseIsolation
                              :status :provisioned
                              :last_used_at [:< cutoff])))))
