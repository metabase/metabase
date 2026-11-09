(ns metabase.prototype.api
  "`/api/prototype/` endpoints."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.prototype.ai-filters :as ai-filters]
   [metabase.prototype.filter-usage :as filter-usage]
   [metabase.prototype.filter-values :as filter-values]
   [metabase.prototype.runtime-estimate :as runtime-estimate]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :get "/filter-usage"
  :- [:sequential [:map
                   [:field_id     ms/PositiveInt]
                   [:table_id     ms/PositiveInt]
                   [:filter_count ms/PositiveInt]
                   [:query_count  ms/PositiveInt]
                   [:ratio        number?]]]
  "The columns that saved questions filter on, most often first. `ratio` is the number of questions that filter on
  the column, divided by the number of questions that use its table."
  []
  (filter-usage/filter-usage))

(api.macros/defendpoint :post "/filter-values"
  :- [:map
      [:status [:enum "ok" "rejected"]]
      [:values {:optional true} [:sequential :string]]
      [:reason {:optional true} :string]]
  "Prototype: turn a natural language `prompt`, like \"EU countries\", into the values of one filter. The filter
  keeps its column and operator. `options` are the values to pick from, when the client knows them."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:prompt      ms/NonBlankString]
            [:field_id    {:optional true} [:maybe ms/PositiveInt]]
            [:table_name  :string]
            [:column_name :string]
            [:operator    :string]
            [:value_kind  [:enum "single" "range" "multi"]]
            [:values      {:default []} [:sequential :string]]
            [:options     {:optional true} [:maybe [:sequential :string]]]]]
  (filter-values/suggest-filter-values body))

(def ^:private value-kind
  [:enum "none" "single" "range" "multi" "amount-unit" "unit"])

(api.macros/defendpoint :post "/filters"
  :- [:map
      [:status [:enum "ok" "rejected"]]
      [:filters {:optional true} [:sequential [:map
                                               [:column :int]
                                               [:operator :string]
                                               [:values [:sequential :string]]]]]
      [:logic {:optional true} :string]
      [:reason {:optional true} :string]]
  "Prototype: turn a natural language `prompt`, like \"pro customers in the EU\", into one or more filters on the
  `columns` that the client sends. The `id` of a column is the client's key for it."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:prompt  ms/NonBlankString]
            [:today   :string]
            [:columns [:sequential [:map {:closed true}
                                    [:id        :int]
                                    [:table     :string]
                                    [:name      :string]
                                    [:kind      [:enum "string" "number" "boolean" "date"]]
                                    [:field_id  {:optional true} [:maybe ms/PositiveInt]]
                                    [:operators [:sequential [:map {:closed true}
                                                              [:key        :string]
                                                              [:label      :string]
                                                              [:value_kind value-kind]
                                                              [:options    {:optional true}
                                                               [:maybe [:sequential :string]]]]]]]]]]]
  (ai-filters/suggest-filters body))

(api.macros/defendpoint :get "/runtime-estimate"
  :- [:map
      [:basis     [:maybe [:enum "question" "table"]]]
      [:run_count {:optional true} :int]
      [:days      {:optional true} :int]
      [:p50_ms    {:optional true} :int]
      [:p90_ms    {:optional true} :int]]
  "Prototype: how long a query usually runs, from past runs. Uses the runs of the saved question `card-id` when it
  has enough, or else the runs of all queries on the source table `table-id`."
  [_route-params
   query-params :- [:map {:closed true}
                    [:card-id  {:optional true} [:maybe ms/PositiveInt]]
                    [:table-id {:optional true} [:maybe ms/PositiveInt]]]]
  (runtime-estimate/estimate query-params))
