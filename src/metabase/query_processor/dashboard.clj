(ns metabase.query-processor.dashboard
  "Code for running a query in the context of a specific DashboardCard."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.driver.common.parameters.operators :as params.ops]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models.dashboard :as dashboard :refer [Dashboard]]
   [metabase.models.dashboard-card :refer [DashboardCard]]
   [metabase.models.dashboard-card-series :refer [DashboardCardSeries]]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan.db :as db]
   [toucan2.core :as t2]))

(defn- check-card-and-dashcard-are-in-dashboard
  "Check that the Card with `card-id` is in Dashboard with `dashboard-id`, either in the DashboardCard with
  `dashcard-id` at the top level or as a series. If not such relationship exists this will throw a 404 Exception."
  [dashboard-id card-id dashcard-id]
  (api/check-404
   (or (db/exists? DashboardCard
         :id           dashcard-id
         :dashboard_id dashboard-id
         :card_id      card-id)
       (and
        (db/exists? DashboardCard
          :id           dashcard-id
          :dashboard_id dashboard-id)
        (db/exists? DashboardCardSeries
          :card_id          card-id
          :dashboardcard_id dashcard-id)))))

(defn- resolve-param-for-card
  [card-id dashcard-id param-id->param {param-id :id, :as request-param}]
  (when-not param-id
    (throw (ex-info (tru "Unable to resolve invalid query parameter: parameter is missing :id")
                    {:type              qp.error-type/invalid-parameter
                     :invalid-parameter request-param})))
  (log/tracef "Resolving parameter %s\n%s" (pr-str param-id) (u/pprint-to-str request-param))
  ;; find information about this dashboard parameter by its parameter `:id`. If no parameter with this ID
  ;; exists, it is an error.
  (let [matching-param (or (get param-id->param param-id)
                           (throw (ex-info (tru "Dashboard does not have a parameter with ID {0}." (pr-str param-id))
                                           {:type        qp.error-type/invalid-parameter
                                            :status-code 400})))]
    (log/tracef "Found matching Dashboard parameter\n%s" (u/pprint-to-str (update matching-param :mappings (fn [mappings]
                                                                                                             (into #{} (map #(dissoc % :dashcard)) mappings)))))
    ;; now find the mapping for this specific card. If there is no mapping, we can just ignore this parameter.
    (when-let [matching-mapping (or (some (fn [mapping]
                                            (when (and (= (:card_id mapping) card-id)
                                                       (= (get-in mapping [:dashcard :id]) dashcard-id))
                                              mapping))
                                          (:mappings matching-param))
                                    (log/tracef "Parameter has no mapping for Card %d; skipping" card-id))]
      (log/tracef "Found matching mapping for Card %d, Dashcard %d:\n%s"
                  card-id dashcard-id
                  (u/pprint-to-str (update matching-mapping :dashcard #(select-keys % [:id :parameter_mappings]))))
      ;; if `request-param` specifies type, then validate that the type is allowed
      (when (:type request-param)
        (qp.card/check-allowed-parameter-value-type
         param-id
         (or (when (= (:type matching-param) :dimension)
               (:widget-type matching-param))
             (:type matching-param))
         (:type request-param)))
      ;; ok, now return the merged parameter info map.
      (merge
       {:type (:type matching-param)}
       request-param
       ;; if value comes in as a lone value for an operator filter type (as will be the case for embedding) wrap it in a
       ;; vector so the parameter handling code doesn't explode.
       (let [value (:value request-param)]
         (when (and (params.ops/operator? (:type matching-param))
                    (if (string? value)
                      (not (str/blank? value))
                      (some? value))
                    (not (sequential? value)))
           {:value [value]}))
       {:id     param-id
        :target (:target matching-mapping)}))))

;; DashboardCard parameter mappings can specify default values, and we need to make sure the parameters map returned
;; by [[resolve-params-for-query]] includes entries for any default values. So we'll do this by creating a entries for
;; all the parameters with defaults, and then merge together a map of param-id->default-entry with a map of
;; param-id->request-entry (so the value from the request takes precedence over the default value)

(defn- dashboard-param-defaults
  "Construct parameter entries for any parameters with default values in `dashboard-param-id->param` as returned
  by [[dashboard/dashboard->resolved-params]]."
  [dashboard-param-id->param card-id]
  (into
   {}
   (comp (filter (fn [[_ {:keys [default]}]]
                   default))
         (map (fn [[param-id {:keys [default mappings]}]]
                [param-id {:id      param-id
                           :default default
                           ;; make sure we include target info so we can actually map this back to a template
                           ;; tag/param declaration
                           :target (some (fn [{mapping-card-id :card_id, :keys [target]}]
                                            (when (= mapping-card-id card-id)
                                              target))
                                         mappings)}]))
         (filter (fn [[_ {:keys [target]}]]
                   target)))
   dashboard-param-id->param))

(s/defn ^:private resolve-params-for-query :- (s/maybe [su/Map])
  "Given a sequence of parameters included in a query-processing request to run the query for a Dashboard/Card, validate
  that those parameters exist and have allowed types, and merge in default values and other info from the parameter
  mappings."
  [dashboard-id   :- su/IntGreaterThanZero
   card-id        :- su/IntGreaterThanZero
   dashcard-id    :- su/IntGreaterThanZero
   request-params :- (s/maybe [su/Map])]
  (log/tracef "Resolving Dashboard %d Card %d query request parameters" dashboard-id card-id)
  (let [request-params            (mbql.normalize/normalize-fragment [:parameters] request-params)
        ;; ignore default values in request params as well. (#20516)
        request-params            (for [param request-params]
                                    (dissoc param :default))
        dashboard                 (api/check-404 (t2/select-one Dashboard :id dashboard-id))
        dashboard-param-id->param (into {}
                                        ;; remove the `:default` values from Dashboard params. We don't ACTUALLY want to
                                        ;; use these values ourselves -- the expectation is that the frontend will pass
                                        ;; them in as an actual `:value` if it wants to use them. If we leave them
                                        ;; around things get confused and it prevents us from actually doing the
                                        ;; expected `1 = 1` substitution for Field filters. See comments in #20503 for
                                        ;; more information.
                                        (map (fn [[param-id param]]
                                               [param-id (dissoc param :default)]))
                                        (dashboard/dashboard->resolved-params dashboard))
        request-param-id->param   (into {} (map (juxt :id identity)) request-params)
        merged-parameters         (vals (merge (dashboard-param-defaults dashboard-param-id->param card-id)
                                               request-param-id->param))]
    (log/tracef "Dashboard parameters:\n%s\nRequest parameters:\n%s\nMerged:\n%s"
                (u/pprint-to-str (->> dashboard-param-id->param
                                      (m/map-vals (fn [param]
                                                    (update param :mappings (fn [mappings]
                                                                              (into #{} (map #(dissoc % :dashcard)) mappings)))))))
                (u/pprint-to-str request-param-id->param)
                (u/pprint-to-str merged-parameters))
    (u/prog1
      (into [] (comp (map (partial resolve-param-for-card card-id dashcard-id dashboard-param-id->param))
                     (filter some?))
            merged-parameters)
      (log/tracef "Resolved =>\n%s" (u/pprint-to-str <>)))))

(defn run-query-for-dashcard-async
  "Like [[metabase.query-processor.card/run-query-for-card-async]], but runs the query for a `DashboardCard` with
  `parameters` and `constraints`. Returns a `metabase.async.streaming_response.StreamingResponse` (see
  [[metabase.async.streaming-response]]). Will throw an Exception if preconditions such as proper permissions are not
  met before returning the `StreamingResponse`.

  See [[metabase.query-processor.card/run-query-for-card-async]] for more information about the various parameters."
  {:arglists '([& {:keys [dashboard-id card-id dashcard-id export-format parameters ignore_cache constraints parameters middleware]}])}
  [& {:keys [dashboard-id card-id dashcard-id parameters export-format]
      :or   {export-format :api}
      :as   options}]
  ;; make sure we can read this Dashboard. Card will get read-checked later on inside
  ;; [[qp.card/run-query-for-card-async]]
  (api/read-check Dashboard dashboard-id)
  (check-card-and-dashcard-are-in-dashboard dashboard-id card-id dashcard-id)
  (let [resolved-params (resolve-params-for-query dashboard-id card-id dashcard-id parameters)
        options         (merge
                         {:ignore_cache false
                          :constraints  (qp.constraints/default-query-constraints)
                          :context      :dashboard}
                         options
                         {:parameters   resolved-params
                          :dashboard-id dashboard-id})]
    (log/tracef "Running Query for Dashboard %d, Card %d, Dashcard %d with options\n%s"
                dashboard-id card-id dashcard-id
                (u/pprint-to-str options))
    ;; we've already validated our parameters, so we don't need the [[qp.card]] namespace to do it again
    (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
      (m/mapply qp.card/run-query-for-card-async card-id export-format options))))
