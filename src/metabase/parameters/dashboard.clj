(ns metabase.parameters.dashboard
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- field-ref->endpoint
  "Extract `{:table :field :join-alias}` from an MBQL `:field` clause."
  [mp field-ref]
  (let [field-id (lib/field-ref-id field-ref)]
    {:table      (:table-id (lib.metadata/field mp field-id))
     :field      field-id
     :join-alias (:join-alias (lib/options field-ref))}))

(defn- =-field-refs
  "If `condition` is an `:=` join condition between two `:field` refs, return `[a b]`; otherwise nil."
  [condition]
  (when (and (lib/clause-of-type? condition :=)
             (lib/standard-join-condition? condition))
    (let [a (lib/standard-join-condition-lhs condition)
          b (lib/standard-join-condition-rhs condition)]
      (when (and (lib/clause-of-type? a :field) (lib/clause-of-type? b :field))
        [a b]))))

(defn- condition->link
  "If `condition` is `[:= _opts <field> <field>]` where exactly one field carries `:join-alias = out-alias`, return
  `[in out]`. `out` is the hop we're walking *out of* (this join's side); `in` is the side
  we're walking *into* next — its `:join-alias` names the previous hop, or nil when we've reached the base table.
  Return nil when the clause isn't a qualifying link."
  [mp out-alias condition]
  (when-let [[a b] (=-field-refs condition)]
    (let [ea (field-ref->endpoint mp a)
          eb (field-ref->endpoint mp b)]
      (cond
        (and (= out-alias (:join-alias ea)) (not= out-alias (:join-alias eb))) [eb ea]
        (and (= out-alias (:join-alias eb)) (not= out-alias (:join-alias ea))) [ea eb]))))

(defn- source-field->via-path
  "If `target` carries `:source-field` (an implicit-join FK field-id), emit the one-hop FK edge the field ref names.
  `:lhs` is the FK field on the source table; `:rhs` is the FK's own target field (typically a PK).
  Return nil when the FK target can't be resolved."
  [query target]
  (when-let [fk-id (:source-field (lib/parameter-target-field-options target))]
    (let [fk-field (lib.metadata/field query fk-id)
          fk-table (:table-id fk-field)
          pk-id    (:fk-target-field-id fk-field)
          pk-table (some->> pk-id (lib.metadata/field query) :table-id)]
      (when (and fk-table pk-id pk-table)
        [{:lhs {:table fk-table :field fk-id}
          :rhs {:table pk-table :field pk-id}}]))))

(defn- join-alias->via-path
  "Walk `query`'s joins backward from `target`'s `:join-alias`, emitting the ordered edge list (base table outward).
  See [[target->via-path]] for the full contract."
  [query target]
  (when-let [target-alias (:join-alias (lib/parameter-target-field-options target))]
    (let [stage-number (lib/parameter-target-stage-number target)]
      (loop [alias target-alias, path ()]
        (when-let [join (lib/maybe-resolve-join query stage-number alias)]
          (when-let [[in out] (some #(condition->link query alias %) (lib/join-conditions join))]
            (let [edge  {:lhs (select-keys in  [:table :field])
                         :rhs (select-keys out [:table :field])}
                  path' (cons edge path)]
              (if-let [next-alias (:join-alias in)]
                (recur next-alias path')
                (vec path')))))))))

(defn- target->via-path
  "Resolve `target` to an ordered sequence of FK edges (base table outward) in the shape
  `metabase.parameters.chain-filter/find-joins` uses. Handles two cases:

  - Explicit joins (`:join-alias`): walk the card's join chain back to the base table.
  - Implicit joins (`:source-field`): emit the one-hop edge the field ref itself names.

  Return nil when the target carries neither hint, or when a hint can't be resolved against `query`."
  [query target]
  (or (join-alias->via-path query target)
      (source-field->via-path query target)))

(def ^:const result-limit
  "How many results to return when chain filtering"
  1000)

(defn- card->query
  "Build a lib query for the card's `:dataset_query`, or nil when the card can't yield one."
  [card]
  (when (and card (seq (:dataset_query card)) (pos-int? (:database_id card)))
    (lib/query (lib-be/application-database-metadata-provider (:database_id card))
               (:dataset_query card))))

(defn- condition->fk-pair
  "If `condition` is `[:= _opts <field> <field>]` with two distinct integer field-ids, return `#{a b}`; otherwise nil."
  [condition]
  (when-let [[a b] (=-field-refs condition)]
    (let [fa (lib/field-ref-id a)
          fb (lib/field-ref-id b)]
      (when (and (int? fa) (int? fb) (not= fa fb))
        #{fa fb}))))

(defn- query->fk-pairs
  "Every FK edge the expanded `query` uses, as a set of unordered `#{lhs-id rhs-id}` pairs. Recurses through
  nested cards (`:source-card` on a stage) so joins declared in an inner card are visible even when they don't
  surface on the outer stage."
  [query]
  (let [here   (into #{}
                     (comp (mapcat #(lib/joins query %))
                           (mapcat lib/join-conditions)
                           (keep condition->fk-pair))
                     (range (lib/stage-count query)))
        nested (into #{}
                     (mapcat (fn [card-id]
                               (when-let [c (lib.metadata/card query card-id)]
                                 (when-let [dq (:dataset-query c)]
                                   (query->fk-pairs (lib/query query dq))))))
                     (lib/all-source-card-ids-recursive query))]
    (set/union here nested)))

(mu/defn- param->fields
  [param :- ::parameters.schema/resolved-parameter
   & {:keys [op-override]} :- [:maybe [:map {:closed true} [:op-override {:optional true} [:maybe :keyword]]]]]
  (let [op      (or op-override (params/param-type->op (:type param)))
        options (or (:options param) (params/param-type->default-options (:type param)))]
    (for [mapping (:mappings param)
          ;; Resolve the field-id one mapping at a time so each entry keeps its own `:via-path`.
          :let [field-id (first (params/dashboard-param->field-ids (assoc param :mappings #{mapping})))]
          :when field-id
          :let [target   (:target mapping)
                card     (:card (:dashcard mapping))
                opts     (lib/parameter-target-field-options target)
                query    (card->query card)
                via-path (when (and query (or (:join-alias opts) (:source-field opts)))
                           (target->via-path query target))
                ;; With no via-path to pin, fall back to the FK pairs the expanded card actually joins through —
                ;; the deduper will prefer any parallel edge whose endpoints match a pair.
                fk-pairs (when (and query (empty? via-path))
                           (not-empty (query->fk-pairs query)))]]
      {:field-id field-id
       :op       op
       :options  options
       :via-path via-path
       :fk-pairs fk-pairs})))

(defn- entry->constraint
  "Project a `param->fields` entry down to the `::chain-filter/constraint` shape."
  [entry value]
  (-> entry (dissoc :fk-pairs) (assoc :value value)))

(mu/defn ^:private chain-filter-constraints :- ::chain-filter/constraints
  [dashboard                   :- :metabase.dashboards.schema/dashboard
   constraint-param-key->value :- [:map-of :string [:or ms/FieldValue [:sequential ms/FieldValue]]]]
  (vec (for [[param-key value] constraint-param-key->value
             :let              [param (get-in dashboard [:resolved-params param-key])]
             :when             param
             entry             (param->fields param)]
         (entry->constraint entry value))))

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
  ([dashboard                   :- :metabase.dashboards.schema/dashboard
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- [:map-of :string [:or ms/FieldValue [:sequential ms/FieldValue]]]]
   (chain-filter dashboard param-key constraint-param-key->value nil))

  ([dashboard                   :- :metabase.dashboards.schema/dashboard
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- [:map-of :string [:or ms/FieldValue [:sequential ms/FieldValue]]]
    query                       :- [:maybe ms/NonBlankString]]
   (let [dashboard   (cond-> dashboard
                       (nil? (:resolved-params dashboard)) (t2/hydrate :resolved-params))
         constraints (chain-filter-constraints dashboard constraint-param-key->value)
         param       (get-in dashboard [:resolved-params param-key])
         entries     (vec (param->fields param))]
     (if (empty? entries)
       (or (filter-values-from-field-refs dashboard param-key)
           (throw (ex-info (tru "Parameter {0} does not have any Fields associated with it" (pr-str param-key))
                           {:param       (get (:resolved-params dashboard) param-key)
                            :param-key   param-key
                            :status-code 400})))
       (try
         (let [;; results can come back as [[value] ...] *or* as [[value remapped] ...].
               ;; One chain-filter call per mapping, each threading its own :via-path so a parameter mapped to the
               ;; same base field via multiple joins unions each mapping's dropdown values.
               call            (fn [{:keys [field-id via-path fk-pairs]}]
                                 (let [opts (cond-> [:limit result-limit]
                                              (seq via-path) (into [:via-path via-path])
                                              (seq fk-pairs) (into [:fk-pairs fk-pairs]))]
                                   (if (seq query)
                                     (apply chain-filter/chain-filter-search field-id constraints query opts)
                                     (apply chain-filter/chain-filter field-id constraints opts))))
               results         (map call entries)
               has_more_values (boolean (some true? (map :has_more_values results)))]
           {:values          (or (combine-chained-filter-results results)
                                 ;; chain filter results can't be nil
                                 [])
            :has_more_values has_more_values})
         (catch clojure.lang.ExceptionInfo e
           (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
             (api/throw-403 e)
             (throw e))))))))

(mr/def ::range
  "The span of a parameter's column: its extremes, and how many distinct values lie between them.
  `:distinct-count` is nil when the parameter maps to several fields, whose distinct values overlap
  in ways only a union could count — the extremes still merge exactly."
  [:map
   [:min            [:maybe :any]]
   [:max            [:maybe :any]]
   [:distinct-count [:maybe :int]]])

(mu/defn param-range :- [:maybe ::range]
  "The span of `param-key`'s column under the other filters' current selections, for a parameter whose
  values are a range to filter inside rather than a set to pick from. Answers nil when the parameter
  maps to no queryable field — a field-ref-only mapping has no column to aggregate, so the caller must
  fall back to listing values.

  Aggregates instead of listing, which is the whole reason to prefer it over [[chain-filter]] here:
  listing stops at `result-limit` and, since values come back ascending, its last value is the
  1000th-earliest rather than the column's max. Extremes merge across a multi-field parameter exactly
  (the min of mins bounds every field, as does the max of maxes); the distinct count cannot, and is
  dropped rather than guessed at."
  [dashboard                   :- :metabase.dashboards.schema/dashboard
   param-key                   :- ms/NonBlankString
   constraint-param-key->value :- [:map-of :string [:or ms/FieldValue [:sequential ms/FieldValue]]]]
  (let [dashboard   (cond-> dashboard
                      (nil? (:resolved-params dashboard)) (t2/hydrate :resolved-params))
        constraints (chain-filter-constraints dashboard constraint-param-key->value)
        param       (get-in dashboard [:resolved-params param-key])
        field-ids   (into #{} (map :field-id (param->fields param)))]
    (when (seq field-ids)
      (try
        (let [ranges  (mapv #(chain-filter/chain-filter-range % constraints) field-ids)
              extreme (fn [k pick]
                        (some-> (seq (keep k ranges)) sort pick))]
          {:min            (extreme :min first)
           :max            (extreme :max last)
           :distinct-count (when (= 1 (count ranges))
                             (:distinct-count (first ranges)))})
        (catch clojure.lang.ExceptionInfo e
          (if (= (:type (u/all-ex-data e)) qp.error-type/missing-required-permissions)
            (api/throw-403 e)
            (throw e)))))))

(mu/defn param-values
  "Fetch values for a parameter.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card
  - nil: chain-filter"
  ([dashboard                   :- :metabase.dashboards.schema/dashboard
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- [:map-of :string [:or ms/FieldValue [:sequential ms/FieldValue]]]]
   (param-values dashboard param-key constraint-param-key->value nil))

  ([dashboard                   :- :metabase.dashboards.schema/dashboard
    param-key                   :- ms/NonBlankString
    constraint-param-key->value :- [:map-of :string [:or ms/FieldValue [:sequential ms/FieldValue]]]
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
   (let [constraint-param-key->value (or constraint-param-key->value {})]
     (when (contains? constraint-param-key->value param-key)
       (throw (ex-info (tru "Getting the remapped value for a constrained parameter is not supported")
                       {:status-code 400
                        :parameter param-key})))
     (let [dashboard (t2/hydrate dashboard :resolved-params)
           param (get-in dashboard [:resolved-params param-key])
           ;; Whatever the param's type, we want an equality constraint for the remapped value
           ;; lookup. Use op-override := instead of mutating the param type to :id (QUE2-326).
           field-ids (into #{} (map :field-id (param->fields param :op-override :=)))
           ;; Default case when we have just a single field-id:
           get-direct-remapping #(chain-filter/chain-filter
                                  (first field-ids)
                                  (into (chain-filter-constraints dashboard
                                                                  constraint-param-key->value)
                                        (for [entry (param->fields param :op-override :=)]
                                          (entry->constraint entry value)))
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
           [value])))))
