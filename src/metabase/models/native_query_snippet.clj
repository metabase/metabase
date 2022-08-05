(ns metabase.models.native-query-snippet
  (:require [metabase.models.collection :as collection]
            [metabase.models.interface :as mi]
            [metabase.models.native-query-snippet.permissions :as snippet.perms]
            [metabase.models.serialization.base :as serdes.base]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.serialization.util :as serdes.util]
            [metabase.util :as u]
            [metabase.util.i18n :refer [deferred-tru tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(models/defmodel NativeQuerySnippet :native_query_snippet)

(defmethod collection/allowed-namespaces (class NativeQuerySnippet)
  [_]
  #{:snippets})

(defn- pre-insert [snippet]
  (u/prog1 snippet
    (collection/check-collection-namespace NativeQuerySnippet (:collection_id snippet))))

(defn- pre-update [{:keys [creator_id id], :as updates}]
  (u/prog1 updates
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? updates :creator_id)
      (when (not= creator_id (db/select-one-field :creator_id NativeQuerySnippet :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a NativeQuerySnippet.")))))
    (collection/check-collection-namespace NativeQuerySnippet (:collection_id updates))))

(u/strict-extend (class NativeQuerySnippet)
  models/IModel
  (merge
   models/IModelDefaults
   {:properties (constantly {:timestamped? true
                             :entity_id    true})
    :pre-insert pre-insert
    :pre-update pre-update})

  mi/IObjectPermissions
  (merge
   mi/IObjectPermissionsDefaults
   {:can-read?   snippet.perms/can-read?
    :can-write?  snippet.perms/can-write?
    :can-create? snippet.perms/can-create?
    :can-update? snippet.perms/can-update?})

  serdes.hash/IdentityHashable
  {:identity-hash-fields (constantly [:name (serdes.hash/hydrated-hash :collection)])})


;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def NativeQuerySnippetName
  "Schema checking that snippet names do not include \"}\" or start with spaces."
  (su/with-api-error-message
   (s/pred (every-pred
            string?
            (complement #(boolean (re-find #"^\s+" %)))
            (complement #(boolean (re-find #"}" %)))))
   (deferred-tru "snippet names cannot include '}' or start with spaces")))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes.base/extract-query "NativeQuerySnippet" [_ {:keys [user]}]
  ;; TODO This join over the subset of collections this user can see is shared by a few things - factor it out?
  (serdes.base/raw-reducible-query
    "NativeQuerySnippet"
    {:select     [:snippet.*]
     :from       [[:native_query_snippet :snippet]]
     :left-join  [[:collection :coll] [:= :coll.id :snippet.collection_id]]
     :where      (if user
                   ;; :snippet.collection_id is nullable, but this is a left join, so it works out neatly:
                   ;; if this snippet has no collection, :coll.personal_owner_id is effectively NULL.
                   [:or [:= :coll.personal_owner_id user] [:is :coll.personal_owner_id nil]]
                   [:is :coll.personal_owner_id nil])}))

(defmethod serdes.base/serdes-generate-path "NativeQuerySnippet" [_ snippet]
  [(assoc (serdes.base/infer-self-path "NativeQuerySnippet" snippet)
          :label (:name snippet))])

(defmethod serdes.base/extract-one "NativeQuerySnippet"
  [_model-name _opts snippet]
  (-> (serdes.base/extract-one-basics "NativeQuerySnippet" snippet)
      (update :creator_id serdes.util/export-fk-keyed 'User :email)
      (update :collection_id #(when % (serdes.util/export-fk % 'Collection)))))

(defmethod serdes.base/load-xform "NativeQuerySnippet" [snippet]
  (-> snippet
      serdes.base/load-xform-basics
      (update :creator_id serdes.util/import-fk-keyed 'User :email)
      (update :collection_id #(when % (serdes.util/import-fk % 'Collection)))))

(defmethod serdes.base/serdes-dependencies "NativeQuerySnippet"
  [{:keys [collection_id]}]
  (if collection_id
    [[{:model "Collection" :id collection_id}]]
    []))
