(ns metabase.parameters.dashboard
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:const result-limit
  "How many results to return when chain filtering"
  1000)

(defn- param-type->op [type]
  (if (get-in lib.schema.parameter/types [type :operator])
    (keyword (name type))
    :=))

(defn param-type->default-options
  "Default chain-filter constraint options based on parameter type."
  [type]
  (when (#{:string/contains :string/does-not-contain :string/starts-with :string/ends-with} type)
    {:case-sensitive false}))

(mu/defn- param->fields
  [param :- ::parameters.schema/parameter]
  (let [op      (param-type->op (:type param))
        options (or (:options param) (param-type->default-options (:type param)))]
    (for [field-id (params/dashboard-param->field-ids param)]
      {:field-id field-id
       :op       op
       :options  options})))

(mu/defn ^:private chain-filter-constraints :- ::chain-filter/constraints
  [dashboard                   :- :map
   constraint-param-key->value :- [:map-of string? any?]]
  (vec (for [[param-key value] constraint-param-key->value
             :let              [param (get-in dashboard [:resolved-params param-key])]
             :when             param
             field             (param->fields param)]
         (assoc field :value value))))

(defn filter-values-from-field-refs
  "Get filter values when only field-refs (e.g. `[:field \"SOURCE\" {:base-type :type/Text}]`)
  are provided (rather than field-ids). This is a common case for nested queries."
  [dashboard param-key]
  (let [dashboard       (t2/hydrate dashboard :resolved-params)
        param           (get-in dashboard [:resolved-params param-key])
        results         (for [{:keys [target] {:keys [card]} :dashcard} (:mappings param)
                              :let [field-ref ((some-fn lib/parameter-target-field-ref
                                                        lib/parameter-target-expression-ref)
                                               target)]
                              :when field-ref]
                          (custom-values/values-from-card card field-ref))]
    (when-some [values (seq (distinct (mapcat :values results)))]
      (let [has_more_values (boolean (some true? (map :has_more_values results)))]
        {:values          (cond->> values
                            (seq values)
                            (sort-by (case (count (first values))
                                       2 second
                                       1 first)))
         :has_more_values has_more_values}))))

(defn- combine-chained-filter-results
  [results]
  (let [;; merge values with remapped values taking priority
        values (->> (mapcat :values results)
                    (sort-by count)
                    (m/index-by first)
                    vals)]
    (cond->> values
      (seq values)
      ;; sort by remapped values only if all values are remapped
      (sort-by (case (count (first values))
                 2 second
                 1 first)))))

(mu/defn chain-filter :- ms/FieldValuesResult
  "C H A I N filters!

  Used to query for values that populate chained filter dropdowns and text search boxes."
  ([dashboard param-key constraint-param-key->value]
   (chain-filter dashboard param-key constraint-param-key->value nil))

  ([dashboard                   :- ms/Map
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- [:map-of string? any?]
    query                       :- [:maybe ms/NonBlankString]]
   (let [dashboard   (cond-> dashboard
                       (nil? (:resolved-params dashboard)) (t2/hydrate :resolved-params))
         constraints (chain-filter-constraints dashboard constraint-param-key->value)
         param       (get-in dashboard [:resolved-params param-key])
         field-ids   (into #{} (map :field-id (param->fields param)))]
     (if (empty? field-ids)
       (or (filter-values-from-field-refs dashboard param-key)
           (throw (ex-info (tru "Parameter {0} does not have any Fields associated with it" (pr-str param-key))
                           {:param       (get (:resolved-params dashboard) param-key)
                            :param-key   param-key
                            :status-code 400})))
       (try
         (let [;; results can come back as [[value] ...] *or* as [[value remapped] ...].
               results         (map (if (seq query)
                                      #(chain-filter/chain-filter-search % constraints query :limit result-limit)
                                      #(chain-filter/chain-filter % constraints :limit result-limit))
                                    field-ids)
               has_more_values (boolean (some true? (map :has_more_values results)))]
           {:values          (or (combine-chained-filter-results results)
                                 ;; chain filter results can't be nil
                                 [])
            :has_more_values has_more_values})
         (catch clojure.lang.ExceptionInfo e
           (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
             (api/throw-403 e)
             (throw e))))))))

(mu/defn param-values
  "Fetch values for a parameter.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card
  - nil: chain-filter"
  ([dashboard param-key constraint-param-key->value]
   (param-values dashboard param-key constraint-param-key->value nil))

  ([dashboard                   :- :map
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- [:map-of string? any?]
    query                       :- [:maybe ms/NonBlankString]]
   (let [dashboard (t2/hydrate dashboard :resolved-params)
         param     (get (:resolved-params dashboard) param-key)]
     (when-not param
       (throw (ex-info (tru "Dashboard does not have a parameter with the ID {0}" (pr-str param-key))
                       {:resolved-params (keys (:resolved-params dashboard))
                        :status-code     400})))
     (custom-values/parameter->values
      param
      query
      (fn [] (chain-filter dashboard param-key constraint-param-key->value query))))))

(defn- find-common-remapping-target
  "Check if ALL field-ids have identical remappings to the same display field.
   Returns the common target field-id if ALL fields have the same remapping, nil otherwise."
  [field-ids]
  (let [target-field-ids (into #{}
                               (map (comp :id chain-filter/remapping))
                               field-ids)]
    (when (and (not (contains? target-field-ids nil))
               (= 1 (count target-field-ids)))
      (first target-field-ids))))

(defn dashboard-param-remapped-value
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of `dashboard`."
  ([dashboard param-key value]
   (dashboard-param-remapped-value dashboard param-key value nil))
  ([dashboard param-key value constraint-param-key->value]
   (when (contains? constraint-param-key->value param-key)
     (throw (ex-info (tru "Getting the remapped value for a constrained parameter is not supported")
                     {:status-code 400
                      :parameter param-key})))
   (let [dashboard (-> dashboard
                       (t2/hydrate :resolved-params)
                       ;; whatever the param's type, we want an equality constraint
                       (m/update-existing-in [:resolved-params param-key] assoc :type :id))
         param (get-in dashboard [:resolved-params param-key])
         field-ids (into #{} (map :field-id (param->fields param)))
         ;; Default case when we have just a single field-id:
         get-direct-remapping #(chain-filter/chain-filter
                                (first field-ids)
                                (chain-filter-constraints dashboard
                                                          (assoc constraint-param-key->value
                                                                 param-key
                                                                 value))
                                :relax-fk-requirement? true
                                :limit 1)
         ;; Default case when we have multiple field-ids:
         get-common-remapping #(when-let [common-display-field (find-common-remapping-target field-ids)]
                                 (when-let [pk-field-id (custom-values/pk-of-fk-pk-field-ids field-ids)]
                                   (chain-filter/chain-filter pk-field-id
                                                              [{:field-id pk-field-id, :op :=, :value value}]
                                                              :limit 1
                                                              :remapping-field common-display-field)))
         default-case-fn (fn dashboard-param-remapped-default-case []
                           (-> (if (= (count field-ids) 1)
                                 (get-direct-remapping) ; only one field id
                                 (get-common-remapping)) ; more than one
                               :values
                               first))]
     (or (custom-values/parameter-remapped-value param value default-case-fn)
         [value]))))
