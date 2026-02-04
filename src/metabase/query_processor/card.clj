(ns metabase.query-processor.card
  "Code for running a query in the context of a specific Card."
  (:refer-clojure :exclude [mapv select-keys not-empty])
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.cache.core :as cache]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.queries.core :as queries]
   [metabase.queries.schema :as queries.schema]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.middleware.results-metadata :as qp.results-metadata]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.schema :as qp.schema]
   ^{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv select-keys not-empty]]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defenterprise cache-strategy
  "Returns cache strategy for a card. In EE, this checks the hierarchy for the card, dashboard, or
  database (in that order). In OSS returns root configuration, taking card's :cache_invalidated_at
  into consideration."
  metabase-enterprise.cache.strategies
  [card _dashboard-id]
  (cache/card-strategy (cache/root-strategy) card))

(defn- enrich-strategy [strategy query]
  (case (:type strategy)
    :ttl (let [et (queries/average-execution-time-ms (qp.util/query-hash query))]
           (assoc strategy :avg-execution-ms (or et 0)))
    strategy))

(mu/defn- explict-stage-references :- [:set :int]
  [parameters :- [:maybe ::parameters.schema/parameters]]
  (into #{}
        (keep (fn [{:keys [target]}]
                (some-> target lib/parameter-target-dimension-options :stage-number)))
        parameters))

(defn- point-parameters-to-last-stage
  "Points temporal-unit parameters to the last stage.
  This function is normally called for models or metrics, where the first and the last
  stages are the same. By using -1 as stage number we make sure that the expansion of
  models/metrics doesn't cause the filter to be added at the wrong stage."
  [parameters]
  (mapv (fn [{:keys [target], :as parameter}]
          (cond-> parameter
            (:stage-number (lib/parameter-target-dimension-options target))
            (update :target lib/update-parameter-target-dimension-options assoc :stage-number -1)))
        parameters))

(mu/defn- last-stage-number
  [query :- ::lib.schema/query]
  (dec (count (:stages query))))

(mu/defn- add-stage-to-temporal-unit-parameters :- ::lib.schema.parameter/parameters
  "Points temporal-unit parameters to the penultimate stage unless the stage is specified."
  [parameters :- ::lib.schema.parameter/parameters]
  (mapv (fn [{param-type :type, :keys [target], :as parameter}]
          (cond-> parameter
            (and (= param-type :temporal-unit)
                 (lib/parameter-target-is-dimension? target)
                 (nil? (:stage-number (lib/parameter-target-dimension-options target))))
            (update :target lib/update-parameter-target-dimension-options assoc :stage-number -2)))
        parameters))

(mu/defn query-for-card :- [:maybe ::lib.schema/query]
  "Generate a query for a saved Card"
  [{dataset-query :dataset_query
    card-type     :type
    :as           card} :- ::queries.schema/card
   parameters  :- [:maybe ::parameters.schema/parameters]
   constraints :- [:maybe :map]
   middleware  :- [:maybe :map]
   & [ids]]
  (when (seq dataset-query)
    (let [stage-numbers           (explict-stage-references parameters)
          explicit-stage-numbers? (boolean (seq stage-numbers))
          parameters              (cond-> parameters
                                    ;; models are not transparent (questions and metrics are)
                                    (and explicit-stage-numbers? (= card-type :model))
                                    point-parameters-to-last-stage)
          ;; The FE might have "added" a stage so that a question with breakouts
          ;; at the last stage can be filtered on the summary results. We know
          ;; this happened if we get a reference to one above the last stage.
          filter-stage-added?     (and explicit-stage-numbers?
                                       (= (inc (last-stage-number dataset-query))
                                          (apply max stage-numbers)))
          query                   (cond-> dataset-query
                                    (and explicit-stage-numbers?
                                         (or
                                          ;; stage-number 0 means filtering the results of models and metrics
                                          (not= card-type :question)
                                          ;; the FE assumed an extra stage, so we add it
                                          filter-stage-added?))
                                    lib/append-stage)
          query                   (-> query
                                      ;; don't want default constraints overriding anything that's already there
                                      (m/dissoc-in [:middleware :add-default-userland-constraints?])
                                      (m/assoc-some :constraints (not-empty constraints)
                                                    :parameters  (not-empty (cond-> parameters
                                                                              filter-stage-added? add-stage-to-temporal-unit-parameters))
                                                    :middleware  (not-empty middleware)))
          cs                      (-> (cache-strategy card (:dashboard-id ids))
                                      (enrich-strategy query))]
      (-> query
          (assoc :cache-strategy cs)
          (->> (lib/normalize ::lib.schema/query))))))

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

(mu/defn- card-template-tag-parameters
  "Template tag parameters that have been specified for the query for Card with `card-id`, if any, returned as a map in
  the format

    {\"template_tag_parameter_name\" :parameter-type, ...}

  Template tag parameter name is the name of the parameter as it appears in the query, e.g. `{{id}}` has the `:name`
  `\"id\"`.

  Parameter type in this case is something like `:string` or `:number` or `:date/month-year`; parameters passed in as
  parameters to the API request must be allowed for this type (i.e. `:string/=` is allowed for a `:string` parameter,
  but `:number/=` is not)."
  [card-id :- ::lib.schema.id/card]
  (let [query (api/check-404 (t2/select-one-fn :dataset_query :model/Card :id card-id))]
    (into
     {}
     (keep (fn [[param-name {widget-type :widget-type, tag-type :type}]]
             ;; Field Filter parameters have a `:type` of `:dimension` and the widget type that should be used is
             ;; specified by `:widget-type`. Non-Field-filter parameters just have `:type`. So prefer
             ;; `:widget-type` if available but fall back to `:type` if not.
             (cond
               (and (= tag-type :dimension)
                    (not= widget-type :none))
               [param-name widget-type]

               (or (contains? lib.schema.template-tag/raw-value-template-tag-types tag-type)
                   (= tag-type :temporal-unit))
               [param-name tag-type])))
     (lib/all-template-tags-map query))))

(mu/defn check-allowed-parameter-value-type
  "If a parameter (i.e., a template tag or Dashboard parameter) is specified with `widget-type` (e.g.
  `:date/all-options`), make sure a user is allowed to pass in parameters with value type `parameter-value-type` (e.g.
  `:date/range`) for it when running the query, otherwise throw an Exception.

  `parameter-name` is used only for the Exception message and data and can be a name or parameter ID (whichever is
  more appropriate; Dashboard stuff uses ID while Card stuff tends to use `:name` at this point).

  Background: some more-specific parameter types aren't allowed for certain types of parameters.
  See [[metabase.legacy-mbql.schema/parameter-types]] for details."
  [parameter-name       :- :string
   widget-type          :- ::lib.schema.parameter/widget-type
   parameter-value-type :- ::lib.schema.parameter/type]
  (when-not (lib.schema.parameter/parameter-type-and-widget-type-allowed-together? parameter-value-type widget-type)
    (let [allowed-types (lib.schema.parameter/allowed-parameter-types-for-template-tag-widget-type widget-type)]
      ;; if we're running into errors where `parameter-value-type` is `:text`, that might be because it's the
      ;; `:default` value in the schema these days
      (throw (ex-info (tru "Invalid parameter value type {0} for parameter {1} with widget type {2}. Parameter value must be one of: {3}"
                           parameter-value-type
                           (pr-str parameter-name)
                           widget-type
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

(mu/defn- validate-card-parameters
  "Unless [[*allow-arbitrary-mbql-parameters*]] is truthy, check to make all supplied `parameters` actually match up
  with template tags in the query for Card with `card-id`."
  [card-id    :- ::lib.schema.id/card
   parameters :- [:maybe [:ref ::lib.schema.parameter/parameters]]]
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
  [query :- ::qp.schema/any-query
   rff   :- [:maybe ::qp.schema/rff]]
  (qp/process-query (qp/userland-query query) rff))

(defn process-query-for-card-default-run-fn
  "Create the default `:make-run` function for [[process-query-for-card]]."
  [qp export-format]
  (mu/fn [query :- :map
          info :- [:maybe ::lib.schema.info/info]]
    (qp.streaming/streaming-response [rff export-format (qp.streaming/safe-filename-prefix (:card-name info))]
      (qp (update query :info merge info) rff))))

(mu/defn combined-parameters-and-template-tags :- [:maybe ::parameters.schema/parameters]
  "Enrich `card.parameters` to include parameters from template-tags.

  On native queries parameters exists in 2 forms:
  - parameters
  - dataset_query.native.template-tags

  In most cases, these 2 are sync, meaning, if you have a template-tag, there will be a parameter.
  However, since card.parameters is a recently added feature, there may be instances where a template-tag
  is not present in the parameters.
  This function ensures that all template-tags are converted to parameters and added to card.parameters."
  [{:keys [parameters] :as card} :- ::queries.schema/card]
  (let [template-tag-parameters     (queries/card-template-tag-parameters card)
        id->template-tags-parameter (m/index-by :id template-tag-parameters)
        id->parameter               (m/index-by :id parameters)]
    (vals (reduce-kv (fn [acc id parameter]
                       ;; order importance: we want the info from `template-tag` to be merged last
                       (update acc id #(merge % parameter)))
                     id->parameter
                     id->template-tags-parameter))))

(mu/defn- enrich-parameters-from-card :- ::parameters.schema/parameters
  "Allow the FE to omit type and target for parameters by adding them from the card."
  [parameters      :- [:maybe ::parameters.schema/parameters-with-optional-types]
   card-parameters :- [:maybe ::parameters.schema/parameters]]
  (let [id->card-param (->> card-parameters
                            (map #(select-keys % [:id :type :target]))
                            (m/index-by :id))]
    (mapv #(merge (-> % :id id->card-param) %) parameters)))

(defn- card-read-context
  "The context to use for tracking the view. Return nil if the view should not be tracked"
  [{:keys [context]}]
  (case context
    :public-dashboard       :dashboard
    :public-question        :question
    :embedded-dashboard     :dashboard
    :embedded-question      :question
    :csv-download           nil
    :public-csv-download    nil
    :embedded-csv-download  nil
    :json-download          nil
    :public-json-download   nil
    :embedded-json-download nil
    :xlsx-download          nil
    :public-xlsx-download   nil
    :embedded-xlsx-download nil
    :dashboard-subscription nil
    :pulse                  nil
    :map-tiles              nil
    context))

(mu/defn process-query-for-card
  "Run the query for Card with `parameters` and `constraints`. By default, returns results in a
  `metabase.server.streaming_response.StreamingResponse` (see [[metabase.server.streaming-response]]) that should be
  returned as the result of an API endpoint fn, but you can return something different by passing a different `:make-run`
  option. `:make-run` has a signature.

    (make-run qp export-format) => (fn run [query info])

  The produced `run` fn has a signature, it should use the qp in to produce the results.

    (run query info) => results

  Will throw an Exception if preconditions (such as read perms) are not met *before* returning the
  `StreamingResponse`.

  `context` is a keyword describing the situation in which this query is being ran, e.g. `:question` (from a Saved
  Question) or `:dashboard` (from a Saved Question in a Dashboard). See [[metabase.legacy-mbql.schema/Context]] for
  all valid options."
  [card-id :- ::lib.schema.id/card
   export-format
   & {:keys [parameters constraints context dashboard-id dashcard-id middleware qp make-run ignore-cache]
      :or   {constraints (qp.constraints/default-query-constraints)
             context     :question
             ;; param `make-run` can be used to control how the query is ran, e.g. if you need to customize the `context`
             ;; passed to the QP
             make-run    process-query-for-card-default-run-fn}}]
  {:pre [(pos-int? card-id) (u/maybe? sequential? parameters)]}
  (let [card       (api/read-check (t2/select-one [:model/Card :id :name :dataset_query :database_id :collection_id
                                                   :type :result_metadata :visualization_settings :display
                                                   :cache_invalidated_at :entity_id :created_at :card_schema
                                                   :parameters :table_id]
                                                  :id card-id))
        parameters (some-> parameters parameters.schema/normalize-parameters-without-adding-default-types)
        parameters (enrich-parameters-from-card parameters (combined-parameters-and-template-tags card))
        dash-viz   (when (and (not= context :question)
                              dashcard-id)
                     (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id))
        card-viz   (:visualization_settings card)
        merged-viz (m/deep-merge card-viz dash-viz)
        ;; We need to check this here because dashcards don't get selected until this point
        qp         (if (= :pivot (:display card))
                     qp.pivot/run-pivot-query
                     (or qp process-query-for-card-default-qp))
        runner     (make-run qp export-format)
        query      (-> (query-for-card card parameters constraints middleware {:dashboard-id dashboard-id})
                       (assoc :viz-settings merged-viz)
                       (update :middleware (fn [middleware]
                                             (merge
                                              {:js-int-to-string? true, :ignore-cached-results? ignore-cache}
                                              middleware))))
        ;; Check if this is a CSV-upload backed model (model with is_upload table)
        csv-model-card? (and (= (:type card) :model)
                             (:table_id card)
                             (t2/exists? :model/Table :id (:table_id card) :is_upload true))
        info       (cond-> {:executed-by            api/*current-user-id*
                            :context                context
                            :card-id                card-id
                            :card-name              (:name card)
                            :dashboard-id           dashboard-id
                            :visualization-settings merged-viz
                            :csv-model-card?         csv-model-card?}
                     (and (= (:type card) :model) (seq (:result_metadata card)))
                     (assoc :metadata/model-metadata (:result_metadata card)))]
    (when (seq parameters)
      (validate-card-parameters card-id (lib/normalize ::lib.schema.parameter/parameters parameters)))
    (log/tracef "Running query for Card %d:\n%s" card-id
                (u/pprint-to-str query))
    (binding [qp.perms/*card-id* card-id]
      (when-let [context (card-read-context info)]
        (events/publish-event! :event/card-read {:object-id card-id
                                                 :user-id   (:executed-by info)
                                                 :context   context}))
      (qp.store/with-metadata-provider (:database_id card)
        (qp.results-metadata/store-previous-result-metadata! card)
        (runner query info)))))
