(ns metabase.agent-lib.repair.normalize
  "Deterministic operator and top-level normalization for structured MBQL programs."
  (:require
   [metabase.agent-lib.common.coercions :refer [coerce-positive-int]]
   [metabase.agent-lib.common.literals :refer [scalar-literal?]]
   [metabase.agent-lib.repair.normalize.forms :as normalize.forms]
   [metabase.agent-lib.repair.normalize.top-level :as normalize.top-level]
   [metabase.agent-lib.repair.stages :as stages]
   [metabase.agent-lib.schema :as schema]
   [metabase.agent-lib.syntax :as syntax]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn repair-program
  "Apply deterministic repairs for common structured program mistakes.

  The local `letfn` is intentional here: `repair-node` and `repair-map-node`
  form the minimal mutually recursive kernel for walking arbitrary nested
  structured-program values."
  [program]
  (letfn [(repair-map-node [value]
            (cond
              (schema/program-literal? value)
              (assoc value :program (repair-program (:program value)))

              (and (map? value)
                   (contains? value :type)
                   (contains? value :id))
              (update value :id coerce-positive-int)

              (normalize.forms/field-like-map? value)
              (repair-node (normalize.forms/repair-field-like-map value))

              :else
              (into {}
                    (map (fn [[k v]] [k (repair-node v)]))
                    value)))
          (repair-node [value]
            (cond
              (scalar-literal? value)   value
              (map? value)              (repair-map-node value)
              (syntax/boolean-wrapper-form? value)
              (let [[raw-op arg] value
                    arg'         (repair-node arg)]
                (if (= "true" (some-> raw-op syntax/raw-op-name u/lower-case-en))
                  arg'
                  ["not" arg']))
              (syntax/possible-operator-tuple? value) (normalize.forms/repair-operator-form repair-node value)
              (vector? value)           (mapv repair-node value)
              (sequential? value)       (mapv repair-node value)
              :else                     value))]
    (if-not (map? program)
      program
      (let [source     (let [source (:source program)]
                         (cond
                           (not (map? source))
                           source

                           (= "program" (:type source))
                           (update source :program repair-program)

                           :else
                           (cond-> source
                             (contains? source :id) (update :id coerce-positive-int))))
            operations (into []
                             (mapcat #(normalize.top-level/repair-top-level-operation repair-node %))
                             (:operations program))]
        (assoc program
               :source source
               :operations (stages/insert-stage-boundaries source operations))))))
