(ns metabase.api.native-query-snippet
  "Native query snippet (/api/native-query-snippet) endpoints."
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models
             [interface :as mi]
             [native-query-snippet :as snippet :refer [NativeQuerySnippet]]]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(s/defn ^:private hydrated-native-query-snippet :- (s/maybe (class NativeQuerySnippet))
  [id :- su/IntGreaterThanZero]
  (-> (api/read-check (NativeQuerySnippet id))
      (hydrate :creator)))

(api/defendpoint GET "/"
  "Fetch all snippets"
  [archived]
  {archived (s/maybe su/BooleanString)}
  (let [snippets (db/select NativeQuerySnippet
                            :archived (Boolean/parseBoolean archived)
                            {:order-by [[:%lower.name :asc]]})]
    (hydrate (filter mi/can-read? snippets) :creator)))

(api/defendpoint GET "/:id"
  "Fetch native query snippet with ID."
  [id]
  (hydrated-native-query-snippet id))

(api/defendpoint POST "/"
  "Create a new `NativeQuerySnippet`."
  [:as {{:keys [content database_id description name]} :body}]
  {content     s/Str
   database_id su/IntGreaterThanZero
   description (s/maybe s/Str)
   name        snippet/NativeQuerySnippetName}
  (api/check-superuser)
  (api/check-500
   (db/insert! NativeQuerySnippet
               {:content     content
                :creator_id  api/*current-user-id*
                :database_id database_id
                :description description
                :name        name})))

(defn- write-check-and-update-snippet!
  "Check whether current user has write permissions, then update NativeQuerySnippet with values in `body`.  Returns
  updated/hydrated NativeQuerySnippet"
  [id body]
  (let [snippet     (api/write-check NativeQuerySnippet id)
        body-fields (u/select-keys-when body
                      :present #{:description}
                      :non-nil #{:archived :content :name})
        changes     (when-not (= body-fields (select-keys snippet (keys body-fields)))
                      body-fields)]
    (when changes
      (db/update! NativeQuerySnippet id changes))
    (hydrated-native-query-snippet id)))

(api/defendpoint PUT "/:id"
  "Update an existing `NativeQuerySnippet`."
  [id :as {{:keys [archived content description name] :as body} :body}]
  {archived    (s/maybe s/Bool)
   content     (s/maybe s/Str)
   description (s/maybe s/Str)
   name        (s/maybe snippet/NativeQuerySnippetName)}
  (write-check-and-update-snippet! id body))


(api/define-routes)
