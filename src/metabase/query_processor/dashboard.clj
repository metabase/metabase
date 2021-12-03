(ns metabase.query-processor.dashboard
  "Code for running a query in the context of a specific DashboardCard."
  (:require [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase.api.common :as api]
            [metabase.models.dashboard :as dashboard :refer [Dashboard]]
            [metabase.models.dashboard-card :refer [DashboardCard]]
            [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
            [metabase.query-processor.card :as qp.card]
            [metabase.query-processor.error-type :as qp.error-type]
            [metabase.query-processor.middleware.constraints :as constraints]
            [metabase.util :as u]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- check-card-is-in-dashboard
  "Check that the Card with `card-id` is in Dashboard with `dashboard-id`, either in a DashboardCard at the top level or
  as a series, or throw an Exception. If not such relationship exists this will throw a 404 Exception."
  [card-id dashboard-id]
  (api/check-404
   (or (db/exists? DashboardCard
         :dashboard_id dashboard-id
         :card_id      card-id)
       (when-let [dashcard-ids (db/select-ids DashboardCard :dashboard_id dashboard-id)]
         (db/exists? DashboardCardSeries
           :card_id          card-id
           :dashboardcard_id [:in dashcard-ids])))))

(defn- resolve-param-for-card
  [card-id param-id->param {param-id :id, :as request-param}]
  (log/tracef "Resolving parameter %s\n%s" (pr-str param-id) (u/pprint-to-str request-param))
  ;; find information about this dashboard parameter by its parameter `:id`. If no parameter with this ID
  ;; exists, it is an error.
  (let [matching-param (or (get param-id->param param-id)
                           (throw (ex-info (tru "Dashboard does not have a parameter with ID {0}." (pr-str param-id))
                                           {:type        qp.error-type/invalid-parameter
                                            :status-code 400})))]
    (log/tracef "Found matching Dashboard parameter\n%s" (u/pprint-to-str matching-param))
    ;; now find the mapping for this specific card. If there is no mapping, we can just ignore this parameter.
    (when-let [matching-mapping (or (some (fn [mapping]
                                            (when (= (:card_id mapping) card-id)
                                              mapping))
                                          (:mappings matching-param))
                                    (log/tracef "Parameter has no mapping for Card %d; skipping" card-id))]
      (log/tracef "Found matching mapping for Card %d:\n%s" card-id (u/pprint-to-str matching-mapping))
      (merge
       {:type (:type matching-param)}
       request-param
       {:id     param-id
        :target (:target matching-mapping)}))))

(s/defn ^:private resolve-params-for-query :- (s/maybe [{s/Keyword s/Any}])
  [dashboard-id   :- su/IntGreaterThanZero
   card-id        :- su/IntGreaterThanZero
   request-params :- (s/maybe [{s/Keyword s/Any}])]
  (when (seq request-params)
    (log/tracef "Resolving Dashboard %d Card %d query request parameters" dashboard-id card-id)
    (let [dashboard       (api/check-404 (db/select-one Dashboard :id dashboard-id))
          param-id->param (dashboard/dashboard->resolved-params dashboard)]
      (log/tracef "Dashboard parameters:\n%s" (u/pprint-to-str param-id->param))
      (u/prog1
        (into [] (comp (map (partial resolve-param-for-card card-id param-id->param))
                       (filter some?))
              request-params)
        (log/tracef "Resolved =>\n%s" (u/pprint-to-str <>))))))

(defn run-query-for-dashcard-async
  "Like [[metabase.query-processor.card/run-query-for-card-async]], but runs the query for a `DashboardCard` with
  `parameters` and `constraints`. Returns a `metabase.async.streaming_response.StreamingResponse` (see
  [[metabase.async.streaming-response]]). Will throw an Exception if preconditions such as proper permissions are not
  met before returning the `StreamingResponse`.

  See [[metabase.query-processor.card/run-query-for-card-async]] for more information about the various parameters."
  {:arglists '([& {:keys [export-format parameters ignore_cache constraints parameters middleware]}])}
  [& {:keys [dashboard-id card-id parameters export-format]
      :or   {export-format :api}
      :as   options}]
  ;; make sure we can read this Dashboard. Card will get read-checked later on inside
  ;; [[qp.card/run-query-for-card-async]]
  (api/read-check Dashboard dashboard-id)
  (check-card-is-in-dashboard card-id dashboard-id)
  (let [params  (resolve-params-for-query dashboard-id card-id parameters)
        options (merge
                 {:ignore_cache false
                  :constraints  constraints/default-query-constraints
                  :context      :dashboard}
                 options
                 {:parameters   params
                  :dashboard-id dashboard-id})]
    ;; we've already validated our parameters, so we don't need the [[qp.card]] namespace to do it again
    (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
      (m/mapply qp.card/run-query-for-card-async card-id export-format options))))
