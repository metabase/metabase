(ns metabase.agent-lib.repair.context.passes
  "Context-dependent repair passes for structured programs."
  (:require
   [metabase.agent-lib.common.coercions :refer [coerce-positive-int]]
   [metabase.agent-lib.common.context :as common.context]
   [metabase.agent-lib.common.literals :refer [now-literal?]]
   [metabase.agent-lib.join-spec :as join-spec]
   [metabase.agent-lib.repair.stages :as stages]
   [metabase.agent-lib.syntax :as syntax]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn effective-source-for-context
  "Replace a context source with the concrete metric source when needed."
  [program context]
  (let [source (:source program)]
    (if (and (map? source)
             (= "context" (:type source))
             (common.context/source-metric-id context))
      {:type "metric"
       :id   (common.context/source-metric-id context)}
      source)))

(def ^:private max-tree-walk-depth
  "Maximum depth for tree walks in repair passes."
  64)

(defn operation-contains-canonical-op?
  "True when `operation` contains `target-op-name` anywhere in its tree."
  [operation target-op-name]
  (letfn [(walk [value depth]
            (when (<= depth max-tree-walk-depth)
              (cond
                (and (vector? value)
                     (= target-op-name (syntax/canonical-op-name (first value))))
                true

                (coll? value)
                (some #(walk % (inc depth)) value)

                :else
                false)))]
    (boolean (walk operation 0))))

(defn rewrite-source-stage
  "Rewrite only the operations that belong to the source stage."
  [operations step]
  (:operations
   (reduce (fn [{:keys [operations] :as state} operation]
             (let [op-name (when (vector? operation)
                             (syntax/canonical-op-name (first operation)))]
               (if (= "append-stage" op-name)
                 {:in-source-stage? false
                  :operations       (conj operations operation)}
                 (step state operation))))
           {:in-source-stage? true
            :operations       []}
           operations)))

(defn drop-source-metric-stage-aggregates
  "Drop redundant source-stage aggregates for metric contexts."
  [context operations]
  (if-not (common.context/source-metric-id context)
    operations
    (rewrite-source-stage
     operations
     (fn [{:keys [in-source-stage? operations] :as state} operation]
       (let [drop? (and in-source-stage?
                        (= "aggregate" (syntax/canonical-op-name (first operation)))
                        (not (stages/aggregate-over-aggregation-ref? operation))
                        (not (operation-contains-canonical-op? operation "measure"))
                        (not (operation-contains-canonical-op? operation "metric")))]
         (if drop?
           state
           (assoc state :operations (conj operations operation))))))))

(defn drop-source-metric-stage-with-fields
  "Drop source-stage `with-fields` that only restate aggregation refs."
  [context operations]
  (if-not (common.context/source-metric-id context)
    operations
    (rewrite-source-stage
     operations
     (fn [{:keys [in-source-stage? operations] :as state} operation]
       (let [drop? (and in-source-stage?
                        (= "with-fields" (syntax/canonical-op-name (first operation)))
                        (stages/contains-aggregation-ref? (rest operation)))]
         (if drop?
           state
           (assoc state :operations (conj operations operation))))))))

(defn relative-datetime-form?
  "True when `value` is a relative-datetime form with the given amount and unit."
  [value amount unit]
  (and (vector? value)
       (= "relative-datetime" (syntax/canonical-op-name (first value)))
       (= amount (nth value 1 nil))
       (= unit (some-> (nth value 2 nil) syntax/raw-op-name u/lower-case-en))))

(defn now-form?
  "True when `value` is a now literal or `[\"now\"]` tuple."
  [value]
  (or (now-literal? value)
      (and (vector? value)
           (= "now" (syntax/canonical-op-name (first value))))))

(defn normalize-source-metric-quarter-window
  "Normalize rolling 3-month source-metric windows into quarter-relative bounds."
  [context operation]
  (if (and (common.context/source-metric-id context)
           (vector? operation)
           (= "filter" (syntax/canonical-op-name (first operation)))
           (vector? (second operation))
           (= "between" (syntax/canonical-op-name (first (second operation)))))
    (let [[between-op field lower upper] (second operation)]
      (if (and (relative-datetime-form? lower -3 "month")
               (now-form? upper))
        [(first operation)
         [between-op field
          ["relative-datetime" -1 "quarter"]
          ["relative-datetime" 0 "quarter"]]]
        operation))
    operation))

(defn- edge-value
  [edge kebab-key snake-key]
  (or (get edge kebab-key)
      (get edge snake-key)))

(defn- join-condition-matches-edge?
  [source-id target-id [lhs-id rhs-id] edge]
  (let [from-table-id (edge-value edge :from-table-id :from_table_id)
        from-field-id (edge-value edge :from-field-id :from_field_id)
        to-table-id   (edge-value edge :to-table-id :to_table_id)
        to-field-id   (edge-value edge :to-field-id :to_field_id)]
    (and (or (and (= source-id from-table-id)
                  (= target-id to-table-id))
             (and (= source-id to-table-id)
                  (= target-id from-table-id)))
         (or (and (= lhs-id from-field-id) (= rhs-id to-field-id))
             (and (= lhs-id to-field-id) (= rhs-id from-field-id))))))

(defn- valid-join-operation?
  "True when `operation` is a two-element join tuple."
  [operation]
  (and (vector? operation)
       (= "join" (syntax/canonical-op-name (first operation)))
       (= 2 (count operation))))

(defn- implicit-join-matches-context?
  "True when a parsed join spec matches surrounding context edges."
  [source-id context {:keys [target-table-id conditions fields-mode strategy alias]}]
  (let [surrounding-table-ids (set (keep :id (:surrounding-tables context)))]
    (and (pos-int? target-table-id)
         (surrounding-table-ids target-table-id)
         (nil? alias)
         (or (nil? strategy) (= "left-join" strategy))
         (join-spec/no-explicit-join-fields? fields-mode)
         (= 1 (count conditions))
         (some #(join-condition-matches-edge? source-id target-table-id (first conditions) %)
               (:join-edges context)))))

(defn redundant-implicit-join?
  "True when an explicit join is redundant in the current context."
  [context operation]
  (let [source-id  (common.context/source-table-id context)
        join-spec  (when (valid-join-operation? operation)
                     (join-spec/parse-join-spec (second operation)))]
    (and source-id
         join-spec
         (implicit-join-matches-context? source-id context join-spec))))

(defn- redundant-source-metric-aggregate?
  "True when an aggregate is an exact reuse of the source metric.
  This catches `[\"aggregate\" [\"metric\" source-id]]` which is intentionally preserved
  by `drop-source-metric-stage-aggregates` (that pass only drops non-metric/measure aggregates)."
  [source-id operation]
  (and (vector? operation)
       (= "aggregate" (syntax/canonical-op-name (first operation)))
       (let [aggregation (second operation)]
         (and (vector? aggregation)
              (= "metric" (syntax/canonical-op-name (first aggregation)))
              (= source-id (some-> (second aggregation) coerce-positive-int))))))

(defn remove-redundant-operations
  "Remove context-redundant source-metric reuse and implicit joins."
  [context operations]
  (remove (fn [operation]
            (or (when-let [source-id (common.context/source-metric-id context)]
                  (redundant-source-metric-aggregate? source-id operation))
                (redundant-implicit-join? context operation)))
          operations))
