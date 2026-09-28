(ns metabase.dashboards.card-run-perms
  "Adding a Card to a Dashboard (as a dashcard, an additional series, or a parameter values source) requires permission
  to view the Card's results. Public and embedded Dashboards run their Cards as an admin, so a Card that only needed to
  be readable to add would let an editor leak data they have no access to. Enforced by model hooks so every write path
  is covered."
  (:require
   [metabase.api.common :as api]
   [metabase.dashboards.db :as dashboards.db]
   [metabase.queries.core :as queries]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]))

(defn check-enabled?
  "Whether adding Cards to Dashboards is checked right now: only for a non-admin current user; system writes skip it."
  []
  (and api/*current-user-id*
       (not api/*is-superuser?*)))

(defn can-run-card?
  "Whether the current user could run the saved Card with `card-id` and `query`, i.e. the same check as running it from
  its own page (read on the Card plus view-data on what it touches; ad-hoc query perms are not needed)."
  [card-id query]
  (or (not (check-enabled?))
      ;; a query with no database can't run for anyone (public/embed included), so there's nothing to leak
      (nil? (:database query))
      (let [query (try
                    (qp.preprocess/preprocess query)
                    (catch Throwable e
                      (log/debugf e "Could not preprocess query for Card %d; checking perms on the saved query" card-id)
                      query))]
        (try
          (qp.setup/with-qp-setup [query query]
            (binding [qp.perms/*card-id* card-id]
              (qp.perms/check-query-permissions* query)))
          true
          (catch Throwable e
            ;; fail closed; anything other than a permission denial is unexpected, so make it visible
            (if (:permissions-error? (ex-data e))
              (log/debugf "Current user cannot run Card %d" card-id)
              (log/warnf e "Error checking whether the current user can run Card %d; treating it as denied" card-id))
            false)))))

(defn check-can-add-cards-to-dashboard!
  "Throw a 403 unless the current user can run every Card in `card-ids` that the Dashboard with `dashboard-id` does not
  already reference. `dashboard-id` may be nil for a Dashboard not yet inserted. No-op without a current user (system
  writes) or for superusers."
  [dashboard-id card-ids]
  (when (check-enabled?)
    (let [card-ids (cond-> (set (remove nil? card-ids))
                     dashboard-id (as-> ids (apply disj ids (dashboards.db/dashboard-referenced-card-ids dashboard-id))))]
      (doseq [[card-id query] (when (seq card-ids) (dashboards.db/card-queries card-ids))]
        (when-not (can-run-card? card-id query)
          (throw (ex-info (tru "You do not have permissions to run the query for this card, so it can''t be added to a dashboard.")
                          {:status-code 403
                           :card-id     card-id})))))))

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
