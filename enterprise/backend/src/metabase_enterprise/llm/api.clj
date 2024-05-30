(ns metabase-enterprise.llm.api
  "This feature is still in development."
  (:require
   [compojure.core :refer [GET POST]]
   [metabase-enterprise.llm.tasks.describe-dashboard :refer [describe-dashboard]]
   [metabase-enterprise.llm.tasks.describe-question :refer [describe-question]]
   [metabase.analyze.query-results :as qr]
   [metabase.api.common :as api]
   [metabase.util.malli.schema :as ms]))

(api/defendpoint POST "/card/summarize"
  "Summarize a question."
  [:as {{:keys [collection_id collection_position dataset dataset_query description display
                parameters parameter_mappings result_metadata visualization_settings cache_ttl]
         :as   body} :body}]
  {dataset                [:maybe :boolean]
   dataset_query          ms/Map
   parameters             [:maybe [:sequential ms/Parameter]]
   parameter_mappings     [:maybe [:sequential ms/ParameterMapping]]
   description            [:maybe ms/NonBlankString]
   display                ms/NonBlankString
   visualization_settings ms/Map
   collection_id          [:maybe ms/PositiveInt]
   collection_position    [:maybe ms/PositiveInt]
   result_metadata        [:maybe qr/ResultsMetadata]
   cache_ttl              [:maybe ms/PositiveInt]}
  ;; check that we have permissions to run the query that we're trying to save
  ;(check-data-permissions-for-query dataset_query)
  {:summary (describe-question body)})

(api/defendpoint POST "/dashboard/summarize/:id"
  "Provide a summary of a dashboard."
  [id]
  {id ms/PositiveInt}
  {:summary (describe-dashboard id)})

(api/define-routes)
