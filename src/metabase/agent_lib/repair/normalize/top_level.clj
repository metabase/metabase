(ns metabase.agent-lib.repair.normalize.top-level
  "Top-level operation normalization for structured program repair."
  (:require
   [metabase.agent-lib.common.coercions :refer [direction-string?
                                                normalize-direction]]
   [metabase.agent-lib.common.literals :refer [aggregation-form?]]
   [metabase.agent-lib.repair.normalize.forms :as forms]
   [metabase.agent-lib.syntax :as syntax]))

(set! *warn-on-reflection* true)

(defn normalize-with-fields-selection
  "Normalize `with-fields` arguments into a single vector of selections."
  [args]
  (cond
    (empty? args) []

    (= 1 (count args))
    (let [selection (first args)]
      (if (and (sequential? selection)
               (not (syntax/possible-operator-tuple? selection)))
        (vec selection)
        [selection]))

    :else
    (vec args)))

(defn- direction-tuple?
  [value]
  (and (vector? value)
       (= 2 (count value))
       (direction-string? (first value))))

(defn- unwrap-order-by-args
  "Unwrap a single sequential argument into its elements so `[[asc ...] [desc ...]]`
  behaves like `[asc ...] [desc ...]` passed directly. Only unwraps when the inner
  sequence is entirely `[direction value]` tuples so we don't rewrite unrelated
  shapes and break idempotence."
  [args]
  (if (and (= 1 (count args))
           (sequential? (first args))
           (seq (first args))
           (every? direction-tuple? (first args)))
    (vec (first args))
    args))

(defn repair-order-by-operations
  "Normalize one or more `order-by` arguments into canonical operations."
  [args]
  (let [args (unwrap-order-by-args args)]
    (if (empty? args)
      [["order-by"]]
      (loop [remaining args
             repaired  []]
        (if (empty? remaining)
          repaired
          (let [[first-arg second-arg & tail] remaining]
            (cond
              (and (vector? first-arg)
                   (= 2 (count first-arg))
                   (direction-string? (first first-arg)))
              (recur (vec (rest remaining))
                     (conj repaired ["order-by" [(normalize-direction (first first-arg))
                                                 (second first-arg)]]))

              (direction-string? second-arg)
              (recur (vec tail)
                     (conj repaired ["order-by" first-arg (normalize-direction second-arg)]))

              :else
              (recur (vec (rest remaining))
                     (conj repaired ["order-by" first-arg])))))))))

(defn repair-repeated-single-arg-op
  "Expand repeated top-level single-arg operations."
  [op-name args]
  (if (empty? args)
    [[op-name]]
    (mapv (fn [arg] [op-name arg]) args)))

(defn repair-with-fields-operation
  "Extract inline expressions out of `with-fields` before projection."
  [repair-node args]
  (let [selection       (normalize-with-fields-selection args)
        repaired-fields (mapv repair-node selection)
        extracted-exprs (keep (fn [field]
                                (when (forms/expression-definition-tuple? field)
                                  ["expression" (second field) (nth field 2)]))
                              repaired-fields)
        projected       (mapv (fn [field]
                                (if (forms/expression-definition-tuple? field)
                                  ["expression-ref" (second field)]
                                  field))
                              repaired-fields)]
    (into (vec extracted-exprs)
          [["with-fields" projected]])))

(defn bare-aggregation-ref-operation?
  "True when an operation is a bare top-level aggregation-ref."
  [operation]
  (and (vector? operation)
       (= "aggregation-ref" (syntax/canonical-op-name (first operation)))))

(defn- repair-with-embedded
  "Common skeleton: combine repaired direct args with embedded ops, falling back
  to a bare `[[op-name]]` when both are empty."
  [op-name direct-ops embedded-ops]
  (into (or (when (seq direct-ops) direct-ops)
            (when (empty? embedded-ops) [[op-name]])
            [])
        embedded-ops))

(defn- repair-direct-args
  "Dispatch direct-arg repair by operation name."
  [op-name direct-args]
  (case op-name
    "order-by"
    (repair-order-by-operations direct-args)

    ("breakout" "filter" "join")
    (repair-repeated-single-arg-op op-name direct-args)

    ("limit" "with-page")
    [[op-name (first direct-args)]]))

(defn repair-top-level-operation
  "Normalize a top-level operation using the recursive `repair-node` callback."
  [repair-node operation]
  (if-not (vector? operation)
    [operation]
    (let [[raw-op & raw-args] operation
          op-name             (syntax/canonical-op-name raw-op)
          args                (mapv repair-node raw-args)
          embedded-ops        (mapcat #(repair-top-level-operation repair-node %)
                                      (filter syntax/top-level-operation-tuple? args))
          direct-args         (vec (remove syntax/top-level-operation-tuple? args))]
      (case op-name
        "visualization"
        []

        "aggregate"
        (let [keep-bare-aggregation-refs? (not-any? (complement bare-aggregation-ref-operation?)
                                                    direct-args)
              direct-args'                (cond->> direct-args
                                            (not keep-bare-aggregation-refs?)
                                            (remove bare-aggregation-ref-operation?))]
          (repair-with-embedded op-name
                                (when (seq direct-args')
                                  (repair-repeated-single-arg-op op-name direct-args'))
                                embedded-ops))

        "with-fields"
        (repair-with-fields-operation repair-node args)

        ("order-by" "breakout" "filter" "join" "limit" "with-page")
        (repair-with-embedded op-name
                              (when (seq direct-args)
                                (repair-direct-args op-name direct-args))
                              embedded-ops)

        "expression"
        (repair-with-embedded op-name
                              (when (>= (count direct-args) 2)
                                (let [[expr-name expr] (take 2 direct-args)]
                                  (if (aggregation-form? expr)
                                    [["aggregate" expr]]
                                    [[op-name expr-name expr]])))
                              embedded-ops)

        ("append-stage" "drop-stage" "drop-empty-stages")
        [[op-name]]

        (into [(into [op-name] direct-args)]
              embedded-ops)))))
