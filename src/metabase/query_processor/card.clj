(ns metabase.query-processor.card
  "Code for running a query in the context of a specific Card."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.models.cache-config :as cache-config]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.query :as query]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise cache-strategy
  "Returns cache strategy for a card. In EE, this checks the hierarchy for the card, dashboard, or
   database (in that order). In OSS returns root configuration."
  metabase-enterprise.cache.strategies
  [_card _dashboard-id]
  (cache-config/card-strategy (cache-config/root-strategy) nil))

(defn- enrich-strategy [strategy query]
  (case (:type strategy)
    :ttl (let [et (query/average-execution-time-ms (qp.util/query-hash query))]
           (assoc strategy :avg-execution-ms (or et 0)))
    strategy))

(defn query-for-card
  "Generate a query for a saved Card"
  [{query :dataset_query
    :as   card} parameters constraints middleware & [ids]]
  (let [query     (-> query
                      ;; don't want default constraints overridding anything that's already there
                      (m/dissoc-in [:middleware :add-default-userland-constraints?])
                      (assoc :constraints constraints
                             :parameters  parameters
                             :middleware  middleware))
        cs        (-> (cache-strategy card (:dashboard-id ids))
                      (enrich-strategy query))]
    (assoc query :cache-strategy cs)))

(def ^:dynamic *allow-arbitrary-mbql-parameters*
  "In 0.41.0+ you can no longer add arbitrary `:parameters` to a query for a saved question -- only parameters for
  template tags that are part of a /native/ query may be supplied (only native queries can have template tags); the
  type of the parameter has to agree with the type of the template tag as well. This variable controls whether or not
  this constraint is enforced.

  Normally, when running a query in the context of a /Card/, this is `false`, and the constraint is enforced. By
  binding this to a truthy value you can disable the checks. Currently this is only done
  by [[metabase.query-processor.dashboard]], which does its own parameter validation before handing off to the code
  here."
  false)

(defn- card-template-tag-parameters
  "Template tag parameters that have been specified for the query for Card with `card-id`, if any, returned as a map in
  the format

    {\"template_tag_parameter_name\" :parameter-type, ...}

  Template tag parameter name is the name of the parameter as it appears in the query, e.g. `{{id}}` has the `:name`
  `\"id\"`.

  Parameter type in this case is something like `:string` or `:number` or `:date/month-year`; parameters passed in as
  parameters to the API request must be allowed for this type (i.e. `:string/=` is allowed for a `:string` parameter,
  but `:number/=` is not)."
  [card-id]
  (let [query (api/check-404 (t2/select-one-fn :dataset_query Card :id card-id))]
    (into
     {}
     (comp
      (map (fn [[param-name {widget-type :widget-type, tag-type :type}]]
             ;; Field Filter parameters have a `:type` of `:dimension` and the widget type that should be used is
             ;; specified by `:widget-type`. Non-Field-filter parameters just have `:type`. So prefer
             ;; `:widget-type` if available but fall back to `:type` if not.
             (cond
               (and (= tag-type :dimension)
                    (not= widget-type :none))
               [param-name widget-type]

               (contains? lib.schema.template-tag/raw-value-template-tag-types tag-type)
               [param-name tag-type])))
      (filter some?))
     (get-in query [:native :template-tags]))))

(defn- allowed-parameter-type-for-template-tag-widget-type? [parameter-type widget-type]
  (when-let [allowed-template-tag-types (get-in lib.schema.parameter/types [parameter-type :allowed-for])]
    (contains? allowed-template-tag-types widget-type)))

(defn- allowed-parameter-types-for-template-tag-widget-type [widget-type]
  (into #{} (for [[parameter-type {:keys [allowed-for]}] lib.schema.parameter/types
                  :when                                  (contains? allowed-for widget-type)]
              parameter-type)))

(mu/defn check-allowed-parameter-value-type
  "If a parameter (i.e., a template tag or Dashboard parameter) is specified with `widget-type` (e.g.
  `:date/all-options`), make sure a user is allowed to pass in parameters with value type `parameter-value-type` (e.g.
  `:date/range`) for it when running the query, otherwise throw an Exception.

  `parameter-name` is used only for the Exception message and data and can be a name or parameter ID (whichever is
  more appropriate; Dashboard stuff uses ID while Card stuff tends to use `:name` at this point).

  Background: some more-specific parameter types aren't allowed for certain types of parameters.
  See [[metabase.legacy-mbql.schema/parameter-types]] for details."
  [parameter-name
   widget-type          :- ::lib.schema.template-tag/widget-type
   parameter-value-type :- ::lib.schema.parameter/type]
  (when-not (allowed-parameter-type-for-template-tag-widget-type? parameter-value-type widget-type)
    (let [allowed-types (allowed-parameter-types-for-template-tag-widget-type widget-type)]
      (throw (ex-info (tru "Invalid parameter type {0} for parameter {1}. Parameter type must be one of: {2}"
                           parameter-value-type
                           (pr-str parameter-name)
                           (str/join ", " (sort allowed-types)))
                      {:type              qp.error-type/invalid-parameter
                       :invalid-parameter parameter-name
                       :template-tag-type widget-type
                       :allowed-types     allowed-types})))))

(defn- infer-parameter-name
  "Attempt to infer the name of a parameter. Uses `:name` if explicitly specified, otherwise attempts to infer this by
  parsing `:target`. Parameters are matched up by name for validation purposes."
  [{parameter-name :name, :keys [target]}]
  (or
   parameter-name
   (lib.util.match/match-one target
     [:template-tag tag-name]
     (name tag-name))))

(mu/defn ^:private validate-card-parameters
  "Unless [[*allow-arbitrary-mbql-parameters*]] is truthy, check to make all supplied `parameters` actually match up
  with template tags in the query for Card with `card-id`."
  [card-id    :- ::lib.schema.id/card
   parameters :- mbql.s/ParameterList]
  (when-not *allow-arbitrary-mbql-parameters*
    (let [template-tags (card-template-tag-parameters card-id)]
      (doseq [request-parameter parameters
              :let              [parameter-name (infer-parameter-name request-parameter)]]
        (let [matching-widget-type (or (get template-tags parameter-name)
                                       (throw (ex-info (tru "Invalid parameter: Card {0} does not have a template tag named {1}."
                                                            card-id
                                                            (pr-str parameter-name))
                                                       {:type               qp.error-type/invalid-parameter
                                                        :invalid-parameter  request-parameter
                                                        :allowed-parameters (keys template-tags)})))]
          ;; now make sure the type agrees as well
          (check-allowed-parameter-value-type parameter-name matching-widget-type (:type request-parameter)))))))

(mu/defn process-query-for-card-default-qp :- :some
  "Default value of the `:qp` option for [[process-query-for-card]]."
  [query :- ::qp.schema/query
   rff   :- [:maybe ::qp.schema/rff]]
  (qp/process-query (qp/userland-query query) rff))

(defn process-query-for-card-default-run-fn
  "Create the default `:make-run` function for [[process-query-for-card]]."
  [qp export-format]
  (^:once fn* [query info]
   (qp.streaming/streaming-response [rff export-format (u/slugify (:card-name info))]
     (qp (update query :info merge info) rff))))

(mu/defn process-query-for-card
  "Run the query for Card with `parameters` and `constraints`. By default, returns results in a
  `metabase.async.streaming_response.StreamingResponse` (see [[metabase.async.streaming-response]]) that should be
  returned as the result of an API endpoint fn, but you can return something different by passing a different `:make-run`
  option. `:make-run` has a signature.

    (make-run qp export-format) => (fn run [query info])

  The produced `run` fn has a signature, it should use the qp in to produce the results.

    (run query info) => results

  Will throw an Exception if preconditions (such as read perms) are not met *before* returning the
  `StreamingResponse`.

  `context` is a keyword describing the situation in which this query is being ran, e.g. `:question` (from a Saved
  Question) or `:dashboard` (from a Saved Question in a Dashboard). See [[metabase.legacy-mbql.schema/Context]] for all valid
  options."
  [card-id :- ::lib.schema.id/card
   export-format
   & {:keys [parameters constraints context dashboard-id dashcard-id middleware qp make-run ignore-cache]
      :or   {constraints (qp.constraints/default-query-constraints)
             context     :question
             ;; param `make-run` can be used to control how the query is ran, e.g. if you need to customize the `context`
             ;; passed to the QP
             make-run    process-query-for-card-default-run-fn}}]
  {:pre [(int? card-id) (u/maybe? sequential? parameters)]}
  (let [card       (api/read-check (t2/select-one [Card :id :name :dataset_query :database_id :collection_id
                                                   :type :result_metadata :visualization_settings :display
                                                   :cache_invalidated_at]
                                                  :id card-id))
        dash-viz   (when (and (not= context :question)
                              dashcard-id)
                     (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id))
        card-viz   (:visualization_settings card)
        merged-viz (m/deep-merge card-viz dash-viz)
        ;; We need to check this here because dashcards don't get selected until this point
        qp       (if (= :pivot (:display card))
                   qp.pivot/run-pivot-query
                   (or qp process-query-for-card-default-qp))
        runner   (make-run qp export-format)
        query    (-> (query-for-card card parameters constraints middleware {:dashboard-id dashboard-id})
                     (assoc :viz-settings merged-viz)
                     (update :middleware (fn [middleware]
                                           (merge
                                             {:js-int-to-string? true, :ignore-cached-results? ignore-cache}
                                             middleware))))
        info     (cond-> {:executed-by            api/*current-user-id*
                          :context                context
                          :card-id                card-id
                          :card-name              (:name card)
                          :dashboard-id           dashboard-id
                          :visualization-settings merged-viz}
                   (and (= (:type card) :model) (seq (:result_metadata card)))
                   (assoc :metadata/model-metadata (:result_metadata card)))]
    (api/check-not-archived card)
    (when (seq parameters)
      (validate-card-parameters card-id (mbql.normalize/normalize-fragment [:parameters] parameters)))
    (log/tracef "Running query for Card %d:\n%s" card-id
                (u/pprint-to-str query))
    (binding [qp.perms/*card-id* card-id]
      (runner query info))))
