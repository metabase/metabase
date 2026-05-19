(ns metabase.agent-lib.capabilities.derived
  "Derived views over the structured capability catalog.")

(set! *warn-on-reflection* true)

(defn guidance
  "Return prompt and retry guidance metadata for a capability entry."
  [capability]
  (:guidance capability))

(defn prompt-forms
  "Return documented prompt forms for a capability entry."
  [capability]
  (get-in capability [:guidance :prompt-forms]))

(defn prompt-notes
  "Return documented prompt notes for a capability entry."
  [capability]
  (get-in capability [:guidance :prompt-notes]))

(defn guidance-shape
  "Return the documented canonical call shape for a capability entry."
  [capability]
  (get-in capability [:guidance :shape]))

(defn guidance-example
  "Return the documented example program fragment for a capability entry."
  [capability]
  (get-in capability [:guidance :example]))

(defn capability-by-op
  "Index capability entries by operator symbol."
  [capability-catalog]
  (into {}
        (map (fn [capability]
               [(:op capability) capability]))
        capability-catalog))

(defn fixed-arities
  "Index declared helper arities by operator symbol."
  [capability-catalog]
  (into {}
        (keep (fn [{:keys [op arities]}]
                (when arities
                  [op arities])))
        capability-catalog))

(defn trusted-helper-bindings
  "Index trusted helper implementations by operator symbol."
  [capability-catalog]
  (into {}
        (keep (fn [{:keys [op binding]}]
                (when binding
                  [op binding])))
        capability-catalog))

(defn query-transform-symbols
  "Return the top-level query-transform operators."
  [capability-catalog]
  (into #{}
        (comp (filter #(= (:kind %) :top-level))
              (map :op))
        capability-catalog))

(defn helper-symbols
  "Return all helper symbols accepted by the structured evaluator."
  [capability-catalog synthetic-helper-symbols]
  (into synthetic-helper-symbols
        (comp (filter #(or (:binding %)
                           (:runtime-provided? %)))
              (map :op))
        capability-catalog))

(defn nested-operator-values
  "Return canonical string names for nested operators."
  [capability-catalog]
  (into #{}
        (comp (filter #(= (:kind %) :nested))
              (map (comp name :op)))
        capability-catalog))

(defn top-level-operator-values
  "Return canonical string names for top-level operations."
  [capability-catalog]
  (into #{}
        (comp (filter #(= (:kind %) :top-level))
              (map (comp name :op)))
        capability-catalog))

(defn operator-guidance-catalog
  "Return retry guidance keyed by canonical operator name."
  [capability-catalog]
  (into {}
        (keep (fn [{:keys [op] :as capability}]
                (let [{:keys [shape example retry-shape retry-example]} (guidance capability)]
                  (when-let [guidance-shape (or retry-shape shape)]
                    [(name op) {:shape guidance-shape
                                :example (or retry-example example)}]))))
        capability-catalog))
