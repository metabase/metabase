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
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn ^:private hydrated-native-query-snippet :- [:maybe (ms/InstanceOf NativeQuerySnippet)]
  [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one NativeQuerySnippet :id id))
      (t2/hydrate :creator)))

(api/defendpoint GET "/"
  "Fetch all snippets"
  [archived]
  {archived [:maybe ms/BooleanValue]}
  (let [snippets (t2/select NativeQuerySnippet
                            :archived archived
                            {:order-by [[:%lower.name :asc]]})]
    (t2/hydrate (filter mi/can-read? snippets) :creator)))

(api/defendpoint GET "/:id"
  "Fetch native query snippet with ID."
  [id]
  {id ms/PositiveInt}
  (hydrated-native-query-snippet id))

(defn- check-snippet-name-is-unique [snippet-name]
  (when (t2/exists? NativeQuerySnippet :name snippet-name)
    (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                    {:status-code 400}))))

(api/defendpoint POST "/"
  "Create a new `NativeQuerySnippet`."
  [:as {{:keys [content description name collection_id]} :body}]
  {content       :string
   description   [:maybe :string]
   name          native-query-snippet/NativeQuerySnippetName
   collection_id [:maybe ms/PositiveInt]}
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

(api/defendpoint PUT "/:id"
  "Update an existing `NativeQuerySnippet`."
  [id :as {{:keys [archived content description name collection_id] :as body} :body}]
  {id            ms/PositiveInt
   archived      [:maybe :boolean]
   content       [:maybe :string]
   description   [:maybe :string]
   name          [:maybe native-query-snippet/NativeQuerySnippetName]
   collection_id [:maybe ms/PositiveInt]}
  (check-perms-and-update-snippet! id body))

(api/define-routes)
