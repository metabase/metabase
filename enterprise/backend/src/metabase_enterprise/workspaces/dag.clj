(ns metabase-enterprise.workspaces.dag
  (:require
   [clojure.set :as set]
   [flatland.ordered.map :as ordered-map]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;; TODO handle shadowing / execution of transforms that depend on checkout out models

(defn- related [t id]
  (keyword (str (name t) (subs (name id) 1))))

(def ^:private x->t (partial related :t))

(defn- is? [t id] (= (name t) (str (first (name id)))))

(defn- lexico [id]
  (let [n (name id)]
    [(parse-long (subs n 1))
     ({\x 1 \t 2 \m 3} (first n))]))

(defn- expand-shorthand
  "As shorthand we can use transforms in the place of their induced tables.
   This function expands the graph to insert the induced tables, and replace the corresponding references."
  [{:keys [dependencies] :as graph}]
  (assoc graph :dependencies
         (let [xs (set (filter #(is? :x %) (concat (keys dependencies) (mapcat val dependencies))))]
           (into (sorted-map-by #(compare (lexico %1) (lexico %2)))
                 (merge (zipmap (map x->t xs) (map vector xs))
                        (into {} (filter (comp #(is? :t %) key)) dependencies)
                        (update-vals
                         (into {} (remove (comp #(is? :t %) key)) dependencies)
                         (fn [deps] (->> deps
                                         (map (fn [id]
                                                (if (is? :x id)
                                                  (x->t id)
                                                  id)))
                                         (sort-by lexico)
                                         (vec)))))))))

(def ^:private example-shorthand
  {:check-outs   #{:x3 :m6 :m10 :m13}
   :dependencies {:x3  [:x1 :t2]
                  :x4  [:x3]
                  :m6  [:x4 :t5]
                  :m10 [:t9]
                  :x11 [:m10]
                  :m12 [:x11]
                  :m13 [:x11 :m12]}})

(def ^:private example
  {:check-outs   #{:x3 :m6 :m10 :m13}
   :dependencies {:t1  [:x1]
                  :x3  [:t1 :t2]
                  :t3  [:x3]
                  :x4  [:t3]
                  :t4  [:x4]
                  :m6  [:t4 :t5]
                  :m10 [:t9]
                  :x11 [:m10]
                  :t11 [:x11]
                  :m12 [:t11]
                  :m13 [:t11 :m12]}})

(comment (= example (expand-shorthand example-shorthand)))

(defn- children [dependencies]
  (reduce
   (fn [acc [child parents]]
     (reduce (fn [acc p] (update acc p u/conjv child)) acc parents))
   (sorted-map-by #(compare (lexico %1) (lexico %2)))
   dependencies))

(comment
  (children (:dependencies example)))

(defn- ->ts [ids]
  (into #{}
        (keep (fn [id]
                (cond (is? :t id) id
                      (is? :x id) (x->t id))))
        ids))

;; naive dfs toposort

(defn- toposort-visit [node child->parents visited result]
  (cond
    (visited node) [visited result]
    :else (let [parents (child->parents node [])
                [visited' result'] (reduce (fn [[v r] p]
                                             (toposort-visit p child->parents v r))
                                           [(conj visited node) result]
                                           parents)]
            [visited' (conj result' node)])))

(defn- toposort-dfs [child->parents]
  ;; we assume the graph contains the degenerate nodes as keys with empty parent lists
  (let [all-nodes (set (keys child->parents))]
    (loop [visited   #{}
           result    []
           remaining all-nodes]
      (if (empty? remaining)
        result
        (let [node (first remaining)
              [visited' result'] (toposort-visit node child->parents visited result)]
          (recur visited' result' (disj remaining node)))))))

(defn- toposort-map [child->parents]
  (let [child->parents (if (map? child->parents) child->parents (into {} child->parents))]
    (into (ordered-map/ordered-map)
          (keep (fn [n] (when-let [deps (get child->parents n)] [n deps])))
          (toposort-dfs child->parents))))

;; naive version - calculate above and below, and take intersection

;; safety
(def ^:private max-iterations 100)

(defn- path-induced-subgraph [{:keys [check-outs dependencies] :as _graph}]
  (let [->parents  dependencies
        ->children (children dependencies)]
    (loop [iteration  1
           below      check-outs
           above      check-outs
           seen-down? check-outs
           seen-up?   check-outs
           to-descend check-outs
           to-ascend  check-outs]
      (if (and (empty? to-descend) (empty? to-ascend))
        ;; Inputs are all the external tables that we depend on.
        ;; NOTE: if there is a chain of models, we assume that ->parent here maps all the way to the source table
        (let [nodes    (set/intersection above below)
              entities (remove #(is? :t %) nodes)
              tables   (sort-by lexico (filter #(is? :t %) nodes))]
          {:check-outs   (sort-by lexico check-outs)
           :inputs       (sort-by lexico (remove nodes (->ts (mapcat ->parents check-outs))))
           :tables       tables
           :transforms   (sort-by lexico (filter #(is? :x %) nodes))
           :entities     (sort-by lexico entities)
           :dependencies (apply dissoc
                                (toposort-map
                                 (for [n nodes]
                                   [n (vec (filter nodes (get dependencies n)))]))
                                tables)})
        (if (> iteration max-iterations)
          {:error "max iterations exceeded"}
          (let [next-down (into #{} (comp (mapcat ->children) (remove seen-down?)) to-descend)
                next-up   (into #{} (comp (mapcat ->parents) (remove seen-up?)) to-ascend)]
            (recur (inc iteration)
                   (into below next-down)
                   (into above next-up)
                   (into seen-down? next-down)
                   (into seen-up? next-up)
                   next-down
                   next-up)))))))

(comment
  (path-induced-subgraph example))

;;;; Database-backed path-induced subgraph calculation

(def ^:private type->db-type
  "Mapping from our entity type keywords to the dependency table's type strings."
  {:transform "transform"
   #_#_:model "card"})

(defn- rows->entity-set
  "Convert query result rows to a set of {:id :type} maps."
  [rows]
  (into #{}
        (map (fn [{:keys [entity_type entity_id]}]
               {:id entity_id :type (keyword entity_type)}))
        rows))

(defn- entities-map->tuples
  "Convert a map of {type ids} to a sequence of [db-type id] tuples.
   `entities-by-type` is a map like {:transform [1 2 3]}."
  [entities-by-type]
  (into []
        (mapcat (fn [[entity-type ids]]
                  (let [dep-type (type->db-type entity-type)]
                    (map (fn [id] [dep-type id]) ids))))
        entities-by-type))

(defn- tuples->entity-set
  "Convert a sequence of [type id] tuples to a set of {:id :type} maps."
  [tuples]
  (into #{}
        (map (fn [[entity-type entity-id]]
               {:id entity-id :type (keyword entity-type)}))
        tuples))

(defn- tuples->starting-cte
  "Build a UNION ALL of SELECT statements for the starting tuples."
  [tuples]
  {:union-all (mapv (fn [[t id]]
                      {:select [[[:inline t] :entity_type]
                                [[:inline id] :entity_id]]})
                    tuples)})

(defn- transitive-closure
  "Compute transitive closure in the given direction.
   `direction` is :upstream (follow dependencies) or :downstream (follow dependents)."
  [entities-by-type direction]
  (let [starting-tuples (entities-map->tuples entities-by-type)
        [cte-name match-type match-id result-type result-id]
        (case direction
          :upstream   [:upstream,   :d.from_entity_type, :d.from_entity_id, :d.to_entity_type,   :d.to_entity_id]
          :downstream [:downstream, :d.to_entity_type,   :d.to_entity_id,   :d.from_entity_type, :d.from_entity_id])]
    (when (seq starting-tuples)
      (rows->entity-set
       (t2/query {:with-recursive
                  [[:starting (tuples->starting-cte starting-tuples)]
                   [cte-name {:union-all
                              [{:select [:entity_type :entity_id]
                                :from   [:starting]}
                               {:select [[result-type :entity_type]
                                         [result-id :entity_id]]
                                :from   [[:dependency :d]]
                                :join   [[cte-name :r]
                                         [:and
                                          [:= match-type :r.entity_type]
                                          [:= match-id :r.entity_id]]]}]}]]
                  :select [:entity_type :entity_id]
                  :from   [cte-name]})))))

(defn upstream-entities
  "Given a map of entity types to IDs, find all upstream entities (dependencies).
   Returns a set of {:id :type} maps."
  [entities-by-type]
  (transitive-closure entities-by-type :upstream))

(defn downstream-entities
  "Given a map of entity types to IDs, find all downstream entities (dependents).
   Returns a set of {:id :type} maps."
  [entities-by-type]
  (transitive-closure entities-by-type :downstream))

(defn- entity-dependencies
  "Fetch all dependencies between the given entities within the dependency table.
   Returns a map from {:id :type} to a vector of {:id :type} dependencies."
  [entities]
  (if (empty? entities)
    {}
    (let [conditions (mapv (fn [{:keys [id type]}]
                             [:and
                              [:= :from_entity_type (name type)]
                              [:= :from_entity_id id]])
                           entities)
          rows       (t2/query {:select [:from_entity_type :from_entity_id
                                         :to_entity_type :to_entity_id]
                                :from   [:dependency]
                                :where  (into [:or] conditions)})]
      ;; Group by source entity, filtering to only include targets in our set
      (reduce (fn [acc {:keys [from_entity_type from_entity_id to_entity_type to_entity_id]}]
                (let [from-entity {:id from_entity_id, :type (keyword from_entity_type)}
                      to-entity   {:id to_entity_id,   :type (keyword to_entity_type)}]
                  (if (contains? entities to-entity)
                    (update acc from-entity (fnil conj []) to-entity)
                    acc)))
              {}
              rows))))

(defn- toposort-entities
  "Toposort entities based on their dependencies.
   Returns entities in topological order (dependencies before dependents)."
  [entity-set dependencies-map]
  (let [child->parents (into {}
                             (map (fn [entity]
                                    [entity (vec (get dependencies-map entity []))]))
                             entity-set)]
    (toposort-dfs child->parents)))

(defn- fetch-related-tables
  "Find tables related to entities via the dependency table.
   `direction` is :upstream (tables we depend on) or :downstream (tables that depend on us)."
  [entities direction]
  (when (seq entities)
    (let [[match-type match-id result-type result-id]
          (case direction
            :upstream   [:from_entity_type, :from_entity_id, :to_entity_type,   :to_entity_id]
            :downstream [:to_entity_type,   :to_entity_id,   :from_entity_type, :from_entity_id])
          conditions (mapv (fn [{:keys [id type]}]
                             [:and
                              [:= match-type (name type)]
                              [:= match-id id]])
                           entities)
          rows       (t2/query {:select-distinct [result-type result-id]
                                :from   [:dependency]
                                :where  (into [:or] conditions)})]
      (->> rows
           (filter #(= "table" (get % result-type)))
           (mapv (fn [row]
                   {:id (get row result-id) :type :table}))))))

(defn path-induced-subgraph-entities
  "Given a map of entity types to IDs, compute the path-induced subgraph.
   `entities-by-type` is a map like {:transform [1 2 3]}.

   Returns a map with:
   - :check-outs   - the input entities
   - :inputs       - external tables that check-outs depend on (not in subgraph)
   - :tables       - output tables generated by transforms in the subgraph
   - :transforms   - Transform entities in the subgraph
   - :entities     - all entities in the subgraph (transforms, tables, etc.)
   - :dependencies - toposorted map from entity to its dependencies within subgraph"
  [entities-by-type]
  (let [starting-set   (tuples->entity-set (entities-map->tuples entities-by-type))
        upstream       (or (upstream-entities entities-by-type) #{})
        downstream     (or (downstream-entities entities-by-type) #{})
        subgraph-set   (set/intersection upstream downstream)
        transforms     (filterv #(= :transform (:type %)) subgraph-set)
        output-tables  (or (fetch-related-tables transforms :downstream) [])
        full-set       (set/union subgraph-set (set output-tables))
        inputs         (vec (remove full-set (fetch-related-tables full-set :upstream)))
        deps-map       (entity-dependencies full-set)
        sorted         (toposort-entities full-set deps-map)
        sorted-deps    (into (ordered-map/ordered-map)
                             (keep (fn [entity]
                                     (when-not (= :table (:type entity))
                                       [entity (vec (get deps-map entity []))])))
                             sorted)]
    {:check-outs   (vec starting-set)
     :inputs       inputs
     :tables       output-tables
     :transforms   transforms
     :entities     (vec full-set)
     :dependencies sorted-deps}))

(comment
  (upstream-entities {:transform [8]})
  (downstream-entities {:transform [8]})

  (path-induced-subgraph-entities {:transform [8]}))

(comment
  (path-induced-subgraph example)

  {:check-outs   '(:x3 :m6 :m10 :m12),
   ;; these are all the external tables that we will need ro access to
   :inputs       '(:t1 :t2 :t5 :t9),
   ;; these are all the tables we need to "shadow" in the workspace schema (previously called outputs)
   :tables       '(:t3 :t4 :t11),
   ;; these are all the transforms we need to execute when running the workspace (replaces "downstream")
   :transforms   '(:x3 :x4 :x11)
   ;; these are the appdb entities that need to be shadowed with "_workspace" versions.
   ;; this excludes the tables, which I'm assuming will be handled separately via sync.
   ;; we might change our mind here and just manually create the metadata along with
   ;; the other entities, if that's easier.
   :entities     '(:x3 :x4 :m6 :m10 :x11 :t11 :m12)
   ;; a mapping from entities that we copy to their dependencies within the subgraph
   ;; they may have other dependencies outside the subgraph, but we ignore these
   ;; as they don't need to be remapped
   :dependencies {:x3  []
                  :x4  [:t3]
                  :m6  [:t4]
                  :m10 []
                  :x11 [:m10]
                  :m12 [:t11]}})
