(ns metabase-enterprise.workspaces.util)

(defn assert-transform!
  "Test whether we support the given entity type within workspaces yet.
   Named for the only case we support currently, to make call sites assumptions more obvious."
  [entity-type]
  (when (not= "transform" (name entity-type))
    (throw (ex-info "Only transform entity type is supported"
                    {:status-code 400
                     :entity-type entity-type}))))

(defn- toposort-visit [node child->parents visited result]
  (cond
    (visited node) [visited result]
    :else (let [parents (child->parents node [])
                [visited' result'] (reduce (fn [[v r] p]
                                             (toposort-visit p child->parents v r))
                                           [(conj visited node) result]
                                           parents)]
            [visited' (conj result' node)])))

(defn toposort-dfs
  "Perform a topological sort using depth-first search.
   Takes a map from child nodes to their parent nodes (dependencies).
   Returns nodes in topological order (dependencies before dependents)."
  [child->parents]
  ;; TODO (Chris 2025-11-20): Detect cycles and throw an error. (In practice inputs will never be cyclic, but still.)
  (let [all-nodes (set (keys child->parents))]
    (loop [visited   #{}
           result    []
           remaining all-nodes]
      (if (empty? remaining)
        result
        (let [node (first remaining)
              [visited' result'] (toposort-visit node child->parents visited result)]
          (recur visited' result' (disj remaining node)))))))
