(ns metabase-enterprise.workspaces.dag
  (:require
   [clojure.set :as set]
   [flatland.ordered.map :as ordered-map]
   [toucan2.core :as t2]))

;;;; Internal helpers

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

;;;; Toposort

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
  (let [all-nodes (set (keys child->parents))]
    (loop [visited   #{}
           result    []
           remaining all-nodes]
      (if (empty? remaining)
        result
        (let [node (first remaining)
              [visited' result'] (toposort-visit node child->parents visited result)]
          (recur visited' result' (disj remaining node)))))))

;;;; Transitive closure queries

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

(defn- upstream-entities
  "Given a map of entity types to IDs, find all upstream entities (dependencies).
   Returns a set of {:id :type} maps."
  [entities-by-type]
  (transitive-closure entities-by-type :upstream))

(defn- downstream-entities
  "Given a map of entity types to IDs, find all downstream entities (dependents).
   Returns a set of {:id :type} maps."
  [entities-by-type]
  (transitive-closure entities-by-type :downstream))

;;;; Dependency fetching

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

(defn- toposort-key-fn [ordering]
  (let [index-map (zipmap ordering (range))
        index-of  #(get index-map % Integer/MAX_VALUE)]
    (fn [e]
      [(index-of e) (:type e) (:id e)])))

(defn- table? [entity] (= :table (:type entity)))

(defn- transform? [entity] (= :transform (:type entity)))

;;;; Public API

(defn path-induced-subgraph
  "Given a map of entity types to IDs, compute the path-induced subgraph.
   `entities-by-type` is a map like {:transform [1 2 3]}.

   Returns a map with:
   - :check-outs   - the entities we want to make editable within the workspace, in topological order
   - :inputs       - external tables that entities in the subgraph depend on, ordered by id
   - :outputs      - output tables generated by entities in the subgraph, in topological order
   - :transforms   - transforms in the subgraph, in topological order
   - :dependencies - map from each subgraph entity to its dependencies within subgraph, in topological order"
  [entities-by-type]
  (let [starting-set  (tuples->entity-set (entities-map->tuples entities-by-type))
        upstream      (or (upstream-entities entities-by-type) #{})
        downstream    (or (downstream-entities entities-by-type) #{})
        subgraph      (set/intersection upstream downstream)
        transforms    (filterv transform? subgraph)
        output-tables (or (fetch-related-tables transforms :downstream) [])
        inputs        (->> upstream
                           (filter table?)
                           (remove subgraph)
                           (sort-by :id)
                           vec)
        deps-map      (entity-dependencies subgraph)
        sorted        (toposort-entities subgraph deps-map)
        ;; Right now, this doesn't quite yield the comparator we want, since we have a partial ordering, and the
        ;; toposort is rather arbitrary in this regard. It also excludes the upstream and downstream dependencies.
        ;; What we'd prefer is to have the following:
        ;; 1. Dependencies come before their dependents.
        ;; 2. For independent nodes, order by type (tables before transforms), then by ID.
        sort-key-fn   (toposort-key-fn sorted)]
    {:check-outs   (vec (sort-by sort-key-fn starting-set))
     ;; By definition, these are all tables, and all external to the subgraph, so ID is the only thing to sort by.
     ;; Ideally, they'd be ordered by their own dependency relationships too, but for now this is good enough.
     :inputs       (vec (sort-by :id inputs))
     :outputs      (vec (sort-by sort-key-fn output-tables))
     :transforms   (vec (sort-by sort-key-fn transforms))
     :dependencies (into (ordered-map/ordered-map)
                         (keep (fn [entity]
                                 (when-not (table? entity)
                                   [entity (vec (get deps-map entity []))])))
                         sorted)}))
