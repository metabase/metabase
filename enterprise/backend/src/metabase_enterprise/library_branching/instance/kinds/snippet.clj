(ns metabase-enterprise.library-branching.instance.kinds.snippet
  "The app DB side of the kind `:snippet`, in the item form of `format.kinds.snippet`. `:template_tags` is the portable
  form of the tag map: a snippet reference holds the identity of its snippet. Not content: the archive column (scope)
  and the bookkeeping columns."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.format.kinds :as format.kinds]
   [metabase-enterprise.library-branching.format.kinds.portable :as format.portable]
   [metabase-enterprise.library-branching.format.kinds.snippet :as format.snippet]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.instance.content :as content]
   [metabase-enterprise.library-branching.instance.portable :as portable]
   [metabase-enterprise.library-branching.instance.tree :as tree]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.models.serialization :as serdes]))

(set! *warn-on-reflection* true)

(defn attrs
  "The attributes of `snippet`, with none at its default."
  [snippet]
  (->> (-> (select-keys snippet [:content :description])
           (assoc :template_tags (serdes/export-mbql (:template_tags snippet))))
       portable/document
       (content/attrs format.snippet/spec)))

(defn- portable-content
  [snippet]
  {:place (serdes/*export-fk* (:collection_id snippet) :model/Collection)
   :attrs (attrs snippet)})

(defn read-snippets
  "`{entity-id item}` of the snippets of `entity-ids`."
  [entity-ids]
  (let [snippets (content/in-chunks library-branching.db/snippets-by-entity-id (vec entity-ids))
        contents (portable/export-batch portable-content snippets)]
    (into {}
          (map (fn [{:keys [entity_id name]} {:keys [place attrs]}]
                 [entity_id (content/item :snippet entity_id name place attrs)])
               snippets
               contents))))

(defn current-snippet
  "The content of the in-scope snippet `id`, after a lock on its row, or nil."
  [id]
  (library-branching.db/lock-snippet id)
  (when (scope/in-scope? :snippet id)
    (get (read-snippets [id]) id)))

(defn- columns
  "The snippet columns of the attributes `ks` of `attrs`, an absent one at its default, through the imports of the
  serdes spec of NativeQuerySnippet. The content imports with the template tags of `attrs`: a card tag can rename it."
  [attrs ks]
  (let [transforms (:transform (serdes/make-spec "NativeQuerySnippet" {}))
        value      #(content/attr-value format.snippet/spec attrs %)]
    (into {}
          (map (fn [k]
                 (let [v                                   (value k)
                       {:keys [import import-with-context]} (get transforms k)]
                   [k (cond
                        (nil? v)            v
                        import-with-context (import-with-context {:template_tags (value :template_tags)} k v)
                        import              (import v)
                        :else               v)])))
          ks)))

(defn write-snippet!
  "Makes the content of snippet `id` equal to `item`, by the contract of `instance/write!`. Metabase computes the
  template tags of a snippet from its content on each save, so the content and the tags are written together."
  [id {:keys [name place attrs] :as item}]
  (content/check-item! :snippet id item)
  (let [row    (library-branching.db/lock-snippet id)
        ;; Every snippet is in the snippets namespace, a root namespace: a snippet row is always in the Library tree.
        parent (tree/place-collection id place)]
    (if-not row
      (library-branching.db/insert-snippet!
       (merge {:entity_id     id
               :name          name
               :collection_id (:id parent)
               :creator_id    (or api/*current-user-id* config/internal-mb-user-id)}
              (columns attrs (keys (:attrs format.snippet/spec)))))
      (let [old     (get (read-snippets [id]) id)
            changed (content/changed-attrs format.snippet/spec (:attrs old) attrs)
            changes (cond-> (columns attrs (cond-> changed
                                             (seq (filter #{:content :template_tags} changed))
                                             (conj :content :template_tags)))
                      (not= name (:name old))                  (assoc :name name)
                      (not= (:id parent) (:collection_id row)) (assoc :collection_id (:id parent))
                      (:archived row)                          (assoc :archived false))]
        (when (seq changes)
          (library-branching.db/update-snippet! (:id row) changes))))
    nil))

(defn trash-snippet!
  "Moves snippet `id` to the trash."
  [id]
  (when-let [row (library-branching.db/lock-snippet id)]
    (when-not (:archived row)
      (library-branching.db/update-snippet! (:id row) {:archived true}))
    nil))

(defn stub-snippet
  "Snippet `content` of identity `id` without the template tags that hold one of the references `refs`. Its text still
  names them; Metabase keeps such a tag with no target until the target exists."
  [id content refs]
  (let [attrs (->> (update (:attrs content) :template_tags
                           (fn [tags]
                             (into {} (remove (fn [[_ tag]] (seq (set/intersection refs (format.portable/refs tag))))) tags)))
                   (content/attrs format.snippet/spec))]
    (assoc content :attrs attrs :refs (format.kinds/refs :snippet id attrs))))

(def kind-store
  "The `KindStore` of snippets."
  (reify
    instance/Stub
    (stub [_ id content refs] (stub-snippet id content refs))

    instance/KindStore
    (read-all [_ ids] (read-snippets ids))
    (read-models [_] #{})
    (current [_ id] (current-snippet id))
    (write! [_ id item] (library-branching.db/do-in-transaction #(write-snippet! id item)))
    (trash! [_ id] (library-branching.db/do-in-transaction #(trash-snippet! id)))))
