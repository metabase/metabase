(ns metabase.native-query-snippets.models.native-query-snippet
  (:require
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.db :as native-query-snippets.db]
   [metabase.native-query-snippets.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Entity & Lifecycle -----------------------------------------------

(methodical/defmethod t2/table-name :model/NativeQuerySnippet [_model] :native_query_snippet)

(doto :model/NativeQuerySnippet
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/dependencies))

;; TODO (Cam 2026-07-08) Change Native Query Snippets to store template tags as a list like we do in MBQL as of 63.
(t2/deftransforms :model/NativeQuerySnippet
  {:template_tags {:in mi/json-in
                   :out (comp (mi/catch-normalization-exceptions
                               #(lib/normalize :metabase.lib.schema.template-tag/template-tag-map %))
                              mi/json-out-without-keywordization)}})

(defmethod collection/allowed-namespaces :model/NativeQuerySnippet
  [_]
  #{:snippets})

(events/derive! ::event :metabase/event)
(doseq [e [:event/snippet-create :event/snippet-update :event/snippet-delete]]
  (events/derive! e ::event))

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
        new-tags (into {}
                       (map (juxt :name identity))
                       (lib/recognize-template-tags (:content snippet)))
        set-snippet-id (fn [{:keys [snippet-name] :as tag}]
                         ;; Check for exact match in database:
                         (if-let [snippet-id (native-query-snippets.db/snippet-id-by-name snippet-name)]
                           (assoc tag :snippet-id snippet-id)
                           ;; Use previous reference if possible:
                           (or (name->old-tag snippet-name) tag)))]
    (->> (update-vals new-tags (fn [tag]
                                 (cond-> tag
                                   ;; Preserve :id from old tags if available
                                   (get-in old-tags [(:name tag) :id])
                                   (assoc :id (get-in old-tags [(:name tag) :id]))
                                   (snippet-tag? tag)
                                   (set-snippet-id))))
         (assoc snippet :template_tags))))

(t2/define-before-insert :model/NativeQuerySnippet [snippet]
  (u/prog1 (add-template-tags snippet)
    (collection/check-allowed-content :model/NativeQuerySnippet (:collection_id snippet))
    (collection/check-collection-namespace :model/NativeQuerySnippet (:collection_id snippet))))

(t2/define-after-insert :model/NativeQuerySnippet
  [snippet]
  (u/prog1 (t2.realize/realize snippet)
    (events/publish-event! :event/snippet-create {:object <> :user-id api/*current-user-id*})))

(defenterprise pre-update-check-sandbox-constraints-for-snippet
  "Checks additional sandboxing constraints for Metabase Enterprise Edition. The OSS implementation is a no-op."
  metabase-enterprise.sandbox.models.sandbox
  [_ _])

(defenterprise pre-delete-check-sandbox-constraints-for-snippet
  "Checks additional sandboxing constraints for Metabase Enterprise Edition. The OSS implementation is a no-op."
  metabase-enterprise.sandbox.models.sandbox
  [_])

(t2/define-before-update :model/NativeQuerySnippet
  [snippet]
  ;; additional checks (Enterprise Edition only)
  (pre-update-check-sandbox-constraints-for-snippet snippet (t2/changes snippet))
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
  ;; additional checks (Enterprise Edition only)
  (pre-delete-check-sandbox-constraints-for-snippet snippet)
  (u/prog1 snippet
    (events/publish-event! :event/snippet-delete {:object <> :user-id api/*current-user-id*})))

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
   [:fn {:json-schema {:type "string"}}
    (fn [x]
      ((every-pred
        string?
        (complement #(boolean (re-find #"^\s+" %)))
        (complement #(boolean (re-find #"}" %))))
       x))]
   (deferred-tru "snippet names cannot include ''}'' or start with spaces")))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defn- walk-export-renames
  "The renames of the card tags in `template-tags` whose `#<id>-slug` name embeds this instance's card id, with the
  card entity ids `visit` resolves."
  [visit template-tags]
  (serialization/card-template-tag-renames
   (partial serialization/card-template-tag-export-rename (partial serialization/card-entity-id visit))
   (vals template-tags)))

(defn- walk-import-template-tags
  "The `template-tags` of a snippet imported with `visit`, and the renames of the card tags whose name embeds the
  exporting instance's card id."
  [visit template-tags]
  (let [[visit' card-entity-id] (serialization/recording-card-entity-ids visit)]
    (when-let [tags (some->> template-tags (serialization/walk-import visit'))]
      (if (serialization/collecting? visit)
        {:tags tags :renames {}}
        (let [tags (lib/normalize :metabase.lib.schema.template-tag/template-tag-map tags)]
          {:tags    tags
           :renames (serialization/card-template-tag-renames
                     (partial serialization/card-template-tag-import-rename card-entity-id)
                     (vals tags))})))))

(defn- rename-in-text [content renames]
  (cond-> content
    (and (string? content) (seq renames)) (lib/rename-template-tags-in-text renames)))

(defmethod serialization/spec :model/NativeQuerySnippet [_]
  {:schema    ::native-query-snippets.schema/external-native-query-snippet
   :copy      [:archived :description :entity_id :name]
   :transform {:collection_id (serialization/fk-transform :model/Collection)
               :creator_id    serialization/user-transform
               :content       {:export (fn [store snippets _ _]
                                         (serialization/export-in-bulk
                                          store
                                          snippets
                                          (fn [visit {:keys [content template_tags]}]
                                            (rename-in-text content (walk-export-renames visit template_tags)))))
                               :import (fn [store entities _ opts]
                                         (serialization/import-in-bulk
                                          store
                                          entities
                                          opts
                                          (fn [visit {:keys [content template_tags]}]
                                            (rename-in-text content (:renames (walk-import-template-tags
                                                                               visit template_tags))))))}
               :template_tags {:export (fn [store _ tag-maps _]
                                         (serialization/export-in-bulk
                                          store
                                          tag-maps
                                          (fn [visit tags]
                                            (serialization/walk-export
                                             visit
                                             (some-> tags
                                                     (lib/rename-template-tags (walk-export-renames visit tags)))))))
                               :import (fn [store _ tag-maps opts]
                                         (serialization/import-in-bulk
                                          store
                                          tag-maps
                                          opts
                                          (fn [visit tags]
                                            (let [{:keys [tags renames]} (walk-import-template-tags visit tags)]
                                              (some-> tags (lib/rename-template-tags renames))))))}}
   :defaults  {:archived false}})

(defmethod serialization/storage-paths :model/NativeQuerySnippet [_ entities ctx]
  (mapv (fn [snippet]
          (serialization/storage-default-collection-path snippet ctx "snippets"))
        entities))

;;; ---------------------------------------------- SerDes dependencies -------------------------------------------------

(defmethod serialization/import-dependencies :model/NativeQuerySnippet [_ entities]
  (mapv (fn [{:keys [collection_id template_tags]}]
          (set (concat (when collection_id [[:model/Collection collection_id]])
                       (serialization/import-mbql-dependencies template_tags))))
        entities))

(defmethod serialization/export-dependencies :model/NativeQuerySnippet [_ snippets]
  (mapv (fn [{:keys [collection_id template_tags]}]
          (set (concat (when collection_id [[:model/Collection collection_id]])
                       (serialization/export-mbql-dependencies template_tags))))
        snippets))

;;; ------------------------------------------------- SerDes loading ----------------------------------------------------

(defmethod serialization/before-load :model/NativeQuerySnippet [_ items]
  (let [taken (when-let [names (seq (distinct (keep (comp :name :row) items)))]
                (into {} (map (juxt :name :entity_id)) (native-query-snippets.db/snippet-names-and-entity-ids (vec names))))]
    (first
     (reduce (fn [[items taken] {{:keys [entity_id] snippet-name :name} :row :as item}]
               (let [free? #(let [owner (get taken %)] (or (nil? owner) (= owner entity_id)))
                     n     (first (filter free? (iterate #(str % " (copy)") snippet-name)))]
                 [(conj items (assoc-in item [:row :name] n)) (assoc taken n entity_id)]))
             [[] taken]
             items))))
