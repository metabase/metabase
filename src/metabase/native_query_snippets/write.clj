(ns metabase.native-query-snippets.write
  "The write functions of NativeQuerySnippets, through which every writer creates, updates and deletes them."
  (:require
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.db :as native-query-snippets.db]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- snippet-tag?
  "Whether `tag` is a reference to a snippet."
  [tag]
  (= (:type tag) :snippet))

(defn- referenced-snippet-ids
  "The ids of the snippets the content of `snippet` refers to as `{{snippet: <name>}}`, by name."
  [snippet]
  (let [names (into #{}
                    (comp (filter snippet-tag?)
                          (map :snippet-name))
                    (lib/recognize-template-tags (:content snippet)))]
    (if (seq names)
      (native-query-snippets.db/snippet-ids-by-names (vec names))
      {})))

(defn derived-template-tags
  "The template tags of `snippet` for its content, with a reference to a snippet given that snippet's id, and otherwise
  the id of the same reference in the old tags, so that references survive the rename of their target, or none when
  there was none; for the insert hook and `update-snippet!`."
  [{old-tags :template_tags :as snippet}]
  (let [name->id      (referenced-snippet-ids snippet)
        name->old-tag (into {} (comp (map val)
                                     (filter snippet-tag?)
                                     (map (juxt :snippet-name identity)))
                            old-tags)
        new-tags      (into {}
                            (map (juxt :name identity))
                            (lib/recognize-template-tags (:content snippet)))
        set-snippet-id (fn [{:keys [snippet-name] :as tag}]
                         (if-let [snippet-id (get name->id snippet-name)]
                           (assoc tag :snippet-id snippet-id)
                           (or (name->old-tag snippet-name) tag)))]
    (update-vals new-tags (fn [tag]
                            (cond-> tag
                              (get-in old-tags [(:name tag) :id])
                              (assoc :id (get-in old-tags [(:name tag) :id]))
                              (snippet-tag? tag)
                              (set-snippet-id))))))

(defn- changed
  "The columns of `changes` whose values differ from those of `snippet`."
  [snippet changes]
  (into {} (remove (fn [[k v]] (= v (get snippet k)))) changes))

(defn- check-changes
  "Throws unless `changes` over `snippet`, which `updated` is the result of, are an update a snippet allows."
  [updated changes]
  (when (contains? changes :collection_id)
    (collection/check-collection-for :model/NativeQuerySnippet updated))
  (when (contains? changes :creator_id)
    (throw (ex-info (tru "You cannot change the creator of a snippet.") {:status-code 400}))))

(defn- derived-columns
  "The columns that follow `changes` over `updated`, the snippet as the update leaves it: the cause of an archive and
  the tags of its content."
  [updated changes]
  (cond-> {}
    (contains? changes :archived) (assoc :archived_directly
                                         (mi/archived-directly updated #(collection/archived? (:collection_id updated))))
    (:content updated)            (assoc :template_tags (derived-template-tags updated))))

(mu/defn create-snippet!
  "Insert `snippet`, whose after-insert hook publishes its create event, returning the inserted NativeQuerySnippet; for
  the REST API."
  [snippet :- ::native-query-snippets.schema/native-query-snippet.create]
  (events/with-batched-events
    (native-query-snippets.db/insert-snippet! snippet)))

(defn- final-changes
  "The columns of `changes` and those that follow them that update `snippet`, nil when they change nothing."
  [snippet changes]
  (let [requested (changed snippet changes)
        updated   (merge (t2/instance :model/NativeQuerySnippet snippet) requested)]
    (when (seq requested)
      (check-changes updated requested))
    (let [final (changed snippet (merge requested (derived-columns updated requested)))]
      (when (seq final)
        (assoc final :updated_at (mi/now))))))

(mu/defn update-snippets! :- :int
  "Apply `changes` to `snippets`, NativeQuerySnippets the caller already loaded, in one statement for those that the
  changes update alike, and publish their update events, returning the number of snippets updated, which includes the
  update of the template tags that their content gives even when `changes` change nothing; for the archive and restore
  of a Collection."
  [snippets :- [:sequential :map]
   changes  :- ::native-query-snippets.schema/native-query-snippet.update
   opts     :- ::native-query-snippets.schema/write-opts]
  (let [updates (into [] (keep (fn [snippet] (when-let [final (final-changes snippet changes)] [snippet final]))) snippets)]
    (when (seq updates)
      (events/with-event-context (select-keys opts [:archived-with])
        (events/with-batched-events
          (doseq [[final group] (group-by second updates)]
            (native-query-snippets.db/update-snippets! (mapv (comp :id first) group) final)
            (doseq [[snippet _] group]
              (events/updated! :model/NativeQuerySnippet (merge snippet final) snippet))))))
    (count updates)))

(mu/defn update-snippet! :- :int
  "Apply `changes` to `snippet-or-id`, a NativeQuerySnippet the caller already loaded or the id of one, and publish its
  update event, returning the number of snippets updated; for the REST API, remote sync and the SerDes import."
  [snippet-or-id :- [:or ::lib.schema.id/native-query-snippet :map]
   changes       :- ::native-query-snippets.schema/native-query-snippet.update
   opts          :- ::native-query-snippets.schema/write-opts]
  (let [snippet (if (map? snippet-or-id) snippet-or-id (native-query-snippets.db/snippet snippet-or-id))]
    (if snippet
      (update-snippets! [snippet] changes opts)
      0)))

(mu/defn delete-snippets! :- :int
  "Delete the NativeQuerySnippets with `ids` and publish their delete events, returning the number deleted; for the
  delete of their Collection, remote sync and the SerDes import."
  [ids   :- [:maybe [:sequential ::lib.schema.id/native-query-snippet]]
   _opts :- ::native-query-snippets.schema/write-opts]
  (let [snippets (when (seq ids) (native-query-snippets.db/snippets ids))]
    (if (empty? snippets)
      0
      (events/with-batched-events
        (events/deleting! :model/NativeQuerySnippet snippets
                          #(native-query-snippets.db/delete-snippets! (mapv :id snippets)))))))

(mu/defn delete-snippet! :- :int
  "Delete the NativeQuerySnippet with `id` and publish its delete event, returning the number deleted."
  [id   :- ::lib.schema.id/native-query-snippet
   opts :- ::native-query-snippets.schema/write-opts]
  (delete-snippets! [id] opts))

(defmethod mi/write-fns :model/NativeQuerySnippet
  [_model]
  {:update!     update-snippet!
   :update-all! update-snippets!
   :delete!     delete-snippets!})
