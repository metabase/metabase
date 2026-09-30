(ns metabase.llm.api
  "API endpoints for LLM provider connections and native query source extraction."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.llm.api.provider]
   [metabase.llm.context :as llm.context]))

(set! *warn-on-reflection* true)

(def ^:private table-with-columns-schema
  "Schema for table metadata with columns returned by /extract-sources."
  [:map
   [:id pos-int?]
   [:name :string]
   [:schema {:optional true} [:maybe :string]]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:columns [:sequential
              [:map
               [:id pos-int?]
               [:name :string]
               [:database_type {:optional true} [:maybe :string]]
               [:description {:optional true} [:maybe :string]]
               [:semantic_type {:optional true} [:maybe :string]]
               [:fk_target {:optional true}
                [:map
                 [:table_name :string]
                 [:field_name :string]]]]]]])

(def ^:private template-tags-schema
  [:map-of :string
   [:map {:closed true}
    [:type :string]
    [:card-id {:optional true} pos-int?]]])

(api.macros/defendpoint :post "/extract-sources"
  :- [:map
      [:tables [:sequential table-with-columns-schema]]
      [:card_ids [:sequential pos-int?]]]
  "Parse native query sources and return referenced tables and cards/models.

    Uses Macaw to parse the SQL, resolves table names to IDs,
    and returns permission-filtered tables with column metadata. Card and model
    references are extracted from native query template tags.

    This is a lightweight endpoint that does not trigger fingerprinting
    or field value fetching."
  [_route-params
   _query-params
   body :- [:map {:closed true}
            [:database_id pos-int?]
            [:sql :string]
            [:template_tags {:optional true} template-tags-schema]]]
  (let [{:keys [database_id sql template_tags]} body
        table-ids (llm.context/extract-tables-from-sql database_id sql)
        card-ids  (llm.context/extract-card-ids-from-template-tags template_tags)
        tables    (llm.context/get-tables-with-columns database_id table-ids)]
    {:tables   (or tables [])
     :card_ids (sort (or (llm.context/get-accessible-card-ids card-ids) #{}))}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` routes."
  (handlers/routes
   (+auth metabase.llm.api.provider/routes)
   (api.macros/ns-handler *ns* +auth)))
