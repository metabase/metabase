(ns metabase.api.native-query-snippet
  "Native query snippet (/api/native-query-snippet) endpoints."
  (:require
   [clojure.data :as data]
   [compojure.core :refer [GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.native-query-snippet
    :as native-query-snippet
    :refer [NativeQuerySnippet]]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.schema :as su]
   [schema.core :as s]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(s/defn ^:private hydrated-native-query-snippet :- (s/maybe (mi/InstanceOf NativeQuerySnippet))
  [id :- su/IntGreaterThanZero]
  (-> (api/read-check (t2/select-one NativeQuerySnippet :id id))
      (t2/hydrate :creator)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/"
  "Fetch all snippets"
  [archived]
  {archived (s/maybe su/BooleanString)}
  (let [snippets (t2/select NativeQuerySnippet
                            :archived (Boolean/parseBoolean archived)
                            {:order-by [[:%lower.name :asc]]})]
    (t2/hydrate (filter mi/can-read? snippets) :creator)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema GET "/:id"
  "Fetch native query snippet with ID."
  [id]
  (hydrated-native-query-snippet id))

(defn- check-snippet-name-is-unique [snippet-name]
  (when (t2/exists? NativeQuerySnippet :name snippet-name)
    (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                    {:status-code 400}))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/"
  "Create a new `NativeQuerySnippet`."
  [:as {{:keys [content description name collection_id]} :body}]
  {content       s/Str
   description   (s/maybe s/Str)
   name          native-query-snippet/NativeQuerySnippetName
   collection_id (s/maybe su/IntGreaterThanZero)}
  (check-snippet-name-is-unique name)
  (let [snippet {:content       content
                 :creator_id    api/*current-user-id*
                 :description   description
                 :name          name
                 :collection_id collection_id}]
    (api/create-check NativeQuerySnippet snippet)
    (api/check-500 (first (t2/insert-returning-instances! NativeQuerySnippet snippet)))))

(defn- check-perms-and-update-snippet!
  "Check whether current user has write permissions, then update NativeQuerySnippet with values in `body`.  Returns
  updated/hydrated NativeQuerySnippet"
  [id body]
  (let [snippet     (t2/select-one NativeQuerySnippet :id id)
        body-fields (u/select-keys-when body
                      :present #{:description :collection_id}
                      :non-nil #{:archived :content :name})
        [changes]   (data/diff body-fields snippet)]
    (when (seq changes)
      (api/update-check snippet changes)
      (when-let [new-name (:name changes)]
        (check-snippet-name-is-unique new-name))
      (t2/update! NativeQuerySnippet id changes))
    (hydrated-native-query-snippet id)))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema PUT "/:id"
  "Update an existing `NativeQuerySnippet`."
  [id :as {{:keys [archived content description name collection_id] :as body} :body}]
  {archived      (s/maybe s/Bool)
   content       (s/maybe s/Str)
   description   (s/maybe s/Str)
   name          (s/maybe native-query-snippet/NativeQuerySnippetName)
   collection_id (s/maybe su/IntGreaterThanZero)}
  (check-perms-and-update-snippet! id body))

(api/define-routes)
