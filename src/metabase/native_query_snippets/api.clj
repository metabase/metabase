(ns metabase.native-query-snippets.api
  "Native query snippet (/api/native-query-snippet) endpoints."
  (:require
   [clojure.data :as data]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.eid-translation.core :as eid-translation]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.db :as native-query-snippets.db]
   [metabase.native-query-snippets.models.native-query-snippet :as native-query-snippet]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn list-native-query-snippets :- [:sequential (ms/InstanceOf :model/NativeQuerySnippet)]
  "List all native query snippets the current user has read access to."
  ([]
   (list-native-query-snippets false))
  ([archived :- ms/BooleanValue]
   (let [snippets (native-query-snippets.db/snippets-by-archived archived)]
     (t2/hydrate (mi/readable snippets) :can_write :creator :is_remote_synced))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Fetch all snippets"
  [_route-params
   {:keys [archived]} :- [:map {:closed true}
                          [:archived {:default false} [:maybe ms/BooleanValue]]]]
  (list-native-query-snippets (boolean archived)))

(mu/defn get-native-query-snippet :- [:maybe (ms/InstanceOf :model/NativeQuerySnippet)]
  "Fetch native query snippet with ID and hydrate creator."
  [id :- ms/PositiveInt]
  (-> (api/read-check (native-query-snippets.db/snippet id))
      (t2/hydrate :creator :is_remote_synced)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
;; Not tagged `data-apps:base`, though the list route above is: a data app needs the list to
;; resolve snippet names while rendering a native question, whereas fetching one by id is the
;; Data Studio snippet editor (`useGetSnippetQuery`), which a data app does not render.
(api.macros/defendpoint :get "/:id"
  "Fetch native query snippet with ID, a numeric id or an entity id."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/IdOrEntityId]]]
  (get-native-query-snippet (eid-translation/->id-or-404 :model/NativeQuerySnippet id)))

(defn- check-snippet-name-is-unique [snippet-name]
  (when (native-query-snippets.db/snippet-name-exists? snippet-name)
    (throw (ex-info (tru "A snippet with that name already exists. Please pick a different name.")
                    {:status-code 400}))))

(def ^:private snippet-body-references
  "The model of the rows each column of a NativeQuerySnippet create or update body names, by id or entity id."
  {:collection_id :model/Collection})

(def ^:private TemplateTags
  "The `:template_tags` a snippet body may give. The write takes a snippet's tags from its content, so it reads these
  only in a request in entity id form, to import the card tags of the content."
  ::native-query-snippets.schema/template-tags.given)

(defn- snippet-body-schema
  "`schema`, the schema of a snippet create or update body, that in a request in entity id form also takes the
  `:content` and `:template_tags` as serialization exports them."
  [schema]
  (eid-translation/structures-schema :model/NativeQuerySnippet [:content :template_tags] schema))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new `NativeQuerySnippet`."
  [_route-params
   _query-params
   body :- (snippet-body-schema
            [:map {:closed true}
             [:content       :string]
             [:description   {:optional true} [:maybe :string]]
             [:name          native-query-snippet/NativeQuerySnippetName]
             [:collection_id {:optional true} [:maybe ms/IdOrEntityId]]
             [:template_tags {:optional true} TemplateTags]])]
  (check-snippet-name-is-unique (:name body))
  (let [{:keys [content description name collection_id]} (eid-translation/refs->ids body snippet-body-references)
        snippet {:content       content
                 :creator_id    api/*current-user-id*
                 :description   description
                 :name          name
                 :collection_id collection_id}]
    (api/create-check :model/NativeQuerySnippet snippet)
    (first (native-query-snippet/create-snippets! [snippet]))))

(defn- check-perms-and-update-snippet!
  "Check whether current user has write permissions, then update NativeQuerySnippet with values in `body`.  Returns
  updated/hydrated NativeQuerySnippet"
  [id body]
  (let [snippet     (native-query-snippets.db/snippet id)
        body-fields (u/select-keys-when body
                                        :present #{:description :collection_id}
                                        :non-nil #{:archived :content :name})
        [changes]   (data/diff body-fields snippet)]
    (when (seq changes)
      (api/update-check snippet changes)
      (when-let [new-name (:name changes)]
        (check-snippet-name-is-unique new-name))
      (native-query-snippet/update-snippets! [(assoc changes :id id)] nil))
    (get-native-query-snippet id)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update an existing `NativeQuerySnippet`. `id` is a numeric id or an entity id."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/IdOrEntityId]]
   _query-params
   body :- (snippet-body-schema
            [:map {:closed true}
             [:archived      {:optional true} [:maybe :boolean]]
             [:content       {:optional true} [:maybe :string]]
             [:description   {:optional true} [:maybe :string]]
             [:name          {:optional true} [:maybe native-query-snippet/NativeQuerySnippetName]]
             [:collection_id {:optional true} [:maybe ms/IdOrEntityId]]
             [:template_tags {:optional true} TemplateTags]])]
  (check-perms-and-update-snippet! (eid-translation/->id-or-404 :model/NativeQuerySnippet id)
                                   (eid-translation/refs->ids body snippet-body-references)))
