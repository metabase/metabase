(ns metabase.native-query-snippets.models.native-query-snippet
  (:require
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.native-query-snippets.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/NativeQuerySnippet [_model] :native_query_snippet)

(doto :model/NativeQuerySnippet
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/deftransforms :model/NativeQuerySnippet
  {:template_tags {:in mi/json-in
                   :out (comp (mi/catch-normalization-exceptions
                               #(lib.normalize/normalize :metabase.lib.schema.template-tag/template-tag-map %))
                              mi/json-out-without-keywordization)}})

(defmethod collection/allowed-namespaces :model/NativeQuerySnippet
  [_]
  #{:snippets})

(derive ::event :metabase/event)
(doseq [e [:event/snippet-create :event/snippet-update :event/snippet-delete]]
  (derive e ::event))

(defn add-template-tags
  "Update the template tags based on the new contents."
  [{old-tags :template_tags :as snippet}]
  ;; Parse the snippet content to identify all template tags (like {{snippet: FilterA}} or {{var}}).
  ;; For snippet references, we need to resolve them to snippet IDs while preserving reference stability.
  ;;
  ;; Key behavior for snippet references:
  ;; 1. If a snippet with the exact referenced name exists in the DB, use its ID
  ;; 2. Otherwise, preserve the existing snippet-id from old tags if available
  ;;    (this maintains references even when the target snippet has been renamed)
  ;; 3. If neither exists, keep the tag without a snippet-id (reference to non-existent snippet)
  ;;
  ;; This approach ensures that:
  ;; - References remain stable when target snippets are renamed
  ;; - References update to exact matches when the content is re-saved
  ;; - Creating a new snippet with a referenced name will cause queries to switch to it on next save
  (let [snippet-tag? (fn [tag] (= (:type tag) :snippet))
        name->old-tag (into {} (comp (map val)
                                     (filter snippet-tag?)
                                     (map (juxt :snippet-name identity)))
                            old-tags)
        new-tags (lib/recognize-template-tags (:content snippet))
        set-snippet-id (fn [{:keys [snippet-name] :as tag}]
                         ;; Check for exact match in database:
                         (if-let [snippet-id (t2/select-one-fn :id :model/NativeQuerySnippet
                                                               :name snippet-name)]
                           (assoc tag :snippet-id snippet-id)
                           ;; Use previous reference if possible:
                           (or (name->old-tag snippet-name) tag)))]
    (->> (update-vals new-tags (fn [tag]
                                 (cond-> tag (snippet-tag? tag) (set-snippet-id))))
         (assoc snippet :template_tags))))

(t2/define-before-insert :model/NativeQuerySnippet [snippet]
  (u/prog1 (add-template-tags snippet)
    (collection/check-allowed-content :model/NativeQuerySnippet (:collection_id snippet))
    (collection/check-collection-namespace :model/NativeQuerySnippet (:collection_id snippet))))

(t2/define-after-insert :model/NativeQuerySnippet
  [snippet]
  (u/prog1 (t2.realize/realize snippet)
    (events/publish-event! :event/snippet-create {:object <> :user-id api/*current-user-id*})))

(t2/define-before-update :model/NativeQuerySnippet
  [snippet]
  (collection/check-allowed-content :model/NativeQuerySnippet (:collection_id (t2/changes snippet)))
  (u/prog1 (cond-> snippet
             (:content snippet) add-template-tags)
    ;; throw an Exception if someone tries to update creator_id
    (when (contains? (t2/changes <>) :creator_id)
      (throw (UnsupportedOperationException. (tru "You cannot update the creator_id of a NativeQuerySnippet."))))
    (collection/check-collection-namespace :model/NativeQuerySnippet (:collection_id snippet))))

(t2/define-after-update :model/NativeQuerySnippet
  [snippet]
  (u/prog1 (t2.realize/realize snippet)
    (events/publish-event! :event/snippet-update {:object <> :user-id api/*current-user-id*})))

(t2/define-before-delete :model/NativeQuerySnippet
  [snippet]
  (u/prog1 snippet
    (events/publish-event! :event/snippet-delete {:object <> :user-id api/*current-user-id*})))

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

(methodical/defmethod t2/batched-hydrate [:model/NativeQuerySnippet :can_write]
  [_model k snippets]
  (let [non-nil-snippets (remove nil? snippets)
        snippets-with-collections (t2/hydrate non-nil-snippets :collection)
        editable-map (remote-sync/batch-model-editable? :model/NativeQuerySnippet non-nil-snippets)]
    (mi/instances-with-hydrated-data
     snippets k
     #(into {}
            (map (fn [snippet]
                   [(:id snippet)
                    (and (get editable-map (:id snippet) true)
                         (mi/can-write? snippet))]))
            snippets-with-collections)
     :id
     {:default false})))

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
   (deferred-tru "snippet names cannot include ''}'' or start with spaces")))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/extract-query "NativeQuerySnippet" [_ {:keys [collection-set where skip-archived]}]
  ;; NativeQuerySnippets live in their own special collections, so the logic is the following:
  ;; - you either are exporting one of those
  ;; - or it was requested as a dependency of some Card, so export it regardless of collection
  (t2/reducible-select :model/NativeQuerySnippet (cond-> {:where [:and
                                                                  (when skip-archived [:not :archived])
                                                                  [:or
                                                                   (when-let [collection-ids (not-empty (remove nil? collection-set))]
                                                                     [:in :collection_id collection-ids])
                                                                   (when (some nil? collection-set)
                                                                     [:= :collection_id nil])]]}
                                                   where (sql.helpers/where :or where))))

(defmethod serdes/make-spec "NativeQuerySnippet" [_model-name _opts]
  {:copy [:archived :content :description :entity_id :name :template_tags]
   :skip [:dependency_analysis_version]
   :transform {:created_at (serdes/date)
               :collection_id (serdes/fk :model/Collection)
               :creator_id (serdes/fk :model/User)}})

(defmethod serdes/required "NativeQuerySnippet"
  [_model id]
  (when-let [collection_id (t2/select-one-fn :collection_id :model/NativeQuerySnippet :id id)]
    {["Collection" collection_id] {"NativeQuerySnippet" id}}))

(defmethod serdes/dependencies "NativeQuerySnippet"
  [{:keys [collection_id]}]
  (when collection_id
    [[{:model "Collection" :id collection_id}]]))

(defmethod serdes/storage-path "NativeQuerySnippet" [snippet ctx]
  ;; Intended path here is ["snippets" "<nested ... collections>" "<snippet_eid_and_slug>"]
  ;; We just the default path, then pull it apart.
  ;; The default is ["collections" "<nested ... collections>" "nativequerysnippets" "<base_name>"]
  (let [basis (serdes/storage-default-collection-path snippet ctx)
        file  (last basis)
        colls (->> basis rest (drop-last 2))] ; Drops the "collections" at the start, and the last two.
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
