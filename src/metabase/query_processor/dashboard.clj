(ns metabase.query-processor.dashboard
  "Code for running a query in the context of a specific DashboardCard."
  (:refer-clojure :exclude [some not-empty get-in])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.dashboards.schema :as dashboards.schema]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.params :as params]
   [metabase.permissions.core :as perms]
   [metabase.permissions.metric :as permissions.metric]
   [metabase.query-processor.card :as qp.card]
   [metabase.query-processor.db :as query-processor.db]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.parameters.operators :as params.ops]
   [metabase.users.models.user-parameter-value :as user-parameter-value]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [some not-empty get-in]]
   [steffan-westcott.clj-otel.api.trace.span :as span]))

(defn- check-card-and-dashcard-are-in-dashboard
  "Check that the Card with `card-id` is in Dashboard with `dashboard-id`, either in the already-loaded `dashcard` at the
  top level or as a series. If no such relationship exists this will throw a 404 Exception."
  [dashboard-id card-id dashcard]
  (let [dashcard-id (:id dashcard)]
    (api/check-404
     (and (= (:dashboard_id dashcard) dashboard-id)
          (or (= (:card_id dashcard) card-id)
              (query-processor.db/dashcard-series-exists? card-id dashcard-id))))))

(defn- current-dimension-mapping?
  [provider card query mapping]
  (let [target-key (lib-metric/field-ref->key (:target mapping))]
    (boolean
     (some #(= target-key (lib-metric/field-ref->key (-> % :mapping :target)))
           ;; Only the computed targets are read here, never the ids, but pass the card's real owner key anyway
           ;; rather than teach a second call site that it may lie about one.
           (lib-metric/compute-dimension-pairs provider (:entity_id card) query)))))

(defn- default-metric-dimension
  [provider query card]
  (let [metric-metadata {:lib/type           :metadata/metric
                         :id                 (:id card)
                         :dataset-query      (:dataset_query card)
                         :dimensions         (:dimensions card)
                         :dimension-mappings (:dimension_mappings card)}
        dimensions      (lib-metric/get-persisted-dimensions metric-metadata)
        mappings        (lib-metric/get-persisted-dimension-mappings metric-metadata)]
    (when-let [dimension (u/seek #(and (:default %)
                                       (not= :status/orphaned (:status %)))
                                 dimensions)]
      (when-let [mapping (u/seek #(= (:id dimension) (:dimension-id %)) mappings)]
        (when (current-dimension-mapping? provider card query mapping)
          (when-let [database-provider (lib-metric/database-provider-for-table provider (:table-id mapping))]
            (when (permissions.metric/can-use-dimension-mapping? database-provider (:database_id card) mapping)
              (let [field-id (lib-metric/dimension-target->field-id (:target mapping))]
                (cond-> (assoc dimension
                               :lib/type :metadata/dimension
                               :source-type :metric
                               :source-id (:id card)
                               :dimension-mapping mapping)
                  (and (not (seq (:sources dimension))) field-id)
                  (assoc :sources [{:type :field, :field-id field-id}]))))))))))

(defn card-with-default-metric-dimension
  "Replace a metric card's final-stage breakouts with its active default dimension when the current user can access it."
  [card]
  (if-not (= :metric (:type card))
    card
    (let [provider (lib-metric/metadata-provider)
          query    (lib/query provider (:dataset_query card))]
      (if-not (and (= 1 (count (:stages query)))
                   (lib/mbql-stage? query -1))
        card
        (if-let [dimension (default-metric-dimension provider query card)]
          (let [definition (lib-metric/from-metric-metadata
                            provider
                            (lib.metadata/metric (lib-be/application-database-metadata-provider (:database_id card)) (:id card)))
                breakout   (lib-metric/dimension-breakout definition dimension)]
            (cond-> card
              breakout (assoc :dataset_query (-> query
                                                 lib/remove-all-breakouts
                                                 (lib/breakout breakout)))))
          card)))))

(defn- resolve-param-for-card
  [card-id dashcard-id param-id->param {param-id :id, :as request-param}]
  (when-not param-id
    (throw (ex-info (tru "Unable to resolve invalid query parameter: parameter is missing :id")
                    {:type              qp.error-type/invalid-parameter
                     :invalid-parameter request-param})))
  (log/tracef "Resolving parameter %s" (pr-str param-id))
  ;; find information about this dashboard parameter by its parameter `:id`. If no parameter with this ID
  ;; exists, it is an error.
  (let [matching-param (or (get param-id->param param-id)
                           (throw (ex-info (tru "Dashboard does not have a parameter with ID {0}." (pr-str param-id))
                                           {:type        qp.error-type/invalid-parameter
                                            :status-code 400})))]
    (log/tracef "Found matching Dashboard parameter %s" (pr-str param-id))
    ;; now find the mapping for this specific card. If there is no mapping, we can just ignore this parameter.
    (when-let [matching-mapping (or (some (fn [mapping]
                                            (when (and (= (:card_id mapping) card-id)
                                                       (= (get-in mapping [:dashcard :id]) dashcard-id))
                                              mapping))
                                          (:mappings matching-param))
                                    (log/tracef "Parameter has no mapping for Card %d; skipping" card-id))]
      (log/tracef "Found matching mapping for Card %d, Dashcard %d"
                  card-id dashcard-id)
      ;; if `request-param` specifies type, then validate that the type is allowed
      (when (:type request-param)
        (qp.card/check-allowed-parameter-value-type
         param-id
         (or (when (and (= (:type matching-param) :dimension)
                        (not= (:widget-type matching-param) :none))
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
  by [[params/dashboard->resolved-params]]."
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

(mu/defn- resolve-params-for-query :- [:maybe [:sequential :map]]
  "Given a sequence of parameters included in a query-processing request to run the query for a Dashboard/Card, validate
  that those parameters exist and have allowed types, and merge in default values and other info from the parameter
  mappings."
  [dashboard      :- ::dashboards.schema/dashboard
   dashcard       :- ::dashboards.schema/dashboard-card
   card-id        :- ::lib.schema.id/card
   request-params :- [:maybe ::dashboards.schema/parameters]]
  (let [dashboard-id              (:id dashboard)
        dashcard-id               (:id dashcard)
        _                         (log/tracef "Resolving Dashboard %d Card %d query request parameters" dashboard-id card-id)
        request-params            (some-> request-params not-empty (->> (lib/normalize ::dashboards.schema/parameters)))
        resolved-params           (params/dashboard->resolved-params (assoc dashboard :dashcards [dashcard]))
        dashboard-param-id->param (into {}
                                        ;; remove the `:default` values from Dashboard params. We don't ACTUALLY want to
                                        ;; use these values ourselves -- the expectation is that the frontend will pass
                                        ;; them in as an actual `:value` if it wants to use them. If we leave them
                                        ;; around things get confused and it prevents us from actually doing the
                                        ;; expected `1 = 1` substitution for Field filters. See comments in #20503 for
                                        ;; more information.
                                        (map (fn [[param-id param]]
                                               [param-id (dissoc param :default)]))
                                        resolved-params)
        ;; ignore default values in request params as well. (#20516)
        request-param-id->param   (into {} (map (juxt :id #(dissoc % :default))) request-params)
        merged-parameters         (vals (merge (dashboard-param-defaults dashboard-param-id->param card-id)
                                               request-param-id->param))]
    (when-let [user-id api/*current-user-id*]
      ;; only ids the dashboard has: the rest are rejected below, and their ids are unbounded while the
      ;; `user_parameter_value.parameter_id` column is not
      (when-let [known-params (not-empty (filter #(contains? dashboard-param-id->param (:id %)) request-params))]
        (user-parameter-value/store! user-id dashboard-id known-params)))
    (log/tracef "Merged %d dashboard parameter(s) and %d request parameter(s) into %d parameter(s)"
                (count dashboard-param-id->param)
                (count request-param-id->param)
                (count merged-parameters))
    (u/prog1
      (into [] (comp (map (partial resolve-param-for-card card-id dashcard-id dashboard-param-id->param))
                     (filter some?))
            merged-parameters)
      (log/tracef "Resolved %d parameter(s)" (count <>)))))

;;; ------------------------------------------- Visualizer dimension overrides -------------------------------------------
;;; A visualizer dashcard can regroup a question onto the shared x-axis of the visualization without changing the
;;; question. The override names the column that replaces the breakouts of the last stage:
;;; `{:fieldId 2187, :sourceFieldId nil, :temporalUnit "month"}`. The dashcard stores the overrides in
;;; `visualization_settings.visualization.dimensionOverrides`, keyed by data source id (`"card:95"`).

(def DimensionOverride
  "The column that replaces the breakouts of the last stage of a question."
  [:map {:closed true}
   [:fieldId       pos-int?]
   [:sourceFieldId {:optional true} [:maybe pos-int?]]
   [:temporalUnit  {:optional true} [:maybe :string]]])

(def DimensionAxis
  "The shared x-axis of a visualizer chart: a dimension category, like `\"time\"` or `\"name:channel\"`, and the
  temporal unit for time. The field is the column of the main question, that other questions prefer when they have it."
  [:map {:closed true}
   [:key           :string]
   [:temporalUnit  {:optional true} [:maybe :string]]
   [:fieldId       {:optional true} [:maybe pos-int?]]
   [:sourceFieldId {:optional true} [:maybe pos-int?]]
   [:displayName   {:optional true} [:maybe :string]]])

(def PreferredDimension
  "The column that a question already uses for the x-axis. It stays when it is still in the category of the axis."
  [:map {:closed true}
   [:cardId   pos-int?]
   [:override DimensionOverride]])

(defn- normalize-dimension-override [override]
  (when (map? override)
    (let [override (update-keys override keyword)]
      (when (pos-int? (:fieldId override))
        override))))

(defn- temporal-column? [column]
  (isa? ((some-fn :effective-type :base-type) column) :type/Temporal))

(defn- regroupable-query
  "The card query as a lib query, when its last stage can take a new breakout: an MBQL stage with an aggregation."
  [card]
  (let [query (lib/query (lib-be/application-database-metadata-provider (:database_id card)) (:dataset_query card))]
    (when (and (lib/mbql-stage? query -1)
               (seq (lib/aggregations query -1)))
      query)))

(defn- find-override-column [query {:keys [fieldId sourceFieldId]}]
  (let [columns (lib/breakoutable-columns query -1)]
    (or (u/seek #(and (= fieldId (:id %)) (= sourceFieldId (:fk-field-id %))) columns)
        (u/seek #(= fieldId (:id %)) columns))))

(defn card-with-dimension-override
  "Replace the breakouts of the last stage of `card` with the column that `override` names. Returns `card` unchanged
  when there is no override, the card is native, or the last stage has no aggregation or no such column."
  [card override]
  (let [override (normalize-dimension-override override)
        query    (when override (regroupable-query card))
        column   (when query (find-override-column query override))]
    (if-not column
      card
      (let [unit   (some-> (:temporalUnit override) keyword)
            column (cond-> column
                     (and unit (temporal-column? column)) (lib/with-temporal-bucket unit))]
        (assoc card :dataset_query (-> query
                                       lib/remove-all-breakouts
                                       (lib/breakout column)))))))

(defn dashcard-dimension-override
  "The dimension override that `dashcard` stores for the card with `card-id`, if any."
  [dashcard card-id]
  (let [overrides (get-in dashcard [:visualization_settings :visualization :dimensionOverrides])
        k         (str "card:" card-id)]
    (or (get overrides k) (get overrides (keyword k)))))

(defn- dimension-kind
  "The kind of a dimension column, as the metrics explorer groups them."
  [column]
  (let [semantic (:semantic-type column)
        type     ((some-fn :effective-type :base-type) column)]
    (cond
      (isa? type :type/HasDate)                   :time
      (temporal-column? column)                   nil
      (isa? semantic :type/Country)               :geo
      (isa? semantic :type/State)                 :geo
      (isa? semantic :type/City)                  :geo
      (or (isa? semantic :type/PK)
          (isa? semantic :type/FK))               nil
      (isa? type :type/Boolean)                   :boolean
      (isa? type :type/Number)                    :numeric
      (isa? type :type/Text)                      :category
      :else                                       nil)))

(defn- dimension-category
  "The category of a dimension column. Questions can share an x-axis when each has a column of the same category:
  any time column for time, a column of the same geo type for geo, and a column with the same name otherwise."
  [column display-name]
  (when-let [kind (dimension-kind column)]
    (let [semantic (:semantic-type column)]
      (case kind
        :time {:key "time" :name (tru "Time")}
        :geo  (cond
                (isa? semantic :type/Country) {:key "geo:country" :name (tru "Country")}
                (isa? semantic :type/State)   {:key "geo:state" :name (tru "State")}
                :else                         {:key "geo:city" :name (tru "City")})
        {:key  (str "name:" (u/lower-case-en display-name))
         :name display-name}))))

(defn- column->option [query column]
  (let [info     (lib/display-info query -1 column)
        name     (:display-name info)
        category (dimension-category column name)]
    {:fieldId       (:id column)
     :sourceFieldId (:fk-field-id column)
     :name          name
     :displayName   (or (:long-display-name info) name)
     :temporal      (temporal-column? column)
     :kind          (some-> (dimension-kind column) clojure.core/name)
     :categoryKey   (:key category)
     :categoryName  (:name category)}))

(defn- current-breakout [query]
  (when-let [breakout (first (lib/breakouts query -1))]
    (let [column (lib/breakout-column query -1 breakout)]
      (when (:id column)
        (assoc (column->option query column)
               :temporalUnit (some-> (lib/temporal-bucket breakout) :unit name))))))

(defn- same-column? [a b]
  (and (= (:fieldId a) (:fieldId b))
       (= (:sourceFieldId a) (:sourceFieldId b))))

(defn- match-axis
  "How a card can follow the x-axis `axis`: `:match` when its own breakout already is the axis, `:regroup` with the
  override to apply, or `:incompatible` with a reason. Among the columns of the axis category, the card uses the
  `preferred` column, its own breakout, the column of the main question, a column of its own table, in this order."
  [query current axis preferred]
  (let [options  (into []
                       (comp (filter :id)
                             (map #(column->option query %))
                             (filter #(= (:key axis) (:categoryKey %))))
                       (lib/breakoutable-columns query -1))
        own      (lib/breakoutable-columns query -1)
        own-ids  (into #{} (comp (filter #(= :source/table-defaults (:lib/source %))) (map :id)) own)
        option   (or (when preferred (u/seek #(same-column? preferred %) options))
                     (when current (u/seek #(same-column? current %) options))
                     (u/seek #(same-column? axis %) options)
                     (u/seek #(= (:fieldId axis) (:fieldId %)) options)
                     (u/seek #(and (nil? (:sourceFieldId %)) (own-ids (:fieldId %))) options)
                     (first options))]
    (if-not option
      {:status :incompatible
       :reason (tru "Has no {0} column" (or (:displayName axis) (:key axis)))}
      (let [override (cond-> (select-keys option [:fieldId :sourceFieldId])
                       (:temporal option) (assoc :temporalUnit (:temporalUnit axis)))]
        (if (and current
                 (same-column? current override)
                 (= (:temporalUnit current) (:temporalUnit override))
                 (= 1 (count (lib/breakouts query -1))))
          {:status :match}
          {:status   :regroup
           :override override
           :column   option})))))

(defn card-dimension-options
  "Describe how `card` can be regrouped: its current breakout, and, with `axis`, how it can follow that x-axis.
  With `include-columns?`, also every column the last stage can be grouped by, with its dimension category."
  [card axis preferred include-columns?]
  (let [query (try (regroupable-query card) (catch Throwable _ nil))]
    (if-not query
      {:supported false
       :reason    (if (= :native (keyword (:query_type card)))
                    (tru "SQL questions can''t be regrouped")
                    (tru "Can''t be regrouped"))}
      (let [current (current-breakout query)]
        (cond-> {:supported true
                 :current   current}
          axis             (assoc :axis (match-axis query current axis preferred))
          include-columns? (assoc :columns (into []
                                                 (comp (filter :id)
                                                       (map #(column->option query %))
                                                       (filter :categoryKey))
                                                 (lib/breakoutable-columns query -1))))))))

(defn process-query-for-dashcard
  "Like [[metabase.query-processor.card/process-query-for-card]], but runs the query for a `DashboardCard` with
  `parameters` and `constraints`. By default, returns a `metabase.server.streaming_response.StreamingResponse` (see
  [[metabase.server.streaming-response]]), but this may vary if you pass in a different `:make-run` function. Will throw an
  Exception if preconditions such as proper permissions are not met *before* returning the `StreamingResponse`.

  See [[metabase.query-processor.card/process-query-for-card]] for more information about the various parameters."
  {:arglists '([& {:keys [dashboard dashcard card export-format parameters ignore-cache constraints parameters middleware]}])}
  [& {:keys [dashboard card dashcard parameters export-format dimension-override]
      :or   {export-format :api}
      :as   options}]
  (let [dashboard-id (:id dashboard)
        card-id      (:id card)
        dashcard-id  (:id dashcard)]
    (span/with-span! {:name       "run-query-for-dashcard-async"
                      :attributes {:dashboard/id dashboard-id
                                   :dashcard/id  dashcard-id
                                   :card/id      card-id}}
      (events/publish-event! :event/dashboard-queried {:object-id dashboard-id :user-id api/*current-user-id*})
      ;; make sure we can read this Dashboard. Card will get read-checked later on inside
      ;; [[qp.card/process-query-for-card]]
      (api/read-check dashboard)
      (check-card-and-dashcard-are-in-dashboard dashboard-id card-id dashcard)
      ;; Early view-data permission check so that blocked users get a 403 *before* parameter
      ;; resolution. Without this, a missing required parameter would produce a 400, and the
      ;; frontend couldn't distinguish "no permission" (hide inline filters) from "missing
      ;; params" (show inline filters). The QP middleware's check-block-permissions does a
      ;; thorough check later on the resolved query; this is intentionally just the card's
      ;; database_id since we don't have the resolved query yet.
      (api/check-403
       (not= :blocked
             (perms/most-permissive-database-permission-for-user
              api/*current-user-id* :perms/view-data
              (:database_id card))))
      (let [resolved-params (resolve-params-for-query dashboard dashcard card-id
                                                      (some->> parameters not-empty (lib/normalize ::dashboards.schema/parameters)))
            options         (merge
                             {:ignore-cache false
                              :constraints  (qp.constraints/default-query-constraints)
                              :context      :dashboard}
                             (dissoc options :dashboard :card :export-format :dimension-override)
                             {:parameters   resolved-params
                              :dashboard-id dashboard-id})]
        (log/tracef "Running Query for Dashboard %d, Card %d, Dashcard %d"
                    dashboard-id card-id dashcard-id)
        ;; we've already validated our parameters, so we don't need the [[qp.card]] namespace to do it again
        (binding [qp.card/*allow-arbitrary-mbql-parameters* true]
          (m/mapply qp.card/process-query-for-card card export-format
                    ;; An override in the request is the unsaved state of the dashboard editor. It wins over the
                    ;; override that the saved dashcard stores.
                    (let [override (or dimension-override (dashcard-dimension-override dashcard card-id))]
                      (assoc options :card-transform (fn [card]
                                                       (-> card
                                                           card-with-default-metric-dimension
                                                           (card-with-dimension-override override)))))))))))
