(ns metabase.models.native-query-snippet
  (:require
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.schema :as su]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(def NativeQuerySnippet
  "Used to be the toucan1 model name defined using [[toucan.models/defmodel]], not it's a reference to the toucan2 model name.
  We'll keep this till we replace all these symbols in our codebase."
  :model/NativeQuerySnippet)

(methodical/defmethod t2/table-name :model/NativeQuerySnippet [_model] :native_query_snippet)

(doto :model/NativeQuerySnippet
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(defmethod collection/allowed-namespaces :model/NativeQuerySnippet
  [_]
  #{:snippets})

(t2/define-before-insert :model/NativeQuerySnippet [snippet]
  (u/prog1 snippet
    (collection/check-collection-namespace NativeQuerySnippet (:collection_id snippet))))

(t2/define-before-update :model/NativeQuerySnippet
  [{:keys [creator_id id], :as snippet}]
  (u/prog1 (t2/changes snippet)
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? <> :creator_id)
      (when (not= (:creator_id <>) (t2/select-one-fn :creator_id NativeQuerySnippet :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a NativeQuerySnippet.")))))
    (collection/check-collection-namespace NativeQuerySnippet (:collection_id snippet))))

(defmethod serdes/hash-fields NativeQuerySnippet
  [_snippet]
  [:name (serdes/hydrated-hash :collection) :created_at])

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

(defmethod serdes/extract-query "NativeQuerySnippet" [_ opts]
  (serdes/extract-query-collections NativeQuerySnippet opts))

(defmethod serdes/extract-one "NativeQuerySnippet"
  [_model-name _opts snippet]
  (-> (serdes/extract-one-basics "NativeQuerySnippet" snippet)
      (update :creator_id serdes/*export-user*)
      (update :collection_id #(when % (serdes/*export-fk* % 'Collection)))))

(defmethod serdes/load-xform "NativeQuerySnippet" [snippet]
  (-> snippet
      serdes/load-xform-basics
      (update :creator_id serdes/*import-user*)
      (update :collection_id #(when % (serdes/*import-fk* % 'Collection)))))

(defmethod serdes/dependencies "NativeQuerySnippet"
  [{:keys [collection_id]}]
  (if collection_id
    [[{:model "Collection" :id collection_id}]]
    []))

(defmethod serdes/storage-path "NativeQuerySnippet" [snippet ctx]
  ;; Intended path here is ["snippets" "nested" "collections" "snippet_eid_and_slug"]
  ;; We just the default path, then pull it apart.
  ;; The default is ["collections" "nested" collections" "nativequerysnippets" "base_name"]
  (let [basis  (serdes/storage-default-collection-path snippet ctx)
        file   (last basis)
        colls  (->> basis rest (drop-last 2))] ; Drops the "collections" at the start, and the last two.
    (concat ["snippets"] colls [file])))
