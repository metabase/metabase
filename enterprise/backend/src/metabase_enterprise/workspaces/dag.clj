;; TODO consider renaming this to dataflow
(ns metabase-enterprise.workspaces.dag
  "Used to do graph computations with respect to dataflow within a workspace.

   This workspace should encapsulate all coupling to the [[metabase-enterprise.dependencies]] module, including through
   database artifacts.

   It is purely concerned with calculation, any side effects wanted as a result of the analysis should happen outside.")

#_(def ^:private empty-subgraph
    {:working-set  []
     :inputs       []
     :outputs      []
     :entities     []
     :dependencies {}})

;; Is this working with appdb-ids or ref-ids?
(defn unsupported-dependency?
  "Return a map of the entities which have unsupported dependencies, or nil if there are none."
  [{transform-ids :transforms :as _entity-map}]
  ;; TODO filter out those that don't have a card dependency
  (when (seq transform-ids)
    {:transforms transform-ids}))

;;;; Public API

#_{:clj-kondo/ignore [:unused-private-var]}
(defn- path-induced-subgraph
  "Given a map of entity types to IDs, compute the path-induced subgraph.
   `entities-by-type` is a map like {:transform [1 2 3]}.

   Returns a map with:
   - :changeset    - the entities being edited within the workspace, in topological order
                     {type, ref-id, parent-id}
   - :inputs       - tables that the subgraph directly depends on, that are not themselves produced by the subgraph.
                     ordered lexically by db+schema+table, to be stable across metabase instances, and visibly sorted.
   - :outputs      - outputs of both the changeset transforms, and the external transforms enclosed by the changeset.
                     both the external names, and the internal (isolated) names. sorted by the external names.
                     point back to their relevant transform.

   - :entities     - the full list of entities, both in the changeset, and those that are enclosed. topo-sorted.
   - :dependencies - association list for the subgraph, with keys and values both in topological order"
  [working-set]
  {:working-set  (or working-set [{:type "transform", :ref_id "2", :global_id 1}])
   :inputs       [{:db_id 1, :schema "public", :table "orders", :table_id 1}]
   ;; or global + isolated?
   :outputs      [{:global   {:transform_id nil
                              :schema       "public"
                              :table        "customers"
                              :table_id     nil}
                   :isolated {:transform_id "1"
                              :schema       "isolated__blah"
                              :table        "public__customers"
                              :table_id     2}}

                  {:db_id    1
                   :global   {:transform_id 1
                              :schema       "public"
                              :table        "mega_orders"
                              :table_id     1}
                   ;; integer id - enclosed
                   :isolated {:transform_id nil
                              :schema       "isolated__blah"
                              :table        "public__mega_orders"
                              :table_id     3}}

                  {:id       1
                   :db_id    1
                   :global   {:transform_id nil
                              :schema       "public"
                              :table        "augmented_orders"
                              :table_id     4}
                   ;; string id - changeset
                   :isolated {:transform_id "2"
                              :schema       "isolated__blah"
                              :table        "public__augmented_orders"
                              :table-id     nil}}]

   ;; should we include tables in the :dependencies graph? i kinda don't like it
   ;; 1. bigger and uglier for test validation
   ;; 2. easier to expand than to contract (and not sure which we want to show in ui)
   ;; 3. don't need the tables for execute.
   ;; 4. don't need the dependencies list for data tab.

   :enclosed     [{:type "transform", :id 2}]
   ;; If writing to JSON, we need to serialize to an association list because of rich keys.
   :dependencies {{:type "external-transform", :id 1}    [{:type "workspace-transform", :id "1"}]
                  {:type "workspace-transform", :id "2"} [{:type "input-table", :id 1}
                                                          {:type "global-transform" :id 1}]}})

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
