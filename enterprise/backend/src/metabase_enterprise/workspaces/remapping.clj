(ns metabase-enterprise.workspaces.remapping
  "Workspaces v2 PoC: generic entity remapping.

   ## The model

   A workspace is an overlay over the computation/query graph. Nodes in the graph
   (cards, transforms, and the tables transforms produce) can be *shadowed* inside a
   workspace: a `workspace_remapping` row says \"whenever workspace W talks about
   entity (type, source-id), actually use (type, target-id)\".

   The API always speaks in **source ids** — the real, production ids. Remapping is
   an internal implementation detail:

     - API reads resolve source → target and present the target's content under the
       source id.
     - Query execution happens with [[*workspace-id*]] bound; the QP preprocess hook
       wraps the metadata provider with [[remapping-metadata-provider]] so every
       `:metadata/card` / `:metadata/table` / `:metadata/transform` read is served
       from the workspace copy — transparently, under the source id.

   ## How each entity type is shadowed

   - **card**: the target is a full `:model/Card` row (created the normal way). The
     MP returns the target's `:dataset-query`, `:result-metadata` etc. with `:id`
     forced back to the source id, so `:source-card` refs in downstream queries keep
     working untouched.

   - **transform**: the target is a full `:model/Transform` row whose `:target`
     points at a workspace-local output table.

   - **table**: shadows a transform's *output* table. We do NOT swap table ids —
     field ids belong to the source table and live all over saved queries. Instead
     the MP merges the target table's physical coordinates (`:schema`, `:name`) onto
     the source table's metadata, keeping the source `:id` and its fields. Compiled
     SQL then reads from the workspace output table while all field refs still
     resolve against source-table field metadata. (Same trick as the old
     Phase-1 table remapping, but keyed by table id instead of schema/name.)"
  (:require
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::entity-type [:enum :card :transform :table])

;;; ------------------------------------------ Workspace context ------------------------------------------

(def ^:dynamic *workspace-id*
  "Id of the workspace the current request/query runs in, or nil for normal
   (production) execution. Bound by the `/api/ee/workspace/.../query` and `/run`
   endpoints; consulted by the QP preprocess hook.

   PoC caveat: binding conveyance is fine through the QP (runs on the request
   thread / bound futures) but anything handed to raw Jetty or executor threads
   must re-bind explicitly — the transform-run path does this inside its
   virtual thread."
  nil)

(defmacro with-workspace
  "Execute `body` in the context of workspace `workspace-id`."
  [workspace-id & body]
  `(binding [*workspace-id* ~workspace-id]
     ~@body))

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

(mu/defn created-in-workspace? :- :boolean
  "True when the entity was created inside the workspace (self-remapping row)."
  [workspace-id :- :int
   entity-type  :- ::entity-type
   source-id    :- :int]
  (= source-id (source->target workspace-id entity-type source-id)))

;;; -------------------------------------- Metadata-provider overlay --------------------------------------
;;;
;;; The single seam through which the QP sees the workspace. Installed by
;;; [[metabase-enterprise.workspaces.query-processor]] at the very
;;; top of preprocess (before `resolve-source-cards`), so every downstream read of a
;;; card/transform/table goes through the overlay.

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
  "Wrap `parent-mp` so all card/transform/table reads are shadowed by the
   remappings of `workspace-id`. Reads with no active remapping pass through
   untouched, so this is safe to install unconditionally once a workspace id is
   bound."
  [workspace-id parent-mp]
  (let [remappings (remappings-for-workspace workspace-id)
        transform  (fn [{metadata-type :lib/type} results]
                     (case metadata-type
                       :metadata/card      (mapv #(swap-entity parent-mp (:card remappings) %) results)
                       :metadata/transform (mapv #(swap-entity parent-mp (:transform remappings) %) results)
                       :metadata/table     (mapv #(swap-table parent-mp (:table remappings) %) results)
                       results))]
    (lib.metadata/transforming-metadata-provider transform parent-mp)))
