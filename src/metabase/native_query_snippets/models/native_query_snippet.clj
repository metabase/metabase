(ns metabase.native-query-snippets.models.native-query-snippet
  (:require
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
   [metabase.util.events :as u.events]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
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
    (cond-> snippet
      (and (contains? changes :archived) (not (contains? changes :archived_directly)))
      (assoc :archived_directly (native-query-snippets.db/archived-directly-clause changes)))))

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

(defn- check-snippets
  "Throw a 400 unless each of `rows`, holding the `:collection_id` and `:archived` state a Snippet is about to have,
  satisfies these rules, checked for the first row that breaks one, with one read of the Collections:

  - its Collection is in the snippets namespace
  - its Collection is not archived, unless the snippet is"
  [rows]
  (collection/check-collections-for-model! :model/NativeQuerySnippet rows))

(defn- name->id
  "A map of the name of each snippet that the content of one of `snippets` refers to, to its id, read in one query."
  [snippets]
  (let [names (into #{} (mapcat referenced-snippet-names) snippets)]
    (if (seq names)
      (native-query-snippets.db/snippet-ids-by-names (vec names))
      {})))

(mr/def ::write-opts
  "The options of a write function of NativeQuerySnippets: who writes and the context of its events."
  [:maybe [:map {:closed true}
           [:writer {:optional true} [:enum :import]]
           [:context {:optional true} [:maybe :metabase.events.schema/context]]]])

(mu/defn create-snippets! :- [:sequential (ms/InstanceOf :model/NativeQuerySnippet)]
  "Insert the NativeQuerySnippet `rows` and return the inserted instances, each with the template tags of its content,
  in one transaction, publishing their create event. A snippet in a Collection that cannot hold it, or in an archived
  Collection unless it is archived, throws a 400. An import, `:writer :import` in `opts`, renames each with ` (copy)`
  suffixes until no other snippet holds its name."
  ([rows :- [:sequential ::native-query-snippets.schema/native-query-snippet.create]]
   (create-snippets! rows nil))
  ([rows :- [:sequential ::native-query-snippets.schema/native-query-snippet.create]
    opts :- ::write-opts]
   (if (empty? rows)
     []
     (t2/with-transaction [_conn]
       (let [rows (cond-> rows
                    (= :import (:writer opts)) (native-query-snippets.serialization/rename-to-free-names nil))]
         (check-snippets (map #(update % :archived boolean) rows))
         (let [ids      (name->id rows)
               snippets (native-query-snippets.db/insert-snippets! (mapv #(assoc % :template_tags (snippet-template-tags % ids)) rows))]
           (events/publish-event! :event/snippet-create (events/create-event snippets opts))
           snippets))))))

(defn- assoc-template-tags
  "`changes`, an update of the snippet `stored` that gives a `:content`, with the template tags of that content when they
  differ from the stored ones, and without the template tags it was given, `name-ids` being the ids of the snippets that
  the contents of the update name."
  [changes stored name-ids]
  (let [changes (dissoc changes :template_tags)]
    (if (and (contains? changes :content) (:content (merge stored changes)))
      (let [tags (snippet-template-tags (merge stored changes) name-ids)]
        (cond-> changes
          (not= tags (:template_tags stored)) (assoc :template_tags tags)))
      changes)))

(defn- check-update-content
  "Throw a 400 unless `changes` leave the content to one snippet:

  - a change of `:content` applies to one snippet"
  [ids changes]
  (when (and (contains? changes :content) (next ids))
    (throw (ex-info (tru "The content of more than one snippet cannot be changed at once.") {:status-code 400}))))

(defn- assoc-snippet-template-tags
  "`rows`, updates of the snippets `stored`, each with the template tags of its content, reading the snippets that the
  contents name once."
  [rows stored]
  (let [name-ids (name->id rows)]
    (mapv (fn [{:keys [id] :as row}]
            (assoc (assoc-template-tags (dissoc row :id) (get stored id) name-ids) :id id))
          rows)))

(defn- derive-archived-directly
  "`rows`, with the `archived_directly` that the write gave each of those that change `archived`, read from `updated`, the
  snippets by id after the write."
  [rows updated]
  (mapv (fn [{:keys [id] :as row}]
          (cond-> row
            (contains? row :archived) (assoc :archived_directly (:archived_directly (get updated id)))))
        rows))

(defn- write-snippet-updates!
  "Applies `rows`, each the `:id` of a snippet with the changes it gets, which may differ from row to row, in one
  transaction, and publishes one update event for all of them with the `:context` of `opts`."
  [rows opts]
  (let [stored (when (seq rows) (native-query-snippets.db/snippets-by-id (mapv :id rows)))
        rows   (filterv #(contains? stored (:id %)) rows)]
    (when (seq rows)
      (t2/with-transaction [_conn]
        (let [rows (assoc-snippet-template-tags rows stored)]
          (check-snippets (for [row rows
                                :when (contains? row :collection_id)]
                            (update (merge (get stored (:id row)) row) :archived boolean)))
          (doseq [[changes group] (group-by #(dissoc % :id) rows)]
            (native-query-snippets.db/update-snippets! (mapv :id group) changes))
          (let [updated (native-query-snippets.db/snippets-by-id (mapv :id rows))]
            (events/publish-event! :event/snippet-update
                                   (events/update-event stored (derive-archived-directly rows updated) (assoc opts :objects updated)))))))))

(mu/defn update-snippets! :- :nil
  "Applies `changes` to each NativeQuerySnippet of `ids`, publishing one update event with the `:context` of `opts`. A
  change of `archived` gives their `archived_directly`, a move into a Collection that cannot hold them throws, and a
  `:content` gives the template tags of it and is for one snippet only."
  [ids     :- [:sequential ::lib.schema.id/native-query-snippet]
   changes :- ::native-query-snippets.schema/native-query-snippet.changes
   opts    :- ::write-opts]
  (when (and (contains? changes :content) (next ids))
    (check-update-content (filterv (set (keys (native-query-snippets.db/snippets-by-id ids))) ids) changes))
  (write-snippet-updates! (mapv #(assoc changes :id %) ids) opts)
  nil)

(mu/defn update-snippets-for-import! :- :nil
  "Applies the columns of each of `rows`, an `:id` with its own values, in one pass over all of them, publishing one
  update event, as an import writes different values for each, renaming each with ` (copy)` suffixes until no other
  snippet, or earlier row, holds its name."
  [rows :- [:sequential ::native-query-snippets.schema/native-query-snippet.update]]
  (write-snippet-updates!
   (native-query-snippets.serialization/rename-to-free-names
    rows (native-query-snippets.db/snippets-by-id (mapv :id rows)))
   nil)
  nil)

(mu/defn delete-snippets!
  "Delete the NativeQuerySnippets with `ids`, in one statement, publishing their delete event right before it."
  [ids :- [:sequential ::lib.schema.id/native-query-snippet]]
  (when (seq ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/snippet-delete
                             {:changes (u.events/delete-changes (vec (vals (native-query-snippets.db/snippets-by-id ids))))
                            :user-id (mi/current-user-id)})
      (native-query-snippets.db/delete-snippets! ids))))

(defmethod collection/archive-in-collections! :model/NativeQuerySnippet
  [_model collection-ids opts]
  (update-snippets! (mapv :id (native-query-snippets.db/unarchived-snippets-in-collections (vec collection-ids)))
                    {:archived true :archived_directly false}
                    opts))

(defmethod collection/restore-in-collections! :model/NativeQuerySnippet
  [_model collection-ids opts]
  (update-snippets! (mapv :id (native-query-snippets.db/restorable-snippets-in-collections (vec collection-ids)))
                    {:archived false :archived_directly false}
                    opts))

(defmethod collection/delete-in-collections! :model/NativeQuerySnippet
  [_model collection-ids _opts]
  (when (seq collection-ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/snippet-delete
                             {:changes (u.events/delete-changes (native-query-snippets.db/snippets-in-collections (vec collection-ids)))
                            :user-id (mi/current-user-id)})
      (native-query-snippets.db/delete-snippets-in-collections! (vec collection-ids)))))

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
   :insert!             #(create-snippets! % {:writer :import})
   :update!             update-snippets-for-import!
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
