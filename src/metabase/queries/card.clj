(ns metabase.queries.card
  (:require
   [medley.core :as m]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.parameters.field :as parameters.field]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.models.card :as card]
   [metabase.queries.schema :as queries.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(mu/defn- get-param-or-throw :- ::parameters.schema/parameter
  [card      :- ::queries.schema/card
   param-key :- ::lib.schema.parameter/id]
  (u/prog1 (m/find-first #(= (:id %) param-key)
                         (or (seq (:parameters card))
                             ;; some older cards or cards in e2e just use the template tags on native queries
                             (card/template-tag-parameters card)))
    (when-not <>
      (throw (ex-info (tru "Card does not have a parameter with the ID {0}" (pr-str param-key))
                      {:status-code 400})))))

(mu/defn- param->field-id :- [:maybe ::lib.schema.id/field]
  [card  :- ::queries.schema/card
   param :- ::parameters.schema/parameter]
  (params/param-target->field-id (:target param) card))

(mu/defn card-param-constraints :- [:maybe ::chain-filter/constraints]
  "Chain-filter constraints for the parameters of `card` named in `slug->value`. Callers pass the parameters whose
  values they have already fixed and the caller may not change, so the values returned for the rest can be limited to
  the rows those values match. Throws if a slug names no parameter of the card: a constraint that silently went
  missing would widen the values returned rather than narrow them.

  Note this only reaches parameters whose values come from a Field -- one drawing values from a static list or from
  another card is returned in full, as it is on a dashboard."
  [card        :- ::queries.schema/card
   slug->value :- [:maybe [:map-of :any :any]]]
  (let [;; the same source [[get-param-or-throw]] uses: a native card may carry no `:parameters` at all and be
        ;; described entirely by its template tags
        slug->param (into {}
                          (map (juxt (comp keyword :slug) identity))
                          (or (seq (:parameters card))
                              (card/template-tag-parameters card)))]
    (vec (for [[slug value] slug->value
               ;; an empty collection means "no value", as it does in `validate-and-merge-params`, and a parameter
               ;; with no value constrains nothing whether or not it still exists
               :let  [value (if (and (not (string? value)) (seqable? value)) (not-empty value) value)]
               :when (some? value)
               :let  [param (or (get slug->param (keyword slug))
                                (throw (ex-info (tru "The parameter {0} does not exist on this card." (name slug))
                                                {:status-code 400})))]
               ;; a parameter targeting a raw `{{variable}}` resolves to no Field and so cannot constrain, the same as
               ;; on a dashboard
               :let  [field-id (param->field-id card param)]
               :when field-id]
           {:field-id field-id
            :op       (params/param-type->op (:type param))
            :options  (or (:options param) (params/param-type->default-options (:type param)))
            :value    value}))))

(mu/defn- mapping->field-values :- ms/FieldValuesResult
  "Get param values for the \"old style\" parameters. This mimic's the api/dashboard version except we don't have
  dashcards to worry about. With `constraints`, values are chain-filtered to the rows those constraints match, the
  same way the dashboard version filters on its other parameter values."
  [card         :- ::queries.schema/card
   param        :- ::parameters.schema/parameter
   query-string :- [:maybe :string]
   constraints  :- [:maybe ::chain-filter/constraints]]
  (when-let [field-id (param->field-id card param)]
    (cond
      (empty? constraints) (parameters.field/search-values-from-field-id field-id query-string)
      (seq query-string)   (chain-filter/chain-filter-search field-id constraints query-string)
      :else                (chain-filter/chain-filter field-id constraints))))

(mu/defn card-param-values
  "Fetch values for a parameter that contain `query`. If `query` is nil or not provided, return all values.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card"
  ([card param-key]
   (card-param-values card param-key nil nil))

  ([card param-key query-string]
   (card-param-values card param-key query-string nil))

  ([card         :- ms/Map
    param-key    :- ::lib.schema.parameter/id
    query-string :- [:maybe ms/NonBlankString]
    constraints  :- [:maybe ::chain-filter/constraints]]
   (let [param (get-param-or-throw card param-key)]
     (custom-values/parameter->values param query-string (mu/fn :- ms/FieldValuesResult []
                                                           (mapping->field-values card param query-string constraints))))))

(mu/defn card-param-remapped-value
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of `card`. `constraints` limits
  the rows the remapping is read from."
  ([card param-key value]
   (card-param-remapped-value card param-key value nil))

  ([card        :- ::queries.schema/card
    param-key   :- ::lib.schema.parameter/id
    value
    constraints :- [:maybe ::chain-filter/constraints]]
   (or (let [param (get-param-or-throw card param-key)]
         (custom-values/parameter-remapped-value
          param
          value
          #(when-let [field-id (param->field-id card param)]
             (-> (chain-filter/chain-filter field-id
                                            (into [{:field-id field-id, :op :=, :value value}] constraints)
                                            :limit 1)
                 :values
                 first))))
       [value])))
