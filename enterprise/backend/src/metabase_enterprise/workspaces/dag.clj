(ns metabase-enterprise.workspaces.dag
  "Used to do graph computations with respect to dataflow within a workspace.

   This namespace should encapsulate all coupling to the [[metabase-enterprise.dependencies]] module, including through
   database artifacts.

   It is purely concerned with calculation, any side effects wanted as a result of the analysis should happen outside."
  (:require
   [metabase-enterprise.workspaces.util :as ws.u]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

;; TODO (chris 2025/12/15) Should we leverage data-authority table metadata to speed things up?

(defn- table-id->coord [id]
  (t2/select-one [:model/Table :id :schema [:name :table] [:db_id :db]] id))

(defn- target->coord [{:keys [database schema name] :as _target}]
  {:db     database
   :schema schema
   :table  name})

(defn- global-parents
  "Dependencies analyzed by global hooks - may be incomplete. For example, excluding transforms that have not been run."
  [ws-id node-type id]
  ;; Note: from_entity_type is transformed to a keyword by the Dependency model
  (t2/select-fn-vec (fn [{id :to_entity_id entity-type :to_entity_type}]
                      (case entity-type
                        :card {:node-type :external-card, :id id}
                        :table {:node-type :table, :id (table-id->coord id)}
                        :transform {:node-type :external-transform, :id id}))
                    [:model/Dependency :to_entity_type :to_entity_id]
                    :from_entity_type node-type
                    :from_entity_id id
                    ;; Exclude transforms which are being overridden in the workspace.
                    ;; Note: use string "transform" in SQL WHERE clause (db stores strings)
                    {:where [:not [:and
                                   [:= "transform" :to_entity_type]
                                   [:exists {:select [1]
                                             :from   [[:workspace_transform :wt]]
                                             :where  [:and
                                                      [:= :wt.workspace_id ws-id]
                                                      [:= :wt.global_id :to_entity_id]]}]]]}))

;; Workaround for change in how Dependencies table works (inlining of transform dependencies)
(defn- global-tx-parents
  "Dependencies analyzed by global hooks - may be incomplete. For example, excluding transforms that have not been run."
  [id]
  ;; Note: from_entity_type is transformed to a keyword by the Dependency model
  (mapv
   (fn [{:keys [node-type id] :as node}]
     (if (= :external-transform node-type)
       {:node-type :table, :id (target->coord (t2/select-one-fn :target [:model/Transform :target] id))}
       node))
   (t2/select-fn-vec (fn [{id :to_entity_id entity-type :to_entity_type}]
                       (case entity-type
                         :card {:node-type :external-card, :id id}
                         :table {:node-type :table, :id (table-id->coord id)}
                         :transform {:node-type :external-transform, :id id}))
                     [:model/Dependency :to_entity_type :to_entity_id]
                     :from_entity_type "transform"
                     :from_entity_id id)))

(defn- ws-transform-parents [ws-id ref-id]
  ;; We assume there are no card dependencies yet
  ;; Get the latest version - which may have changed since we started this graph analysis (!!!)
  ;; Unfortunately, since each transform is versioned separately, it's not trivial to freeze to a snapshot.
  ;; NOTE: Perhaps this is a reason to snapshot these rows, or pre-query them all :thinking:
  (t2/select-fn-vec (fn [table-coord]
                      {:node-type :table, :id (t2.realize/realize table-coord)})
                    [:model/WorkspaceInput [:db_id :db] :schema :table [:table_id :id]]
                    :workspace_id ws-id
                    :ref_id ref-id
                    {:where [:= :transform_version
                             {:select [[:%max.transform_version]]
                              :from   [:workspace_input]
                              :where  [:and
                                       [:= :workspace_id ws-id]
                                       [:= :ref_id ref-id]]}]}))

(defn- table-producers [ws-id id-or-coord]
  ;; Work with either logical co-ords or an id
  (let [{:keys [db schema table id]} (if (map? id-or-coord) id-or-coord (table-id->coord id-or-coord))
        ;; Get the latest version - which may have changed since we started this graph analysis (!!!)
        ;; Unfortunately, since each transform is versioned separately, it's not trivial to freeze to a snapshot.
        ;; NOTE: Perhaps this is a reason to snapshot these rows, or pre-query them all :thinking:
        tx-ref-id (t2/select-one-fn :ref_id [:model/WorkspaceOutput :ref_id]
                                    {:where [:and
                                             [:= :workspace_id ws-id]
                                             [:or
                                              (when id
                                                [:= :global_table_id id])
                                              [:and
                                               [:= :db_id db]
                                               [:= :global_schema schema]
                                               [:= :global_table table]]]]
                                     :order-by [[:id :desc]]
                                     :limit 1})]
    (if tx-ref-id
      ;; If there is a workspace transform that targets this table, ignore any global transform that also targets it.
      [{:node-type :workspace-transform :id tx-ref-id}]
      (global-parents ws-id "table" id))))

(defn- table? [{:keys [node-type]}] (= :table node-type))

(defn- node-parents [ws-id {:keys [node-type id]}]
  (case node-type
    :workspace-transform (ws-transform-parents ws-id id)
    :external-transform  (global-tx-parents id)
    :external-card       (global-parents ws-id "card" id)
    :table               (table-producers ws-id id)))

(defn- node->allowed-parents
  [pred deps node]
  (if-not (pred node)
    [node]
    ;; Collapse to the things that *produce* node. If it is a root node, leave it in.
    (or (seq (mapcat (partial node->allowed-parents pred deps) (deps node)))
        [node])))

(defn- collapse
  "Remove nodes that satisfy pred, in-lining their transitive dependencies instead."
  [pred deps]
  (u/for-map [[child parents] deps
              :when (not (pred child))]
    [child (mapcat (partial node->allowed-parents pred deps) parents)]))

(defn- render-graph [entities parents deps & {:keys [table? table-sort unwrap-table]
                                              :or   {table?         table?
                                                     table-sort     (juxt :db :schema :table)
                                                     unwrap-table   :id}}]
  (let [table-nodes (filter table? entities)
        ;; Any table that has a parent in the subgraph is an output
        outputs     (filter deps table-nodes)
        ;; Anything other parent table is an input
        inputs      (->> entities (mapcat parents) (filter table?) (remove (set outputs)) distinct)
        entities    (->> (ws.u/toposort-dfs deps) (remove table?))
        deps+input  (reduce
                     (fn [deps [c parents]]
                       (if-not (deps c)
                         deps
                         (update deps c into parents)))
                     deps
                     parents)]
    {:inputs       (sort-by table-sort (map unwrap-table inputs))
     :outputs      (sort-by table-sort (map unwrap-table outputs))
     :entities     entities
     ;; collapse tables out, directly connecting transforms? smaller graphs are easier for humans to read
     :dependencies (collapse table? deps+input)}))

(defn- path-induced-subgraph*
  "Implementation for [[path-induced-subgraph]] that takes the lookup functions as arguments. Useful for testing."
  [init-nodes fns]
  (loop [members (set init-nodes)
         cache   {}
         ;; Association list sets from nodes to their direct dependencies
         deps    (u/for-map [node init-nodes] [node #{}])
         ;; Paths are vectors sorted from child to parent
         [path & paths] (for [node members] [node])]
    (if-not path
      ;; Finished walking all paths, render the result.
      (render-graph members cache deps fns)
      ;; Look-up from cache first
      (let [_          (when (some #(not= 1 (val %)) (frequencies path))
                         (throw (ex-info "Cycle detected" {:path path})))
            head       (peek path)
            parents-fn (:node-parents fns)
            parents    (cache head (parents-fn head))
            cache      (assoc cache head parents)
            continue   (when parents (remove members parents))]
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

(defn reverse-graph
  "Reverse edge direction: child->parents becomes parent->children.
   Takes a dependency map and returns a map where each parent points to its children."
  [deps-map]
  (reduce (fn [m [child parents]]
            (reduce (fn [acc parent]
                      (update acc parent (fnil conj []) child))
                    m
                    parents))
          {}
          deps-map))

(defn bfs-reduce
  "BFS traversal from start node(s) through an edge map.

   edges-map - adjacency map from node to its neighbors
   starts    - a collection of start nodes

   Options:
   - :include-start? - include start node(s) in result (default: false)
   - :rf             - reducing function for collecting results (default: conj)
   - :init           - initial value for the result accumulator (default: [])

   Returns the accumulated result in BFS order (no duplicates)."
  [edges-map starts & {:keys [include-start? rf init]
                       :or   {rf conj, init []}}]
  (let [init-set      (set starts)
        get-children  #(get edges-map % [])
        ;; Queue always starts with children of start nodes (excluding start nodes themselves)
        init-children (into [] (comp (mapcat get-children) (remove init-set)) starts)]
    (loop [queue   init-children
           ;; Only mark start nodes as visited if we're including them in result
           ;; This allows routes between start nodes to be detected when include-start? is false
           visited (transient (if include-start? init-set #{}))
           result  (if include-start? (reduce rf init starts) init)]
      (if (empty? queue)
        result
        (let [current (first queue)
              queue   (subvec queue 1)]
          (if (visited current)
            (recur queue visited result)
            (let [children  (get-children current)
                  new-nodes (remove visited children)]
              (recur (into queue new-nodes)
                     (conj! visited current)
                     (rf result current)))))))))

(defn path-induced-subgraph
  "Given a list of internal entities, compute the path-induced subgraph.

   Returns a map with:
   - :inputs       - tables that the subgraph directly depends on, that are not themselves produced by the subgraph.
                     ordered lexically by db+schema+table, to be stable across metabase instances, and visibly sorted.
   - :outputs      - outputs of both the changeset transforms, and the external transforms enclosed by the changeset.
                     both the external names, and the internal (isolated) names. sorted by the external names.
                     point back to their relevant transform.

   - :entities     - the full list of entities, both internal, and those that are enclosed. topo-sorted.
   - :dependencies - association list for the subgraph, with keys and values both in topological order"
  [ws-id internal-entities]
  (ws.u/assert-transforms! internal-entities)
  (if (empty? internal-entities)
    {:inputs       []
     :outputs      []
     :entities     []
     :dependencies {}}
    (let [tx-nodes   (for [{:keys [entity-type id]} internal-entities]
                       (case entity-type
                         :transform {:node-type :workspace-transform, :id id}))
          ->latest   (fn [versioned-entities]
                       (let [versions (u/group-by (juxt :node-type :id) versioned-entities)
                             latest?  (into #{}
                                            (map (fn [[entity versions]]
                                                   (if (= 1 (count versions))
                                                     (first versions)
                                                     (assoc entity :version (transduce (map :version) max versions)))))
                                            versions)]
                         (filter latest? versioned-entities)))
          outputs    (when (seq tx-nodes)
                       (->latest
                        (t2/select-fn-vec (fn [row]
                                            {:node-type :table
                                             :id        (t2.realize/realize row)
                                             :version   (:version row)})
                                          ;; We use workspace_output.id (i.e. analysis write order) as a proxy for
                                          ;; the order in which the corresponding transforms were updated.
                                          [:model/WorkspaceOutput
                                           [:id :version]
                                           [:db_id :db]
                                           [:global_schema :schema]
                                           [:global_table :table]
                                           [:global_table_id :id]]
                                          :workspace_id ws-id
                                          :ref_id [:in (map :id tx-nodes)])))
          init-nodes (concat tx-nodes outputs)
          fns        {:node-parents (partial node-parents ws-id)
                      :table?       table?}]
      (path-induced-subgraph* init-nodes fns))))

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
