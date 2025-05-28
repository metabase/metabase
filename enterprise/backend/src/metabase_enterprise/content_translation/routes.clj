(ns metabase-enterprise.content-translation.routes
  "Endpoints relating to the translation of user-generated content"
  (:require
   [metabase-enterprise.content-translation.dictionary :as dictionary]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(api.macros/defendpoint :post
  "/upload-dictionary"
  "Upload a CSV of content translations"
  {:multipart true}
  [_route_params
   _query-params
   _body
   {:keys [multipart-params], :as _request} :- [:map
                                                [:multipart-params
                                                 [:map
                                                  ["file"
                                                   [:map
                                                    [:filename :string]
                                                    [:tempfile (ms/InstanceOfClass java.io.File)]]]]]]]
  (dictionary/import-translations! {:filename (get-in multipart-params ["file" :filename])
                                    :file     (get-in multipart-params ["file" :tempfile])})
  {:success true})

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/content-translation` routes."
  (api.macros/ns-handler *ns* +auth))
