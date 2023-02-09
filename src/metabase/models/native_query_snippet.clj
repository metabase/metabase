(ns metabase.models.native-query-snippet
  (:require
   [metabase.models.collection :as collection]
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

(defmethod collection/allowed-namespaces NativeQuerySnippet
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

(mi/define-methods
 NativeQuerySnippet
 {:properties (constantly {::mi/timestamped? true
                           ::mi/entity-id    true})
  :pre-insert pre-insert
  :pre-update pre-update})

(defmethod serdes.hash/identity-hash-fields NativeQuerySnippet
  [_snippet]
  [:name (serdes.hash/hydrated-hash :collection "<none>") :created_at])

(defmethod mi/can-read? NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-read? args))

(defmethod mi/can-write? NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-write? args))

(defmethod mi/can-create? NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-create? args))

(defmethod mi/can-update? NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-update? args))


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

(defmethod serdes.base/extract-query "NativeQuerySnippet" [_ opts]
  (serdes.base/extract-query-collections NativeQuerySnippet opts))

(defmethod serdes.base/extract-one "NativeQuerySnippet"
  [_model-name _opts snippet]
  (-> (serdes.base/extract-one-basics "NativeQuerySnippet" snippet)
      (update :creator_id serdes.util/export-user)
      (update :collection_id #(when % (serdes.util/export-fk % 'Collection)))))

(defmethod serdes.base/load-xform "NativeQuerySnippet" [snippet]
  (-> snippet
      serdes.base/load-xform-basics
      (update :creator_id serdes.util/import-user)
      (update :collection_id #(when % (serdes.util/import-fk % 'Collection)))))

(defmethod serdes.base/serdes-dependencies "NativeQuerySnippet"
  [{:keys [collection_id]}]
  (if collection_id
    [[{:model "Collection" :id collection_id}]]
    []))

(defmethod serdes.base/storage-path "NativeQuerySnippet" [snippet ctx]
  ;; Intended path here is ["snippets" "nested" "collections" "snippet_eid_and_slug"]
  ;; We just the default path, then pull it apart.
  ;; The default is ["collections" "nested" collections" "nativequerysnippets" "base_name"]
  (let [basis  (serdes.base/storage-default-collection-path snippet ctx)
        file   (last basis)
        colls  (->> basis rest (drop-last 2))] ; Drops the "collections" at the start, and the last two.
    (concat ["snippets"] colls [file])))

(serdes.base/register-ingestion-path!
  "NativeQuerySnippet"
  (fn [path]
    (when-let [[id slug] (and (= (first path) "snippets")
                              (serdes.base/split-leaf-file-name (last path)))]
      (cond-> {:model "NativeQuerySnippet" :id id}
        slug (assoc :label slug)
        true vector))))
