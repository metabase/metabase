(ns metabase-enterprise.workspaces.remapping
  "Workspaces v2: generic entity remapping, keyed off the current user.

   ## The model

   A workspace is an overlay over the computation/query graph. Nodes in the graph
   (cards, transforms, measures, segments, and the tables transforms produce) can
   be *shadowed* inside a workspace: a `workspace_remapping` row says \"whenever
   workspace W talks about entity (type, source-id), actually use (type,
   target-id)\".

   A user enters a workspace by setting `core_user.workspace_id` (via
   `POST /api/ee/workspace/:id/enter`). From then on the *normal* API endpoints
   and the QP transparently serve workspace copies under production ids:

     - Read/execute endpoints resolve route ids via
       [[metabase.workspaces.core/effective-entity-id]] (EE impl:
       [[effective-entity-id]]).
     - PUT endpoints call [[metabase.workspaces.core/ensure-workspace-copy!]]
       (EE impl: [[ensure-workspace-copy!]]) which clones the entity on first
       write (copy-on-write) and returns the copy's id.
     - The QP preprocess hook wraps the metadata provider with
       [[remapping-metadata-provider]] so every `:metadata/card` /
       `:metadata/transform` / `:metadata/measure` / `:metadata/segment` /
       `:metadata/table` read is served from the workspace copy — under the
       source id, so refs in saved queries keep working untouched.

   ## How each entity type is shadowed

   - **card / transform / measure / segment**: the target is a full model row
     (created the normal way). The MP returns the target's content with `:id`
     forced back to the source id.

   - **transform** targets additionally get their `:target` table renamed to a
     workspace-local name, and the production output table (when it exists as a
     `:model/Table` row) gets a `:table` remapping to an inactive placeholder row
     for the workspace output table.

   - **table**: shadows a transform's *output* table. We do NOT swap table ids —
     field ids belong to the source table and live all over saved queries. Instead
     the MP merges the target table's physical coordinates (`:schema`, `:name`)
     onto the source table's metadata, keeping the source `:id` and its fields.
     Compiled SQL then reads from the workspace output table while all field refs
     still resolve against source-table field metadata."
  (:require
   [metabase.api.common :as api]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.queries.core :as queries]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::entity-type [:enum :card :transform :measure :segment :table])

;;; ------------------------------------------ Workspace context ------------------------------------------

(def ^:dynamic *workspace-id*
  "Override for the current workspace id, or nil to derive it from the current
   user. Normally the workspace context comes from `core_user.workspace_id`
   ([[current-workspace-id]]); bind this to force a context in internal code and
   tests."
  nil)

(defmacro with-workspace
  "Execute `body` in the context of workspace `workspace-id`, regardless of the
   current user's `workspace_id`."
  [workspace-id & body]
  `(binding [*workspace-id* ~workspace-id]
     ~@body))

(defenterprise current-workspace-id
  "EE impl: the workspace the current request runs in — the [[*workspace-id*]]
   binding when set, otherwise the current user's `workspace_id` column.
   Nil when there is no current user or the user isn't in a workspace."
  :feature :workspaces
  []
  (or *workspace-id*
      (when api/*current-user-id*
        ;; PoC: one lookup per call; cache per-request before shipping.
        (t2/select-one-fn :workspace_id :model/User :id api/*current-user-id*))))

;;; ------------------------------------------ Remapping CRUD ------------------------------------------

(mu/defn remappings-for-workspace :- [:map-of ::entity-type [:map-of :int :int]]
  "All remappings for a workspace as `{entity-type {source-id target-id}}`.
   PoC: fetched per call; cache per-request/per-query-run before shipping."
  [workspace-id :- :int]
  (reduce (fn [acc {:keys [entity_type source_entity_id target_entity_id]}]
            (assoc-in acc [entity_type source_entity_id] target_entity_id))
          {}
          (t2/select :model/WorkspaceRemapping :workspace_id workspace-id)))

(mu/defn source->target :- [:maybe :int]
  "Target entity id shadowing `(entity-type, source-id)` in `workspace-id`, or nil."
  [workspace-id :- :int
   entity-type  :- ::entity-type
   source-id    :- :int]
  (t2/select-one-fn :target_entity_id :model/WorkspaceRemapping
                    :workspace_id workspace-id
                    :entity_type  entity-type
                    :source_entity_id source-id))

(mu/defn resolve-id :- :int
  "Resolve a source entity id to the id that should actually be used in
   `workspace-id`: the remap target when one exists, the source id itself otherwise."
  [workspace-id :- :int
   entity-type  :- ::entity-type
   source-id    :- :int]
  (or (source->target workspace-id entity-type source-id) source-id))

(mu/defn add-remapping!
  "Record that `(entity-type, source-id)` is shadowed by `target-id` in `workspace-id`.
   For entities created inside the workspace pass `source-id = target-id`."
  [workspace-id :- :int
   entity-type  :- ::entity-type
   source-id    :- :int
   target-id    :- :int]
  (t2/insert! :model/WorkspaceRemapping
              {:workspace_id     workspace-id
               :entity_type      entity-type
               :source_entity_id source-id
               :target_entity_id target-id}))

(mu/defn remove-remapping!
  "Remove the remapping for `(entity-type, source-id)`. Returns rows deleted."
  [workspace-id :- :int
   entity-type  :- ::entity-type
   source-id    :- :int]
  (t2/delete! :model/WorkspaceRemapping
              :workspace_id workspace-id
              :entity_type  entity-type
              :source_entity_id source-id))

;;; ------------------------------------------ Copy-on-write ------------------------------------------

(defn- workspace-target
  "Rewrite a transform `:target` to its workspace-local coordinates. PoC: suffix the
   table name; the real thing writes into the workspace's provisioned schema."
  [workspace-id target]
  (update target :name #(str % "_ws_" workspace-id)))

(defn- ensure-output-table-remap!
  "Make sure a cloned transform's output table exists as an (inactive)
   `:model/Table` row and that readers of the production output table are
   redirected to it.

   - production output table row missing (source transform never ran): nothing to
     redirect, skip.
   - workspace table row missing: insert it with `:active false` — running the
     transform + sync will fill it in and activate it, but we need the id *now* to
     record the remapping."
  [workspace-id source-transform target-transform]
  (let [db-id        (get-in source-transform [:target :database])
        source-table (t2/select-one :model/Table
                                    :db_id  db-id
                                    :schema (get-in source-transform [:target :schema])
                                    :name   (get-in source-transform [:target :name]))]
    (when (and source-table
               (nil? (source->target workspace-id :table (:id source-table))))
      (let [{:keys [schema name]} (:target target-transform)
            target-table-id       (or (t2/select-one-pk :model/Table :db_id db-id :schema schema :name name)
                                      (t2/insert-returning-pk! :model/Table
                                                               {:db_id        db-id
                                                                :schema       schema
                                                                :name         name
                                                                :display_name name
                                                                :active       false}))]
        (add-remapping! workspace-id :table (:id source-table) target-table-id)))))

(def ^:private cloneable-card-keys
  "Columns copied from a production card onto its workspace shadow. Identity,
   sharing, and stats columns are deliberately left behind."
  [:name :description :display :dataset_query :visualization_settings :type
   :parameters :parameter_mappings :collection_id :database_id :table_id
   :query_type :result_metadata :cache_ttl])

(defmulti ^:private clone-entity!
  "Clone the production row behind `(entity-type, source-id)` for use inside
   `workspace-id`. Returns the clone's id."
  {:arglists '([workspace-id entity-type source-id])}
  (fn [_workspace-id entity-type _source-id] entity-type))

(defmethod clone-entity! :card
  [_workspace-id _entity-type source-id]
  (let [source (t2/select-one :model/Card :id source-id)]
    (:id (queries/create-card! (select-keys source cloneable-card-keys)
                               @api/*current-user*))))

(defmethod clone-entity! :transform
  [workspace-id _entity-type source-id]
  (let [source (t2/select-one :model/Transform :id source-id)
        clone  (t2/insert-returning-instance!
                :model/Transform
                (-> (select-keys source [:name :description :source :target])
                    (update :target #(workspace-target workspace-id %))))]
    (ensure-output-table-remap! workspace-id source clone)
    (:id clone)))

(defn- clone-row!
  "Generic clone for simple models: copy the row minus identity/timestamps."
  [model source-id]
  (let [source (t2/select-one model :id source-id)]
    (t2/insert-returning-pk! model
                             (-> (into {} source)
                                 (dissoc :id :entity_id :created_at :updated_at)
                                 (assoc :creator_id api/*current-user-id*)))))

(defmethod clone-entity! :measure
  [_workspace-id _entity-type source-id]
  (clone-row! :model/Measure source-id))

(defmethod clone-entity! :segment
  [_workspace-id _entity-type source-id]
  (clone-row! :model/Segment source-id))

(defenterprise effective-entity-id
  "EE impl: when the current user is in a workspace and `(entity-type, id)` has a
   workspace copy, return the copy's id; otherwise `id`."
  :feature :workspaces
  [entity-type id]
  (if-let [workspace-id (current-workspace-id)]
    (resolve-id workspace-id entity-type id)
    id))

(defenterprise ensure-workspace-copy!
  "EE impl of the PUT copy-on-write hook. When the current user is in a workspace:
   return the existing copy's id, or clone the entity (recording the remapping)
   and return the clone's id. Outside a workspace: identity."
  :feature :workspaces
  [entity-type id]
  (if-let [workspace-id (current-workspace-id)]
    (or (source->target workspace-id entity-type id)
        (let [clone-id (clone-entity! workspace-id entity-type id)]
          (add-remapping! workspace-id entity-type id clone-id)
          clone-id))
    id))

;;; -------------------------------------- Metadata-provider overlay --------------------------------------
;;;
;;; The single seam through which the QP sees the workspace. Installed by
;;; [[metabase-enterprise.workspaces.query-processor]] at the very
;;; top of preprocess (before `resolve-source-cards`), so every downstream read of a
;;; card/transform/measure/segment/table goes through the overlay.

(defn- swap-entity
  "Serve `(:id entity)` from its workspace target: fetch the target metadata of the
   same type from `parent-mp` and present it under the source id. Falls back to the
   original entity when the target row is gone."
  [parent-mp id->target {metadata-type :lib/type, :keys [id], :as entity}]
  (if-let [target-id (get id->target id)]
    (if (= target-id id)
      entity ; created in-workspace; the entity IS the workspace copy
      (if-let [target (first (lib.metadata.protocols/metadatas parent-mp {:lib/type metadata-type, :id #{target-id}}))]
        (assoc target :id id)
        entity))
    entity))

(defn- swap-table
  "Overlay the target table's physical coordinates onto the source table's metadata.
   Keeps the source `:id` (and therefore all its field metadata) — only `:schema`
   and `:name` move, which is all HoneySQL needs to emit the workspace identifier."
  [parent-mp id->target {:keys [id] :as table}]
  (if-let [target-id (get id->target id)]
    (if (= target-id id)
      table
      (if-let [target (first (lib.metadata.protocols/metadatas
                              parent-mp {:lib/type :metadata/table, :id #{target-id}}))]
        (merge table (select-keys target [:schema :name :display-name]))
        table))
    table))

(defn remapping-metadata-provider
  "Wrap `parent-mp` so all card/transform/measure/segment/table reads are shadowed
   by the remappings of `workspace-id`. Reads with no active remapping pass through
   untouched, so this is safe to install unconditionally once a workspace context
   is established."
  [workspace-id parent-mp]
  (let [remappings (remappings-for-workspace workspace-id)
        transform  (fn [{metadata-type :lib/type} results]
                     (case metadata-type
                       :metadata/card      (mapv #(swap-entity parent-mp (:card remappings) %) results)
                       :metadata/transform (mapv #(swap-entity parent-mp (:transform remappings) %) results)
                       :metadata/measure   (mapv #(swap-entity parent-mp (:measure remappings) %) results)
                       :metadata/segment   (mapv #(swap-entity parent-mp (:segment remappings) %) results)
                       :metadata/table     (mapv #(swap-table parent-mp (:table remappings) %) results)
                       results))]
    (lib.metadata/transforming-metadata-provider transform parent-mp)))
