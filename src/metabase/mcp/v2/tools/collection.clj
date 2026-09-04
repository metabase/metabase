(ns metabase.mcp.v2.tools.collection
  "The v2 MCP `collection_write` tool: create, rename, move, archive, and restore collections.
   Both methods delegate to the shared domain fns the REST endpoints use
   ([[metabase.collections.core/create-collection!]] and
   [[metabase.collections.core/update-collection!]]), so parent write-checks, authority-level
   gating, parent inheritance, descendant path rewriting, and the event pair are inherited
   rather than reimplemented. The tool's own work is id resolution behind read checks,
   method-appropriateness checks, and the write echo."
  (:require
   [metabase.channel.urls :as channel.urls]
   [metabase.collections.core :as collections]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.mcp.v2.resolve :as v2.resolve]
   [metabase.mcp.v2.write :as v2.write]
   [metabase.metabot.scope :as metabot.scope]))

(set! *warn-on-reflection* true)

(defn- write-result
  "The created/updated collection echoed to the caller: the concise read projection — so the echo
   and a concise get_content read carry the same fields by construction — plus `:entity_id` (a
   portable id to update by), `:url` (where the collection lives in the app), and the two write
   args the concise projection omits, `:authority_level` and `:namespace`, so every field this
   tool accepts is confirmed back rather than silently dropped."
  [collection]
  ;; The :collection projection is registered by metabase.mcp.v2.projections itself, which this ns
  ;; requires — so the registry is populated before any tool dispatch reaches here.
  (assoc (projections/project :collection :concise collection)
         :entity_id (:entity_id collection)
         :url (common/frontend-url (channel.urls/collection-path (:id collection)))
         :authority_level (:authority_level collection)
         :namespace (:namespace collection)))

(defn- check-method-args!
  "Reject arguments that don't apply to the dispatched method, so a caller never believes an
   ignored field took effect."
  [method args]
  (case method
    :create (doseq [k [:id :archived]]
              (when (contains? args k)
                (common/throw-teaching-error
                 (format "`%s` applies to method \"update\" only — remove it from this create call." (name k)))))
    :update (do
              (when (contains? args :namespace)
                (common/throw-teaching-error
                 (str "`namespace` applies to method \"create\" only — a collection cannot move between "
                      "namespaces, which are independent hierarchies.")))
              (when (and (true? (:archived args)) (contains? args :parent_id))
                (common/throw-teaching-error
                 (str "`archived: true` and `parent_id` can't be combined — archiving moves the collection "
                      "to the trash, so the parent_id move never happens. Move first, then archive; or "
                      "archive now and pass `parent_id` on a later `archived: false` restore call."))))))

(defn- resolve-existing
  "Resolve an update's `id` (numeric or entity_id) to the collection behind its read check.
   \"Doesn't exist\" and \"exists but not readable\" collapse into the same not-found error, so
   the response never leaks existence across the permission boundary. `update-collection!` still
   runs its own write check."
  [id-or-eid]
  (v2.resolve/resolve-and-read :model/Collection id-or-eid))

(defn- create!
  [{:keys [description parent_id authority_level], coll-name :name, coll-namespace :namespace, :as args}]
  (check-method-args! :create args)
  ;; A namespaced collection ("snippets") is its own hierarchy, and personal collections only
  ;; exist in the default one — so only a normal collection can default into the caller's.
  (let [parent-id (if coll-namespace
                    (v2.resolve/resolve-collection-id parent_id)
                    (v2.resolve/resolve-collection-id-or-personal parent_id))]
    (write-result
     (collections/create-collection!
      (cond-> {:name coll-name}
        description     (assoc :description description)
        parent-id       (assoc :parent_id parent-id)
        coll-namespace  (assoc :namespace coll-namespace)
        authority_level (assoc :authority_level authority_level))))))

(defn- update!
  [id {:keys [description parent_id archived authority_level], coll-name :name, :as args}]
  (check-method-args! :update args)
  (let [collection (resolve-existing id)]
    (write-result
     (collections/update-collection!
      (:id collection)
      (cond-> {}
        (contains? args :name)            (assoc :name coll-name)
        (contains? args :description)     (assoc :description description)
        (contains? args :parent_id)       (assoc :parent_id (v2.resolve/resolve-collection-id parent_id))
        (contains? args :archived)        (assoc :archived (boolean archived))
        (contains? args :authority_level) (assoc :authority_level authority_level))))))

(def ^:private collection-write-args-schema
  [:map {:closed true}
   [:method
    [:enum {:description (str "\"create\" makes a new collection (requires `name`); \"update\" edits the one named "
                              "by `id`.")}
     "create" "update"]]
   [:id {:optional true}
    [:maybe [:or
             [:int {:description "Numeric id of the collection to update."}]
             [:string {:description "21-character entity_id of the collection to update."}]]]]
   [:name {:optional true}
    [:maybe [:string {:min 1 :description "Required on create; editable on update: display name of the collection."}]]]
   [:description {:optional true}
    [:maybe [:string {:min 1 :description (str "Optional human-readable description. To remove one, name it in "
                                               "`clear` — `clear: [\"description\"]`.")}]]]
   [:parent_id {:optional true}
    [:maybe [:or {:description (str "The collection to nest under (create) or move into (update). Numeric id, "
                                    "21-character entity_id, or \"root\" for the top level. Omitted on create means "
                                    "your personal collection. You need write access to the parent.")}
             :int :string]]]
   [:clear {:optional true}
    [:maybe [:sequential [:enum {:description "Update only: property names to unset (description, authority_level). Needed because a null cannot say \"clear this\" — strict clients fill every unset property with null, so nulls are stripped at the boundary."}
                          "description" "authority_level"]]]]
   [:archived {:optional true}
    [:maybe [:boolean {:description (str "Update only: true moves the collection and its contents to the trash, false "
                                         "restores them. Archiving is the only removal path — there is no hard "
                                         "delete. Omit to leave the collection's trashed state alone.")}]]]
   [:namespace {:optional true}
    [:maybe [:string {:min 1 :description (str "Create only: puts the collection in a separate hierarchy instead of "
                                               "the normal one. The only namespace in general use is \"snippets\" "
                                               "(SQL snippet folders). Omit for a normal collection.")}]]]
   [:authority_level {:optional true}
    [:maybe [:enum {:description (str "Marks the collection Official. Requires an admin on an instance with the "
                                      "Official Collections feature. To make a collection unofficial again, name "
                                      "it in `clear` — `clear: [\"authority_level\"]`.")}
             "official"]]]])

(def ^:private collection-write-entry
  {:create-required [:name]
   :clearable       #{:description :authority_level}})

(registry/deftool collection-write
  "Create, rename, move, archive, or restore a collection — the folders that hold questions, dashboards, models, and
  documents. method: \"create\" requires name and accepts description, parent_id, namespace, and authority_level;
  method: \"update\" requires id and accepts name, description, parent_id, archived, and authority_level. parent_id
  nests a new collection or moves an existing one: pass a numeric id, a 21-character entity_id, or \"root\" for the top
  level; omitting it on create means your personal collection (the root collection for a namespaced one), and omitting
  it on update leaves the collection where it is.
  You need write access to the parent. archived: true moves the collection and everything in it to the trash, false
  restores it — there is no hard delete, and omitting archived leaves the trashed state alone. namespace is create-only
  (\"snippets\" for SQL snippet folders); collections cannot move between namespaces. authority_level \"official\"
  marks the collection Official and needs an admin on an instance with that feature. description and authority_level
  can be set, rewritten, and cleared — to erase one, name it in clear (clear: [\"description\"]); sending null does
  not work, because unset properties are stripped before the tool sees them. Personal collections
  themselves cannot be created or moved, but you can nest collections inside one by passing its id as parent_id.
  Returns the resulting collection, including authority_level and namespace, so no follow-up read is needed."
  {:name        "collection_write"
   :scope       metabot.scope/agent-content-write
   ;; `archived: true` trashes the collection and everything under it, so this is not the
   ;; additive-only update `destructiveHint false` would assert.
   :annotations {:readOnlyHint false :destructiveHint true}
   :args        collection-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [[op a b] (v2.write/dispatch-write collection-write-entry args)
        payload  (v2.write/readback token-scopes [metabot.scope/agent-content-read]
                                    (case op
                                      :create (create! a)
                                      :update (update! a b))
                                    nil)]
    ;; text-only, matching the stack convention (see common/success-content): the write echo has no
    ;; concrete programmatic consumer, so it doesn't ride structuredContent.
    (common/success-content payload)))
