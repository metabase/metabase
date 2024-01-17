(ns metabase.query-processor.card
  "Code for running a query in the context of a specific Card."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.models.card :as card :refer [Card]]
   [metabase.models.dashboard :refer [Dashboard]]
   [metabase.models.database :refer [Database]]
   [metabase.models.query :as query]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features
    :as premium-features
    :refer [defenterprise]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.constraints :as qp.constraints]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.query-processor.util :as qp.util]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   #_{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- query-magic-ttl
  "Compute a 'magic' cache TTL time (in seconds) for `query` by multipling its historic average execution times by the
  `query-caching-ttl-ratio`. If the TTL is less than a second, this returns `nil` (i.e., the cache should not be
  utilized.)"
  [query]
  (when-let [average-duration (query/average-execution-time-ms (qp.util/query-hash query))]
    (let [ttl-seconds (Math/round (float (/ (* average-duration (public-settings/query-caching-ttl-ratio))
                                            1000.0)))]
      (when-not (zero? ttl-seconds)
        (log/info (trs "Question''s average execution duration is {0}; using ''magic'' TTL of {1}"
                       (u/format-milliseconds average-duration) (u/format-seconds ttl-seconds))
                  (u/emoji "💾"))
        ttl-seconds))))

(defenterprise granular-ttl
  "Returns the granular cache ttl (in seconds) for a card. On EE, this first checking whether there is a stored value
   for the card, dashboard, or database (in that order of decreasing preference). Returns nil on OSS."
  metabase-enterprise.advanced-config.caching
  [_card _dashboard _database])

(defn- ttl-hierarchy
  "Returns the cache ttl (in seconds), by first checking whether there is a stored value for the database,
    dashboard, or card (in that order of increasing preference), and if all of those don't exist, then the
    `query-magic-ttl`, which is based on average execution time."
  [card dashboard database query]
  (when (public-settings/enable-query-caching)
    (or (granular-ttl card dashboard database)
        (query-magic-ttl query))))

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
        dashboard (t2/select-one [Dashboard :cache_ttl] :id (:dashboard-id ids))
        database  (t2/select-one [Database :cache_ttl] :id (:database_id card))
        ttl-secs  (ttl-hierarchy card dashboard database query)]
    (assoc query :cache-ttl ttl-secs)))

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

               (contains? mbql.s/raw-value-template-tag-types tag-type)
               [param-name tag-type])))
      (filter some?))
     (get-in query [:native :template-tags]))))

(defn- allowed-parameter-type-for-template-tag-widget-type? [parameter-type widget-type]
  (when-let [allowed-template-tag-types (get-in mbql.s/parameter-types [parameter-type :allowed-for])]
    (contains? allowed-template-tag-types widget-type)))

(defn- allowed-parameter-types-for-template-tag-widget-type [widget-type]
  (into #{} (for [[parameter-type {:keys [allowed-for]}] mbql.s/parameter-types
                  :when                                  (contains? allowed-for widget-type)]
              parameter-type)))

(mu/defn check-allowed-parameter-value-type
  "If a parameter (i.e., a template tag or Dashboard parameter) is specified with `widget-type` (e.g.
  `:date/all-options`), make sure a user is allowed to pass in parameters with value type `parameter-value-type` (e.g.
  `:date/range`) for it when running the query, otherwise throw an Exception.

  `parameter-name` is used only for the Exception message and data and can be a name or parameter ID (whichever is
  more appropriate; Dashboard stuff uses ID while Card stuff tends to use `:name` at this point).

  Background: some more-specific parameter types aren't allowed for certain types of parameters.
  See [[metabase.mbql.schema/parameter-types]] for details."
  [parameter-name
   widget-type          :- ::lib.schema.template-tag/widget-type
   parameter-value-type :- ::mbql.s/ParameterType]
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
   (mbql.u/match-one target
     [:template-tag tag-name]
     (name tag-name))))

(mu/defn ^:private validate-card-parameters
  "Unless [[*allow-arbitrary-mbql-parameters*]] is truthy, check to make all supplied `parameters` actually match up
  with template tags in the query for Card with `card-id`."
  [card-id    :- ms/PositiveInt
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

(defn run-query-for-card-async
  "Run the query for Card with `parameters` and `constraints`, and return results in a
  `metabase.async.streaming_response.StreamingResponse` (see [[metabase.async.streaming-response]]) that should be
  returned as the result of an API endpoint fn. Will throw an Exception if preconditions (such as read perms) are not
  met before returning the `StreamingResponse`.

  `context` is a keyword describing the situation in which this query is being ran, e.g. `:question` (from a Saved
  Question) or `:dashboard` (from a Saved Question in a Dashboard). See [[metabase.mbql.schema/Context]] for all valid
  options."
  [card-id export-format
   & {:keys [parameters constraints context dashboard-id dashcard-id middleware qp-runner run ignore_cache]
      :or   {constraints (qp.constraints/default-query-constraints)
             context     :question
             qp-runner   qp/process-query-and-save-execution!}}]
  {:pre [(int? card-id) (u/maybe? sequential? parameters)]}
  (let [run       (or run
                      ;; param `run` can be used to control how the query is ran, e.g. if you need to
                      ;; customize the `context` passed to the QP
                      (^:once fn* [query info]
                       (qp.streaming/streaming-response [{:keys [rff context]} export-format (u/slugify (:card-name info))]
                         (qp-runner query info rff context))))
        dash-viz  (when (not= context :question)
                    (t2/select-one-fn :visualization_settings :model/DashboardCard :id dashcard-id))
        card      (api/read-check (t2/select-one [Card :id :name :dataset_query :database_id :cache_ttl :collection_id
                                                  :dataset :result_metadata :visualization_settings]
                                                 :id card-id))
        query     (-> (query-for-card card parameters constraints middleware {:dashboard-id dashboard-id})
                      (update :viz-settings (fn [viz] (merge viz dash-viz)))
                      (assoc :async? true)
                      (update :middleware (fn [middleware]
                                            (merge
                                             {:js-int-to-string? true :ignore-cached-results? ignore_cache}
                                             middleware))))
        info      (cond-> {:executed-by            api/*current-user-id*
                           :context                context
                           :card-id                card-id
                           :card-name              (:name card)
                           :dashboard-id           dashboard-id
                           :visualization-settings (:visualization_settings card)}
                    (and (:dataset card) (seq (:result_metadata card)))
                    (assoc :metadata/dataset-metadata (:result_metadata card)))]
    (api/check-not-archived card)
    (when (seq parameters)
      (validate-card-parameters card-id (mbql.normalize/normalize-fragment [:parameters] parameters)))
    (log/tracef "Running query for Card %d:\n%s" card-id
                (u/pprint-to-str query))
    (binding [qp.perms/*card-id* card-id]
      (run query info))))
