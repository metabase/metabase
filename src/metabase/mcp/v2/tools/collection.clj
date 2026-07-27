(ns metabase.mcp.v2.tools.collection
  "The v2 MCP `collection_write` tool: create, rename, move, archive, and restore collections.
   Both methods delegate to the shared domain fns the REST endpoints use
   ([[metabase.collections.create/create-collection!]] and
   [[metabase.collections.update/update-collection!]]), so parent write-checks, authority-level
   gating, parent inheritance, descendant path rewriting, and the event pair are inherited
   rather than reimplemented. The tool's own work is id resolution behind read checks,
   method-appropriateness checks, and the write echo."
  (:require
   [metabase.channel.urls :as channel.urls]
   [metabase.collections.core :as collections]
   [metabase.collections.update :as collections.update]
   [metabase.mcp.v2.common :as common]
   [metabase.mcp.v2.projections :as projections]
   [metabase.mcp.v2.registry :as registry]
   [metabase.metabot.scope :as metabot.scope]
   [metabase.models.interface :as mi]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- write-result
  "The created/updated collection echoed to the caller: the concise read projection — so the echo
   and a concise get_content read carry the same fields by construction — plus `:entity_id` (a
   portable id to update by) and `:url` (where the collection lives in the app)."
  [collection]
  ;; The :collection projection is registered by metabase.mcp.v2.projections itself, which this ns
  ;; requires — so the registry is populated before any tool dispatch reaches here.
  (assoc (projections/project :collection :concise collection)
         :entity_id (:entity_id collection)
         :url (common/frontend-url (channel.urls/collection-path (:id collection)))))

(defn- check-method-args!
  "Reject arguments that don't apply to the dispatched method, so a caller never believes an
   ignored field took effect."
  [method args]
  (case method
    :create (doseq [k [:id :archived]]
              (when (contains? args k)
                (common/throw-teaching-error
                 (format "`%s` applies to method \"update\" only — remove it from this create call." (name k)))))
    :update (when (contains? args :namespace)
              (common/throw-teaching-error
               (str "`namespace` applies to method \"create\" only — a collection cannot move between "
                    "namespaces, which are independent hierarchies.")))))

(defn- resolve-existing
  "Resolve an update's `id` (numeric or entity_id) to the collection behind its read check.
   \"Doesn't exist\" and \"exists but not readable\" collapse into the same not-found error, so
   the response never leaks existence across the permission boundary. `update-collection!` still
   runs its own write check."
  [id-or-eid]
  (common/resolve-and-read :model/Collection id-or-eid
                           (fn [id]
                             (when-let [collection (t2/select-one :model/Collection :id id)]
                               (when (mi/can-read? collection)
                                 collection)))))

(defn- create!
  [{:keys [name description parent_id authority_level], coll-namespace :namespace, :as args}]
  (check-method-args! :create args)
  (write-result
   (collections/create-collection!
    (cond-> {:name name}
      description                 (assoc :description description)
      (contains? args :parent_id) (assoc :parent_id (common/resolve-collection-id parent_id))
      coll-namespace              (assoc :namespace coll-namespace)
      authority_level             (assoc :authority_level authority_level)))))

(defn- update!
  [id {:keys [name description parent_id archived authority_level] :as args}]
  (check-method-args! :update args)
  (let [collection (resolve-existing id)]
    (write-result
     (collections.update/update-collection!
      (:id collection)
      (cond-> {}
        (contains? args :name)            (assoc :name name)
        (contains? args :description)     (assoc :description description)
        (contains? args :parent_id)       (assoc :parent_id (common/resolve-collection-id parent_id))
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
    [:maybe [:string {:min 1 :description "Create only (editable on update): display name of the collection."}]]]
   [:description {:optional true}
    [:maybe [:string {:min 1 :description "Optional human-readable description."}]]]
   [:parent_id {:optional true}
    [:maybe [:or {:description (str "The collection to nest under (create) or move into (update). Numeric id, "
                                    "21-character entity_id, or \"root\" for the top level. Omitted on create means "
                                    "the root collection. You need write access to the parent.")}
             :int :string]]]
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
                                      "Official Collections feature. Can be set but not cleared through this tool.")}
             "official"]]]])

(def ^:private collection-write-entry
  {:tool-name       "collection_write"
   :update-scope    metabot.scope/agent-collection-update
   :create-required [:name]})

(registry/deftool collection-write
  "Create, rename, move, archive, or restore a collection — the folders that hold questions, dashboards, models, and
  documents. method: \"create\" requires name and accepts description, parent_id, namespace, and authority_level;
  method: \"update\" requires id and accepts name, description, parent_id, archived, and authority_level. parent_id
  nests a new collection or moves an existing one: pass a numeric id, a 21-character entity_id, or \"root\" for the top
  level; omitting it on create means the root collection, and omitting it on update leaves the collection where it is.
  You need write access to the parent. archived: true moves the collection and everything in it to the trash, false
  restores it — there is no hard delete, and omitting archived leaves the trashed state alone. namespace is create-only
  (\"snippets\" for SQL snippet folders); collections cannot move between namespaces. authority_level \"official\"
  marks the collection Official and needs an admin on an instance with that feature. Personal collections themselves
  cannot be created or moved, but you can nest collections inside one by passing its id as parent_id."
  {:name         "collection_write"
   :scope        metabot.scope/agent-collection-create
   :update-scope metabot.scope/agent-collection-update
   :annotations  {:readOnlyHint false :destructiveHint false}
   :args         collection-write-args-schema}
  [args {:keys [token-scopes]}]
  (let [[op a b] (common/dispatch-write collection-write-entry token-scopes args)
        payload  (case op
                   :create (create! a)
                   :update (update! a b))]
    (common/success-content payload payload)))
