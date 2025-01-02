(ns metabase.models.native-query-snippet
  (:require
   [metabase.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

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
    (collection/check-collection-namespace :model/NativeQuerySnippet (:collection_id snippet))))

(t2/define-before-update :model/NativeQuerySnippet
  [{:keys [creator_id id], :as snippet}]
  (u/prog1 (t2/changes snippet)
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? <> :creator_id)
      (when (not= (:creator_id <>) (t2/select-one-fn :creator_id :model/NativeQuerySnippet :id id))
        (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a NativeQuerySnippet.")))))
    (collection/check-collection-namespace :model/NativeQuerySnippet (:collection_id snippet))))

(defmethod serdes/hash-fields :model/NativeQuerySnippet
  [_snippet]
  [:name (serdes/hydrated-hash :collection) :created_at])

(defmethod mi/can-read? :model/NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-read? args))

(defmethod mi/can-write? :model/NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-write? args))

(defmethod mi/can-create? :model/NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-create? args))

(defmethod mi/can-update? :model/NativeQuerySnippet
  [& args]
  (apply snippet.perms/can-update? args))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def NativeQuerySnippetName
  "Schema checking that snippet names do not include \"}\" or start with spaces."
  (mu/with-api-error-message
   [:fn (fn [x]
          ((every-pred
            string?
            (complement #(boolean (re-find #"^\s+" %)))
            (complement #(boolean (re-find #"}" %))))
           x))]
   (deferred-tru "snippet names cannot include '}' or start with spaces")))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/extract-query "NativeQuerySnippet" [_ opts]
  (serdes/extract-query-collections :model/NativeQuerySnippet opts))

(defmethod serdes/make-spec "NativeQuerySnippet" [_model-name _opts]
  {:copy      [:archived :content :description :entity_id :name]
   :transform {:created_at    (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :creator_id    (serdes/fk :model/User)}})

(defmethod serdes/dependencies "NativeQuerySnippet"
  [{:keys [collection_id]}]
  (if collection_id
    [[{:model "Collection" :id collection_id}]]
    []))

(defmethod serdes/storage-path "NativeQuerySnippet" [snippet ctx]
  ;; Intended path here is ["snippets" "<nested ... collections>" "<snippet_eid_and_slug>"]
  ;; We just the default path, then pull it apart.
  ;; The default is ["collections" "<nested ... collections>" "nativequerysnippets" "<base_name>"]
  (let [basis  (serdes/storage-default-collection-path snippet ctx)
        file   (last basis)
        colls  (->> basis rest (drop-last 2))] ; Drops the "collections" at the start, and the last two.
    (concat ["snippets"] colls [file])))

(defmethod serdes/load-one! "NativeQuerySnippet" [ingested maybe-local]
  ;; if we got local snippet in db and it has same name as incoming one, we can be sure
  ;; there will be no conflicts and skip the query to the db
  (if (and (not= (:name ingested) (:name maybe-local))
           (t2/exists? :model/NativeQuerySnippet
                       :name (:name ingested) :entity_id [:!= (:entity_id ingested)]))
    (recur (update ingested :name str " (copy)")
           maybe-local)
    (serdes/default-load-one! ingested maybe-local)))
