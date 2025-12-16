;; TODO consider renaming this to dataflow
(ns metabase-enterprise.workspaces.dag
  "Used to do graph computations with respect to dataflow within a workspace.

   This workspace should encapsulate all coupling to the [[metabase-enterprise.dependencies]] module, including through
   database artifacts.

   It is purely concerned with calculation, any side effects wanted as a result of the analysis should happen outside."
  (:require
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

;; Is this working with appdb-ids or ref-ids?
(defn unsupported-dependency?
  "Return a map of the entities which have unsupported dependencies, or nil if there are none."
  [{transform-ids :transforms :as _entity-map}]
  ;; TODO filter out those that don't have a card dependency
  (when (seq transform-ids)
    {:transforms transform-ids}))

;; TODO (chris 2025/12/15) Should we leverage data-authority table metadata to speed things up?

(defn- table-id->coord [id]
  (t2/select-one [:model/Table :id :schema [:name :table] [:db_id :db]] id))

(defn- global-parents
  "Dependencies analyzed by global hooks - may be incomplete. For example, excluding transforms that have not been run."
  [ws-id entity-type id]
  ;; Note: from_entity_type is transformed to a keyword by the Dependency model
  (t2/select-fn-vec (fn [{:keys [from_entity_type from_entity_id]}]
                      (case from_entity_type
                        :card      {:node-type :external-card,      :id from_entity_id}
                        :table     {:node-type :table,              :id (table-id->coord from_entity_id)}
                        :transform {:node-type :external-transform, :id from_entity_id}))
                    [:model/Dependency :from_entity_type :from_entity_id]
                    :to_entity_type entity-type
                    :to_entity_id id
                    ;; Exclude transforms which are being overridden in the workspace.
                    ;; Note: use string "transform" in SQL WHERE clause (db stores strings)
                    {:where [:not [:and
                                   [:= "transform" :from_entity_type]
                                   [:exists {:select [1]
                                             :from   [[:workspace_transform :wt]]
                                             :where  [:and
                                                      [:= :wt.workspace_id ws-id]
                                                      [:= :wt.global_id :from_entity_id]]}]]]}))

(defn- ws-transform-parents [ws-id ref-id]
  ;; We assume there are no card dependencies yet
  (t2/select-fn-vec (fn [table-coord]
                      {:entity-type :table, :id (t2.realize/realize table-coord)})
                    [:model/WorkspaceInput [:db_id :db] :schema :table [:table_id :id]]
                    :workspace_id ws-id
                    :id [:in {:select [:to_entity_id]
                              :from   [:workspace_dependency]
                              :where  [:and
                                       [:= "transform" :from_entity_type]
                                       [:= ref-id :from_entity_id]
                                       [:= "input" :to_entity_type]]}]))

(defn- table-producers [ws-id id-or-coord]
  ;; Work with either logical co-ords or an id
  (let [{:keys [db schema table id]} (if (map? id-or-coord) id-or-coord (table-id->coord id-or-coord))
        tx-ref-id (t2/select-one-fn :ref_id [:model/WorkspaceOutput :ref_id]
                                    {:where [:and
                                             [:= :workspace_id ws-id]
                                             [:or
                                              [:= :global_table_id id]
                                              [:and
                                               [:= :db_id db]
                                               [:= :global_schema schema]
                                               [:= :global_table table]]]]})]
    (if tx-ref-id
      ;; If there is a workspace transform that targets this table, ignore any global transform that also targets it.
      [{:node-type :workspace-transform :id tx-ref-id}]
      (global-parents ws-id "table" id))))

;; TODO straighten out node-type and entity-type
(defn- table? [{:keys [node-type entity-type]}] (= :table (or node-type entity-type)))

(defn- node-parents [ws-id {:keys [entity-type node-type id]}]
  ;; TODO straighten out entity-type versus node-type (do we really need both)
  (case (or node-type entity-type)
    :workspace-transform (ws-transform-parents ws-id id)
    :external-transform  (global-parents ws-id "transform" id)
    :external-card       (global-parents ws-id "card" id)
    :table               (table-producers ws-id id)))

(defn- node->allowed-parents
  [pred deps node]
  (if-not (pred node) [node] (mapcat (partial node->allowed-parents pred deps) (deps node))))

(defn- collapse
  "Remove nodes that satisfy pred, in-lining their transitive dependencies instead."
  [pred deps]
  (u/for-map [[child parents] deps
              :when (not (pred child))]
    [child (mapcat (partial node->allowed-parents pred deps) parents)]))

(defn- render-graph [entities parents deps & {:keys [table? table-sort unwrap-table]
                                              :or   {table?         table?
                                                     table-sort     identity
                                                     unwrap-table   :id}}]
  (let [table-nodes (filter table? entities)
        ;; Any table that has a parent in the subgraph is an output
        outputs     (filter deps table-nodes)
        ;; Anything other parent table is an input
        inputs      (->> entities (mapcat parents) (filter table?) (remove (set outputs)) distinct)
        entities    (->> (ws.u/toposort-dfs deps) (remove table?))]
    {:inputs       (sort-by table-sort (map unwrap-table inputs))
     :outputs      (sort-by table-sort (map unwrap-table outputs))
     :entities     entities
     ;; collapse tables out, directly connecting transforms? smaller graphs are easier for humans to read
     :dependencies (collapse table? deps)}))

(defn- path-induced-subgraph*
  "Implementation for [[path-induced-subgraph]] that takes the lookup functions as arguments. Useful for testing."
  [init-nodes {:keys [node-parents] :as fns}]
  (loop [members (set init-nodes)
         cache   {}
         ;; Association list sets from nodes to their direct dependencies
         deps    (u/for-map [node init-nodes] [node #{}])
         ;; Paths are vectors sorted from child to parent
         [path & paths] (for [ref members] [ref])]
    (if-not path
      (render-graph members cache deps fns)
      ;; Look-up from cache first
      (let [head     (peek path)
            parents  (cache head (node-parents head))
            cache    (assoc cache head parents)
            continue (when parents (remove members parents))]
        (if (not= parents continue)
          ;; At least one parent is in the enclosed subgraph, so this entire path is as well.
          (let [add-dep    (fn [deps [child parent]]
                             (update deps child (fnil conj #{}) parent))
                ;; Break up the path into adjacent child-parent pairs.
                pairs      (concat (partition 2 1 path)
                                   (map (fn [end] [(peek path) end]) (filter members parents)))
                ;; Since everything along this path will now be added to deps already, we can truncate the paths.
                next-paths (into paths (for [c continue] [(peek path) c]))]
            (recur (into members path) cache (reduce add-dep deps pairs) next-paths))
          ;; We have not reached another member of the enclosed subgraph yet, so keep extending.
          (recur members cache deps (into paths (for [c continue] (conj path c)))))))))

;;;; Public API

(defn path-induced-subgraph
  "Given a map of entity types to IDs, compute the path-induced subgraph.
   `entities-by-type` is a map like {:transform [1 2 3]}.

   Returns a map with:
   - :inputs       - tables that the subgraph directly depends on, that are not themselves produced by the subgraph.
                     ordered lexically by db+schema+table, to be stable across metabase instances, and visibly sorted.
   - :outputs      - outputs of both the changeset transforms, and the external transforms enclosed by the changeset.
                     both the external names, and the internal (isolated) names. sorted by the external names.
                     point back to their relevant transform.

   - :entities     - the full list of entities, both in the changeset, and those that are enclosed. topo-sorted.
   - :dependencies - association list for the subgraph, with keys and values both in topological order"
  [ws-id changeset]
  (ws.u/assert-transforms! changeset)
  (let [tx-nodes   (for [{:keys [entity-type id]} changeset]
                     (case entity-type
                       :transform {:node-type :workspace-transform, :id id}))
        outputs    (when (seq tx-nodes)
                     (t2/select-fn-vec (fn [row]
                                         {:entity-type :table, :id (t2.realize/realize row)})
                                       [:model/WorkspaceOutput
                                        [:db_id :db]
                                        [:global_schema :schema]
                                        [:global_table :table]
                                        [:global_table_id :id]]
                                       :ref_id [:in (map :id tx-nodes)]))
        init-nodes (concat tx-nodes outputs)
        fns        {:node-parents (partial node-parents ws-id)
                    :table?       table?}]
    (path-induced-subgraph* init-nodes fns)))

;; source-table ---------> checked-out-transform
;;          \____external-transform__/
;;
;; should external-transform be enclosed? answer: no, because it won't become stale from changes in the workspace
;;
;; source-table ----> model ---> checked-out-transform
;;
;; this time we *need* the model to be serialized, because we need to read it in a fresh instance.
;; it doesn't need to be remapped or "run" independently though, so does it make sense to call it enclosed?
;;
;; enclosed: between changeset only? or including the model in the example above?
;; ancestors: as far back as you can go
;;
