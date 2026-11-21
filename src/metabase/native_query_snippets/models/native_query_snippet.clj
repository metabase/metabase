(ns metabase.native-query-snippets.models.native-query-snippet
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.change-log.core :as change-log]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.collection-items :as native-query-snippets.collection-items]
   [metabase.native-query-snippets.db :as native-query-snippets.db]
   [metabase.native-query-snippets.dependencies :as native-query-snippets.dependencies]
   [metabase.native-query-snippets.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.native-query-snippets.serialization :as native-query-snippets.serialization]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/NativeQuerySnippet [_model] :native_query_snippet)

(doto :model/NativeQuerySnippet
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

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

;;; ------------------------------------------------------ Hooks -----------------------------------------------------

(defn valid-name?
  "Whether `snippet-name` is a string that includes no \"}\" and does not start with whitespace."
  [snippet-name]
  (and (string? snippet-name)
       (not (re-find #"^\s+" snippet-name))
       (not (re-find #"}" snippet-name))))

(def ^:private name-error
  "The message for a snippet name `valid-name?` refuses."
  (deferred-tru "snippet names cannot include ''}'' or start with spaces"))

(def NativeQuerySnippetName
  "Schema checking that snippet names do not include \"}\" or start with spaces."
  (mu/with-api-error-message
   [:fn {:json-schema {:type "string"}} valid-name?]
   name-error))

(defn- snippet-tag?
  "Whether `tag` is a reference to a snippet."
  [tag]
  (= (:type tag) :snippet))

(defn- referenced-snippet-names
  "The names of the snippets the content of `snippet` refers to as `{{snippet: <name>}}`."
  [snippet]
  (into #{}
        (comp (filter snippet-tag?)
              (map :snippet-name))
        (lib/recognize-template-tags (:content snippet))))

(defn- snippet-template-tags
  "The template tags of `snippet` for its content, with a reference to a snippet named in `name->id` given that
  snippet's id, and otherwise the id of the same reference in the old tags, so that references survive the rename of
  their target, or none when there was none."
  [{old-tags :template_tags :as snippet} name->id]
  (let [name->old-tag (into {} (comp (map val)
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

(t2/define-before-update :model/NativeQuerySnippet
  [snippet]
  (let [changes (t2/changes snippet)]
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a snippet.") {:status-code 400})))
    snippet))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- check-permission-keys
  "Throws unless `snippet` has the columns its `:can_read` and `:can_write` hydrations read."
  [snippet]
  (api/check-500 (contains? snippet :id) "No :id is set for a NativeQuerySnippet.")
  (api/check-500 (contains? snippet :collection_id) "No :collection_id is set for a NativeQuerySnippet."))

(methodical/defmethod t2/batched-hydrate [:model/NativeQuerySnippet :can_read]
  "Whether the current user can read each of `snippets`, answered together."
  [_model _k snippets]
  (run! #(when % (check-permission-keys %)) snippets)
  (let [readable (snippet.perms/permitted-snippet-ids (remove nil? snippets) :read)]
    (for [snippet snippets]
      (when snippet
        (vary-meta snippet assoc :can_read (contains? readable (:id snippet)))))))

(methodical/defmethod t2/batched-hydrate [:model/NativeQuerySnippet :can_write]
  "Whether the current user can write each of `snippets`, none on an instance remote sync keeps read-only, answered
  together."
  [_model _k snippets]
  (run! #(when % (check-permission-keys %)) snippets)
  (let [writable (if (remote-sync/read-only?)
                   #{}
                   (snippet.perms/permitted-snippet-ids (remove nil? snippets) :write))]
    (for [snippet snippets]
      (when snippet
        (assoc snippet :can_write (contains? writable (:id snippet)))))))

(defmethod mi/can-create? :model/NativeQuerySnippet
  [model snippet]
  (and (snippet.perms/can-create? model snippet)
       (not (remote-sync/read-only?))))

(defenterprise sandboxes-allow-snippet-update?
  "Whether sandboxing lets the current user apply `changes` to `snippet`, which OSS always does."
  metabase-enterprise.sandbox.models.sandbox
  [_snippet _changes]
  true)

(defenterprise sandboxes-allow-snippets-update?
  "Whether sandboxing lets the current user apply `changes` to every one of `snippets`, which OSS always does."
  metabase-enterprise.sandbox.models.sandbox
  [_snippets _changes]
  true)

(defn- unsynced-change?
  "Whether `changes` touch no synced column of `snippet`, which a read-only instance still accepts from a user the
  other rules of the update allow."
  [snippet changes]
  (not (remote-sync/synced-changes? :model/NativeQuerySnippet snippet changes)))

(defn- can-update-apart-from-sandboxes?
  "Whether the current user may apply `changes` to `snippet` as far as every rule but sandboxing goes."
  [snippet changes]
  (and (or (mi/can-write? snippet)
           (unsynced-change? snippet changes))
       (snippet.perms/can-update? snippet changes)))

(defmethod mi/can-update? :model/NativeQuerySnippet
  [snippet changes]
  (and (can-update-apart-from-sandboxes? snippet changes)
       (sandboxes-allow-snippet-update? snippet changes)))

(defmethod mi/can-update-all? :model/NativeQuerySnippet
  [_model snippets changes]
  (and (every? #(can-update-apart-from-sandboxes? % changes) snippets)
       (sandboxes-allow-snippets-update? snippets changes)))

(defmethod mi/can-update-followers? :model/NativeQuerySnippet
  [_model snippets changes]
  (sandboxes-allow-snippets-update? snippets changes))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defn- check-collections
  "Throws unless the Collection of each of `rows`, if any, can hold a NativeQuerySnippet and is not archived unless the
  row is, reading the Collections once."
  [rows]
  (let [ids         (into [] (comp (keep :collection_id) (distinct)) rows)
        collections (when (seq ids) (native-query-snippets.db/collections-for-content-checks ids))]
    (doseq [{:keys [collection_id archived]} rows
            :when                            collection_id
            :let                             [parent (or (get collections collection_id)
                                                         (collection/content-parent collection_id))]]
      (collection/check-allowed-content :model/NativeQuerySnippet parent)
      (collection/check-collection-namespace :model/NativeQuerySnippet parent)
      (collection/check-collection-not-archived archived parent))))

(defn- name->id
  "A map of the name of each snippet that the content of one of `snippets` refers to, to its id, read in one query."
  [snippets]
  (let [names (into #{} (mapcat referenced-snippet-names) snippets)]
    (if (seq names)
      (native-query-snippets.db/snippet-ids-by-names (vec names))
      {})))

(mu/defn create-snippets! :- [:sequential (ms/InstanceOf :model/NativeQuerySnippet)]
  "Insert the NativeQuerySnippet `rows` and return the inserted instances, each with the template tags of its content,
  in one transaction, publishing their create event. A snippet in a Collection that cannot hold it, or in an archived
  Collection unless it is archived, throws."
  [rows :- [:sequential ::native-query-snippets.schema/native-query-snippet.create]]
  (if (empty? rows)
    []
    (t2/with-transaction [_conn]
      (check-collections rows)
      (let [ids      (name->id rows)
            snippets (vec (native-query-snippets.db/insert-snippets!
                           (mapv #(assoc % :template_tags (snippet-template-tags % ids)) rows)))]
        (events/publish-lifecycle! [(events/created :event/snippet-create snippets)])
        snippets))))

(mu/defn create-snippet! :- (ms/InstanceOf :model/NativeQuerySnippet)
  "Insert the NativeQuerySnippet `row` and return the inserted instance, as [[create-snippets!]] does."
  [row :- ::native-query-snippets.schema/native-query-snippet.create]
  (first (create-snippets! [row])))

(defn- with-archived-directly
  "`rows`, updates of snippets, each that changes `:archived` with the `archived_directly` it gives, the Collections
  read once."
  [rows stored]
  (let [ids   (into [] (comp (map #(:collection_id (merge (get stored (:id %)) %))) (filter some?) (distinct)) rows)
        flags (when (seq ids) (native-query-snippets.db/collections-for-content-checks ids))]
    (mapv (fn [{:keys [id archived] :as row}]
            (cond-> row
              (and (some? archived) (not (contains? row :archived_directly)))
              (assoc :archived_directly
                     (boolean (and archived
                                   (not (:archived (get flags (:collection_id (merge (get stored id) row))))))))))
          rows)))

(defn- with-template-tags
  "`rows`, updates of snippets, each with the template tags of its content when they differ from the stored ones, and
  without the template tags it was given."
  [rows stored]
  (let [merged (mapv #(merge (get stored (:id %)) %) rows)
        ids    (name->id merged)]
    (mapv (fn [row snippet]
            (let [tags (when (:content snippet) (snippet-template-tags snippet ids))
                  row  (dissoc row :template_tags)]
              (cond-> row
                (and tags (not= tags (:template_tags (get stored (:id row))))) (assoc :template_tags tags))))
          rows merged)))

(defn- update-event
  "The update event of the snippets that the changes in `rows` change, `stored` holding their rows as they were."
  [stored rows]
  (let [pairs (into []
                    (keep (fn [row]
                            (let [previous (get stored (:id row))
                                  object   (events/updated-row previous (dissoc row :id))]
                              (when (not= (into {} previous) (into {} object))
                                [previous object]))))
                    rows)]
    (events/updated :event/snippet-update (mapv first pairs) (mapv second pairs))))

(mu/defn update-snippets! :- [:sequential ::native-query-snippets.schema/native-query-snippet.row]
  "Apply the changes in each of `rows`, the id of a NativeQuerySnippet and the columns to change, with one statement
  per distinct set of changes, in one transaction, publishing their update event with `context`. Each snippet gets the
  template tags of its content, and a move into a Collection that cannot hold it throws. Returns `rows`."
  ([rows :- [:sequential ::native-query-snippets.schema/native-query-snippet.row]]
   (update-snippets! rows nil))
  ([rows    :- [:sequential ::native-query-snippets.schema/native-query-snippet.row]
    context :- [:maybe :metabase.events.schema/context]]
   (if (empty? rows)
     []
     (t2/with-transaction [_conn]
       (let [stored (native-query-snippets.db/snippets-by-id (mapv :id rows))
             rows*  (-> rows (with-archived-directly stored) (with-template-tags stored))]
         (check-collections (map #(merge (get stored (:id %)) %) (filter #(contains? % :collection_id) rows*)))
         (doseq [[changes group] (group-by #(dissoc % :id) rows*)]
           (when (seq changes)
             (native-query-snippets.db/update-snippets! (mapv :id group) changes)))
         (events/publish-lifecycle! [(update-event stored (filterv #(contains? stored (:id %)) rows*))]
                                    {:context context})
         (vec rows))))))

(mu/defn update-snippet!
  "Apply `changes` to the NativeQuerySnippet with `id`, as [[update-snippets!]] does."
  [id      :- ::lib.schema.id/native-query-snippet
   changes :- ::native-query-snippets.schema/native-query-snippet.update]
  (update-snippets! [(assoc changes :id id)])
  nil)

(defn- delete-snippet-rows!
  "Delete the NativeQuerySnippets `rows` with `delete!`, publishing their delete event."
  [rows delete!]
  (when (seq rows)
    (t2/with-transaction [_conn]
      (let [event (events/deleted :event/snippet-delete :model/NativeQuerySnippet rows)]
        (delete!)
        (events/publish-lifecycle! [event])))))

(mu/defn delete-snippets!
  "Delete the NativeQuerySnippets with `ids`, in one statement, publishing their delete event."
  [ids :- [:sequential ::lib.schema.id/native-query-snippet]]
  (when (seq ids)
    (let [rows (vals (native-query-snippets.db/snippets-by-id ids))]
      (delete-snippet-rows! (vec rows) #(native-query-snippets.db/delete-snippets! (mapv :id rows))))))

(mu/defn archive-snippets-in-collections!
  "Archive the NativeQuerySnippets in the Collections with `collection-ids`, which an archive of their Collection
  carries, in one statement, publishing their update event. They are not archived on their own."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (when (seq collection-ids)
    (t2/with-transaction [_conn]
      (when-let [rows (not-empty (native-query-snippets.db/unarchived-snippets-in-collections collection-ids))]
        (native-query-snippets.db/update-snippets! (mapv :id rows) {:archived true :archived_directly false})
        (events/publish-lifecycle!
         [(update-event (m/index-by :id rows)
                        (mapv (fn [row] {:id (:id row) :archived true :archived_directly false}) rows))])))))

(mu/defn restore-snippets-in-collections!
  "Restore the NativeQuerySnippets in the Collections with `collection-ids` that an archive of their Collection
  carried, in one statement, publishing their update event."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (when (seq collection-ids)
    (t2/with-transaction [_conn]
      (when-let [rows (not-empty (native-query-snippets.db/restorable-snippets-in-collections collection-ids))]
        (native-query-snippets.db/update-snippets! (mapv :id rows) {:archived false :archived_directly false})
        (events/publish-lifecycle!
         [(update-event (m/index-by :id rows)
                        (mapv (fn [row] {:id (:id row) :archived false :archived_directly false}) rows))])))))

(mu/defn delete-snippets-in-collections!
  "Delete the NativeQuerySnippets in the Collections with `collection-ids`, in one statement, publishing their delete
  event."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (when (seq collection-ids)
    (delete-snippet-rows! (native-query-snippets.db/snippets-in-collections collection-ids)
                          #(native-query-snippets.db/delete-snippets-in-collections! collection-ids))))

(mu/defn import-snippets! :- [:sequential (ms/InstanceOf :model/NativeQuerySnippet)]
  "Insert the NativeQuerySnippet `rows` an import loads as [[create-snippets!]] does, each renamed with ` (copy)`
  suffixes until no other snippet holds its name."
  [rows :- [:sequential ::native-query-snippets.schema/native-query-snippet.create]]
  (create-snippets! (native-query-snippets.serialization/with-free-names rows :entity_id)))

(mu/defn update-imported-snippets! :- [:sequential ::native-query-snippets.schema/native-query-snippet.row]
  "Update the NativeQuerySnippets an import loads as [[update-snippets!]] does, each renamed with ` (copy)` suffixes
  until no other snippet holds its name."
  [rows :- [:sequential ::native-query-snippets.schema/native-query-snippet.row]]
  (if (empty? rows)
    []
    (let [stored (native-query-snippets.db/snippets-by-id (mapv :id rows))]
      (update-snippets! (native-query-snippets.serialization/with-free-names
                          rows #(:entity_id (get stored (:id %))))))))

(defmethod collection/archive-in-collections! :model/NativeQuerySnippet
  [_model collection-ids]
  (archive-snippets-in-collections! (vec collection-ids)))

(defmethod collection/restore-in-collections! :model/NativeQuerySnippet
  [_model collection-ids]
  (restore-snippets-in-collections! (vec collection-ids)))

(defmethod collection/delete-in-collections! :model/NativeQuerySnippet
  [_model collection-ids]
  (delete-snippets-in-collections! (vec collection-ids)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/NativeQuerySnippet [_model]
  {:skip? false})

(defmethod change-log/spec :model/NativeQuerySnippet [_model]
  {:track [:name :description :content :creator_id :archived :collection_id :entity_id :template_tags
           :archived_directly]
   :skip  []})

(defmethod serialization/spec :model/NativeQuerySnippet [_]
  {:schema              ::native-query-snippets.schema/external-native-query-snippet
   :copy                [:archived :archived_directly :description :entity_id :name]
   :transform           {:collection_id (serialization/fk-transform :model/Collection)
                         :creator_id    serialization/user-transform
                         :content       native-query-snippets.serialization/content-transform
                         :template_tags native-query-snippets.serialization/template-tags-transform}
   :defaults            {:archived false, :archived_directly false}
   :storage-paths       native-query-snippets.serialization/storage-paths
   :import-dependencies native-query-snippets.serialization/import-dependencies
   :export-dependencies native-query-snippets.serialization/export-dependencies
   :insert!             import-snippets!
   :update!             update-imported-snippets!
   :delete!             delete-snippets!})

(defmethod remote-sync/spec :model/NativeQuerySnippet
  [_model]
  {:synced-items         native-query-snippets.db/synced-snippet-items
   :synced-filter-clause native-query-snippets.db/synced-snippets-clause})

(defmethod dependencies/spec :model/NativeQuerySnippet [_model]
  {:type     :snippet
   :inlined? true
   :items    native-query-snippets.db/dependency-snippet-items

   :dependencies native-query-snippets.dependencies/dependencies

   :dependency-columns #{:content :template_tags}
   :output-columns     #{:content :template_tags}})

(defmethod collection-items/spec :model/NativeQuerySnippet [_model]
  {"snippet" {:rank    6
              :items   native-query-snippets.db/collection-snippet-items
              :hydrate native-query-snippets.collection-items/hydrate}})

(defmethod eid-translation/spec :model/NativeQuerySnippet [_model]
  {:names [:snippet]})
