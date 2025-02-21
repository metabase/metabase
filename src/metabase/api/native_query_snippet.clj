(ns metabase.api.native-query-snippet
  "Native query snippet (/api/native-query-snippet) endpoints."
  (:require
   [clojure.data :as data]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.interface :as mi]
   [metabase.models.native-query-snippet :as native-query-snippet]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn- hydrated-native-query-snippet :- [:maybe (ms/InstanceOf :model/NativeQuerySnippet)]
  [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one :model/NativeQuerySnippet :id id))
      (t2/hydrate :creator)))

(api.macros/defendpoint :get "/"
  "Fetch all snippets"
  [_route-params
   {:keys [archived]} :- [:map
                          [:archived {:default false} [:maybe ms/BooleanValue]]]]
  (let [snippets (t2/select :model/NativeQuerySnippet
                            :archived archived
                            {:order-by [[:%lower.name :asc]]})]
    (t2/hydrate (filter mi/can-read? snippets) :creator)))

(api.macros/defendpoint :get "/:id"
  "Fetch native query snippet with ID."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (hydrated-native-query-snippet id))

(defn- check-snippet-name-is-unique [snippet-name]
  (when (t2/exists? :model/NativeQuerySnippet :name snippet-name)
    (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                    {:status-code 400}))))

(api.macros/defendpoint :post "/"
  "Create a new `NativeQuerySnippet`."
  [_route-params
   _query-params
   {:keys [content description name collection_id]} :- [:map
                                                        [:content       :string]
                                                        [:description   {:optional true} [:maybe :string]]
                                                        [:name          native-query-snippet/NativeQuerySnippetName]
                                                        [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (check-snippet-name-is-unique name)
  (let [snippet {:content       content
                 :creator_id    api/*current-user-id*
                 :description   description
                 :name          name
                 :collection_id collection_id}]
    (api/create-check :model/NativeQuerySnippet snippet)
    (api/check-500 (first (t2/insert-returning-instances! :model/NativeQuerySnippet snippet)))))

(defn- check-perms-and-update-snippet!
  "Check whether current user has write permissions, then update NativeQuerySnippet with values in `body`.  Returns
  updated/hydrated NativeQuerySnippet"
  [id body]
  (let [snippet     (t2/select-one :model/NativeQuerySnippet :id id)
        body-fields (u/select-keys-when body
                                        :present #{:description :collection_id}
                                        :non-nil #{:archived :content :name})
        [changes]   (data/diff body-fields snippet)]
    (when (seq changes)
      (api/update-check snippet changes)
      (when-let [new-name (:name changes)]
        (check-snippet-name-is-unique new-name))
      (t2/update! :model/NativeQuerySnippet id changes))
    (hydrated-native-query-snippet id)))

(api.macros/defendpoint :put "/:id"
  "Update an existing `NativeQuerySnippet`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:archived      {:optional true} [:maybe :boolean]]
            [:content       {:optional true} [:maybe :string]]
            [:description   {:optional true} [:maybe :string]]
            [:name          {:optional true} [:maybe native-query-snippet/NativeQuerySnippetName]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]]]
  (check-perms-and-update-snippet! id body))
