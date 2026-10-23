(ns metabase.prototype.api
  "`/api/prototype/` endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.prototype.ai-filters :as ai-filters]
   [metabase.prototype.field-categories :as field-categories]
   [metabase.prototype.filter-summary :as filter-summary]
   [metabase.prototype.filter-usage :as filter-usage]
   [metabase.prototype.filter-values :as filter-values]
   [metabase.prototype.runtime-estimate :as runtime-estimate]
   [metabase.prototype.samples :as samples]
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

(def ^:private Categories
  [:sequential [:map
                [:name      :string]
                [:field_ids [:sequential ms/PositiveInt]]]])

(api.macros/defendpoint :get "/field-categories"
  :- [:sequential [:map
                   [:table_id   ms/PositiveInt]
                   [:categories Categories]]]
  "The LLM categories of the Fields of each Table that has them."
  []
  (mapv #(select-keys % [:table_id :categories]) (field-categories/all-categories)))

(api.macros/defendpoint :post "/field-categories/:id"
  :- [:map
      [:table_id ms/PositiveInt]
      [:action   :keyword]]
  "Update the LLM categories of the Fields of a Table now. With `force=true`, categorize all the Fields again."
  [{:keys [id]}    :- [:map {:closed true} [:id ms/PositiveInt]]
   {:keys [force]}    :- [:map {:closed true} [:force {:default false} ms/BooleanValue]]]
  (api/check-superuser)
  (field-categories/categorize-table! id force))

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

(api.macros/defendpoint :get "/samples"
  :- [:maybe [:map
              [:tables  [:sequential [:map
                                      [:table_id     ms/PositiveInt]
                                      [:row_count    :int]
                                      [:sample_count :int]]]]
              [:columns [:sequential [:map
                                      [:field_id ms/PositiveInt]
                                      [:min      number?]
                                      [:max      number?]]]]]]
  "Prototype: the samples of the slow tables. For each table, its row count and the size of its sample. For each
  number column of these tables, its exact min and max."
  []
  (samples/sample-info))

(api.macros/defendpoint :post "/filter-summary"
  :- [:map [:summary [:maybe :string]]]
  "Prototype: a short summary of the filters of a question, for the filter bar. `filters` are the texts of the
  filter pills."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:question_name {:optional true} [:maybe :string]]
            [:filters       [:sequential {:min 1} ms/NonBlankString]]]]
  (filter-summary/summarize-filters body))

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
