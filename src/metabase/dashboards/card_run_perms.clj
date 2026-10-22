(ns metabase.dashboards.card-run-perms
  "Adding a Card to a Dashboard (as a dashcard, an additional series, or a parameter values source) requires permission
  to run the Card. Enforced by model hooks so every write path is covered."
  (:require
   [metabase.api.common :as api]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.queries.core :as queries]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.i18n :refer [tru]]))

;; Toucan insert hooks run once per row and take no extra arguments, so a per-write cache has to be ambient.
#_{:clj-kondo/ignore [:metabase/discourage-dynamic-vars]}
(def ^:private ^:dynamic *write-cache*
  "When bound, an atom of `{:runnable #{card-id} :removed {dashboard-id #{card-id}}}` for the current write:
  `:runnable` holds the Cards already found runnable by the current user, so a Card checked up front isn't checked
  again by every insert hook; `:removed` holds the Cards each Dashboard had removed earlier in the write, which still
  count as already on it (a write deletes before it inserts)."
  nil)

(defn do-with-run-check-cache
  "Run `thunk` with Card run checks cached for its duration. Nested calls share the outer cache."
  [thunk]
  (if *write-cache*
    (thunk)
    (binding [*write-cache* (atom {:runnable #{} :removed {}})]
      (thunk))))

(defmacro with-run-check-cache
  "Run `body` with Card run checks cached for its duration. See [[do-with-run-check-cache]]."
  [& body]
  `(do-with-run-check-cache (fn [] ~@body)))

(defn mark-runnable!
  "Record that the current user may run the Cards with `card-ids`, e.g. copies of Cards already checked. No-op outside
  [[with-run-check-cache]]."
  [card-ids]
  (some-> *write-cache* (swap! update :runnable into card-ids)))

(defn- known-runnable? [card-id]
  (some-> *write-cache* deref :runnable (contains? card-id)))

(defn check-enabled?
  "Whether adding Cards to Dashboards is checked right now: only for a non-admin current user; system writes skip it."
  []
  (boolean (and api/*current-user-id*
                (not api/*is-superuser?*))))

(defn tracking-removals?
  "Whether Cards removed from a Dashboard right now should be recorded with [[note-removed-cards!]]: only inside
  [[with-run-check-cache]] and when checks are enabled."
  []
  (boolean (and *write-cache* (check-enabled?))))

(defn note-removed-cards!
  "Record that the Cards with `card-ids` were removed from the Dashboard with `dashboard-id` during this write, so adding
  them back later in the same write isn't treated as adding something new. No-op outside [[with-run-check-cache]]."
  [dashboard-id card-ids]
  (some-> *write-cache* (swap! update-in [:removed dashboard-id] (fnil into #{}) (remove nil?) card-ids)))

(defn can-run-card?
  "Whether the current user could run the saved Card with `card-id` and `query`, i.e. the same check as running it from
  its own page (read on the Card plus view-data on what it touches; ad-hoc query perms are not needed)."
  [card-id query]
  (or (not (check-enabled?))
      (known-runnable? card-id)
      (when (query-perms/can-run-saved-card? card-id query)
        (mark-runnable! [card-id])
        true)
      false))

(defn- exempt-card-ids
  "Cards already on the Dashboard in a way that covers `adding-as`. A parameter values source doesn't cover adding the
  same Card as a dashcard or series."
  [dashboard-id adding-as]
  (case adding-as
    :dashcard         (into (or (some-> *write-cache* deref :removed (get dashboard-id)) #{})
                            (concat (dashboards.db/dashcard-card-ids dashboard-id)
                                    (dashboards.db/dashcard-series-card-ids dashboard-id)))
    :parameter-source (dashboards.db/dashboard-referenced-card-ids dashboard-id)))

(defn check-can-add-cards-to-dashboard!
  "Throw a 403 unless the current user can run every Card in `card-ids` that the Dashboard with `dashboard-id` does not
  already expose. `adding-as` is `:dashcard` (a dashcard's Card or a series) or `:parameter-source`. `dashboard-id` may
  be nil for a Dashboard not yet inserted. No-op without a current user (system writes) or for superusers."
  [dashboard-id adding-as card-ids]
  (when (check-enabled?)
    (let [card-ids (into #{} (remove #(or (nil? %) (known-runnable? %))) card-ids)
          card-ids (cond-> card-ids
                     (and dashboard-id (seq card-ids)) (as-> ids (apply disj ids (exempt-card-ids dashboard-id adding-as))))]
      (doseq [[card-id query] (when (seq card-ids) (dashboards.db/card-queries card-ids))]
        (when-not (can-run-card? card-id query)
          (throw (ex-info (tru "You do not have permissions to run the query for this card, so it can''t be added to a dashboard.")
                          {:status-code 403})))))))

(defn remove-unrunnable-values-sources
  "Drop the Card values source from any of `parameters` whose source Card the current user cannot run, so a copied
  Dashboard doesn't pick up a Card its creator couldn't add."
  [parameters]
  (if-not (check-enabled?)
    parameters
    (let [card-ids   (queries/values-source-card-ids parameters)
          unrunnable (into #{}
                           (keep (fn [[card-id query]] (when-not (can-run-card? card-id query) card-id)))
                           (when (seq card-ids) (dashboards.db/card-queries card-ids)))]
      (mapv (fn [param]
              (if (contains? unrunnable (get-in param [:values_source_config :card_id]))
                (dissoc param :values_source_type :values_source_config)
                param))
            parameters))))
