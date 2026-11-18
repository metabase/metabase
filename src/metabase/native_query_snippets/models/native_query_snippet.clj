(ns metabase.native-query-snippets.models.native-query-snippet
  (:require
   [metabase.api.common :as api]
   [metabase.change-log.core :as change-log]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.native-query-snippets.db :as native-query-snippets.db]
   [metabase.native-query-snippets.models.native-query-snippet.permissions :as snippet.perms]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.native-query-snippets.serialization :as native-query-snippets.serialization]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/NativeQuerySnippet [_model] :native_query_snippet)

(doto :model/NativeQuerySnippet
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id)
  (derive :hook/events))

(defmethod events/spec :model/NativeQuerySnippet
  [_model]
  {:create :event/snippet-create
   :update :event/snippet-update
   :delete :event/snippet-delete})

(defmethod change-log/spec :model/NativeQuerySnippet [_model]
  {:track [:name :description :content :creator_id :archived :collection_id :entity_id :template_tags
           :archived_directly]
   :skip  []})

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

(t2/define-before-insert :model/NativeQuerySnippet
  [snippet]
  (collection/check-collection-for :model/NativeQuerySnippet snippet)
  (assoc snippet :template_tags (snippet-template-tags snippet (referenced-snippet-ids snippet))))

(t2/define-before-update :model/NativeQuerySnippet
  [snippet]
  (let [changes (t2/changes snippet)]
    (when (contains? changes :collection_id)
      (collection/check-collection-for :model/NativeQuerySnippet snippet))
    (when (contains? changes :creator_id)
      (throw (ex-info (tru "You cannot change the creator of a snippet.") {:status-code 400})))
    (cond-> snippet
      (contains? changes :archived) (assoc :archived_directly (mi/archived-directly snippet #(collection/archived? (:collection_id snippet))))
      (:content snippet)            (assoc :template_tags (snippet-template-tags snippet (referenced-snippet-ids snippet))))))

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

;;; ---------------------------------------------------- Serialization ----------------------------------------------------

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
   :before-load         native-query-snippets.serialization/before-load})

(defmethod remote-sync/spec :model/NativeQuerySnippet
  [_model]
  {:synced-items         native-query-snippets.db/synced-snippet-items
   :synced-filter-clause native-query-snippets.db/synced-snippets-clause})
