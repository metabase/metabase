(ns metabase.native-query-snippets.serialization
  "The SerDes of NativeQuerySnippets, whose card tags embed the card ids of the instance that exports them."
  (:require
   [metabase.lib.core :as lib]
   [metabase.native-query-snippets.db :as native-query-snippets.db]
   [metabase.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

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

(defn- rename-in-text
  "`content` with the template tags of `renames` renamed."
  [content renames]
  (cond-> content
    (and (string? content) (seq renames)) (lib/rename-template-tags-in-text renames)))

(defn- export-content
  "Exports the `content` of `snippets` with the card tags whose name embeds this instance's card id renamed."
  [store snippets _values _opts]
  (serialization/export-in-bulk
   store
   snippets
   (fn [visit {:keys [content template_tags]}]
     (rename-in-text content (walk-export-renames visit template_tags)))))

(defn- import-content
  "Imports the `content` of `entities` with the card tags whose name embeds the exporting instance's card id renamed."
  [store entities _values opts]
  (serialization/import-in-bulk
   store
   entities
   opts
   (fn [visit {:keys [content template_tags]}]
     (rename-in-text content (:renames (walk-import-template-tags visit template_tags))))))

(def content-transform
  "The transform of the `content` of NativeQuerySnippets."
  {:export export-content
   :import import-content})

(defn- export-template-tags
  "Exports the `template_tags` values `tag-maps` with references in place of ids, renaming the card tags."
  [store _snippets tag-maps _opts]
  (serialization/export-in-bulk
   store
   tag-maps
   (fn [visit tags]
     (serialization/walk-export
      visit
      (some-> tags
              (lib/rename-template-tags (walk-export-renames visit tags)))))))

(defn- import-template-tags
  "Imports the exported `template_tags` values `tag-maps` with ids in place of references, renaming the card tags."
  [store _entities tag-maps opts]
  (serialization/import-in-bulk
   store
   tag-maps
   opts
   (fn [visit tags]
     (let [{:keys [tags renames]} (walk-import-template-tags visit tags)]
       (some-> tags (lib/rename-template-tags renames))))))

(def template-tags-transform
  "The transform of the `template_tags` of NativeQuerySnippets."
  {:export export-template-tags
   :import import-template-tags})

(defn storage-paths
  "The storage path of each of the NativeQuerySnippet `entities`, in the `snippets` folder by its collection."
  [entities ctx]
  (mapv (fn [snippet]
          (serialization/storage-default-collection-path snippet ctx "snippets"))
        entities))

(defn import-dependencies
  "The `[model ref]` of the Collection of each of the NativeQuerySnippet `entities` and of what its tags refer to."
  [entities]
  (mapv (fn [{:keys [collection_id template_tags]}]
          (set (concat (when collection_id [[:model/Collection collection_id]])
                       (serialization/import-mbql-dependencies template_tags))))
        entities))

(defn export-dependencies
  "The `[model id]` of the Collection of each of the `snippets` and of what its tags refer to."
  [snippets]
  (mapv (fn [{:keys [collection_id template_tags]}]
          (set (concat (when collection_id [[:model/Collection collection_id]])
                       (serialization/export-mbql-dependencies template_tags))))
        snippets))

(defn before-load
  "The NativeQuerySnippet load `items`, each renamed with ` (copy)` suffixes until no other snippet holds its name."
  [items]
  (let [taken (when-let [names (seq (distinct (keep (comp :name :row) items)))]
                (into {} (map (juxt :name :entity_id)) (native-query-snippets.db/snippet-names-and-entity-ids (vec names))))]
    (first
     (reduce (fn [[items taken] {{:keys [entity_id] snippet-name :name} :row :as item}]
               (let [free? #(let [owner (get taken %)] (or (nil? owner) (= owner entity_id)))
                     n     (first (filter free? (iterate #(str % " (copy)") snippet-name)))]
                 [(conj items (assoc-in item [:row :name] n)) (assoc taken n entity_id)]))
             [[] taken]
             items))))
