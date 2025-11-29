(ns metabase-enterprise.llm.api
  (:require
   [metabase-enterprise.llm.tasks.describe-dashboard :refer [describe-dashboard]]
   [metabase-enterprise.llm.tasks.describe-question :refer [describe-question]]
   [metabase.analyze.query-results :as qr]
   [metabase.api.macros :as api.macros]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.malli.schema :as ms]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/card/summarize"
  "Summarize a question."
  [_route-params
   _query-params
   body :- [:map
            [:dataset                {:optional true} [:maybe :boolean]]
            [:dataset_query          ms/Map]
            [:parameters             {:optional true} [:maybe [:sequential ::parameters.schema/parameter]]]
            [:parameter_mappings     {:optional true} [:maybe [:sequential ::parameters.schema/parameter-mapping]]]
            [:description            {:optional true} [:maybe ms/NonBlankString]]
            [:display                ms/NonBlankString]
            [:visualization_settings ms/Map]
            [:collection_id          {:optional true} [:maybe ms/PositiveInt]]
            [:collection_position    {:optional true} [:maybe ms/PositiveInt]]
            [:result_metadata        {:optional true} [:maybe qr/ResultsMetadata]]
            [:cache_ttl              {:optional true} [:maybe ms/PositiveInt]]]]
  ;; check that we have permissions to run the query that we're trying to save
                                        ;(check-data-permissions-for-query dataset_query)
  {:summary (describe-question body)})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/dashboard/summarize/:id"
  "Provide a summary of a dashboard."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  {:summary (describe-dashboard id)})
