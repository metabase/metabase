(ns metabase-enterprise.metabot-v3.api.document
  "`/api/ee/metabot-v3/document` routes"
  (:require
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :post "/generate-content"
  "Create a new piece of content to insert into the document."
  [_route-params
   _query-params

   body :- [:map
            [:instructions ms/NonBlankString]]]
  (metabot-v3.client/document-generate-content {:instructions (:instructions body)
                                                :user_id         api/*current-user-id*
                                                :conversation_id (str (random-uuid))}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/metabot-v3/document` routes."
  (api.macros/ns-handler *ns* +auth))
