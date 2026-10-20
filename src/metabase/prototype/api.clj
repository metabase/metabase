(ns metabase.prototype.api
  "`/api/prototype/` endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.prototype.field-categories :as field-categories]
   [metabase.prototype.filter-usage :as filter-usage]
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
