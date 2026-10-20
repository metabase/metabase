(ns metabase.prototype.api
  "`/api/prototype/` endpoints."
  (:require
   [metabase.api.macros :as api.macros]
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
