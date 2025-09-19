(ns metabase.queries.card
  (:require
   [medley.core :as m]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.parameters.chain-filter :as chain-filter]
   [metabase.parameters.custom-values :as custom-values]
   [metabase.parameters.field :as parameters.field]
   [metabase.parameters.params :as params]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.models.card :as card]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(defn- get-param-or-throw
  [card param-key]
  (u/prog1 (m/find-first #(= (:id %) param-key)
                         (or (seq (:parameters card))
                             ;; some older cards or cards in e2e just use the template tags on native queries
                             (card/template-tag-parameters card)))
    (when-not <>
      (throw (ex-info (tru "Card does not have a parameter with the ID {0}" (pr-str param-key))
                      {:status-code 400})))))

(mu/defn- param->field-id :- [:maybe ::lib.schema.id/field]
  [card  :- ::parameters.schema/card
   param :- ::parameters.schema/parameter]
  (params/param-target->field-id (:target param) (:dataset_query card)))

(mu/defn- mapping->field-values :- [:maybe ::parameters.schema/field-values-result]
  "Get param values for the \"old style\" parameters. This mimic's the api/dashboard version except we don't have
  chain-filter issues or dashcards to worry about."
  [card  :- ::parameters.schema/card
   param :- ::parameters.schema/parameter
   query :- [:maybe ::lib.schema.common/non-blank-string]]
  (when-let [field-id (param->field-id card param)]
    (parameters.field/search-values-from-field-id field-id query)))

(mu/defn card-param-values :- ::parameters.schema/field-values-result
  "Fetch values for a parameter that contain `query`. If `query` is nil or not provided, return all values.

  The source of values could be:
  - static-list: user defined values list
  - card: values is result of running a card"
  ([card param-key]
   (card-param-values card param-key nil))

  ([card         :- ::parameters.schema/card
    param-key    :- ms/NonBlankString
    query-string :- [:maybe ms/NonBlankString]]
   (let [param (get-param-or-throw card param-key)]
     (custom-values/parameter->values
      param query-string
      (fn default-case-thunk []
        (or
         (mapping->field-values card param query-string)
         (do (log/error "mapping->field-values unexpectedly returned nil (maybe this shouldn't have been called?)"
                        (pr-str {:card card, :param param, :query-string query-string}))
             nil)))))))

(mu/defn card-param-remapped-value
  "Fetch the remapped value for the given `value` of parameter with ID `:param-key` of `card`."
  [card      :- ::parameters.schema/card
   param-key :- ms/NonBlankString
   value]
  (or (let [param (get-param-or-throw card param-key)]
        (custom-values/parameter-remapped-value
         param
         value
         (fn default-case-thunk []
           (when-let [field-id (param->field-id card param)]
             (-> (chain-filter/chain-filter field-id [{:field-id field-id, :op :=, :value value}] :limit 1)
                 :values
                 first)))))
      [value]))
