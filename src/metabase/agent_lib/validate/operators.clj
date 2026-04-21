(ns metabase.agent-lib.validate.operators
  "Operator-specific semantic validation for structured programs."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.capabilities :as capabilities]
   [metabase.agent-lib.common.context :as common.context]
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.common.literals :refer [aggregation-form?
                                               bare-field-id?
                                               non-blank-string?]]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.syntax :as syntax]))

(set! *warn-on-reflection* true)

(def ^:private field-wrapper-required-arg-positions
  "Argument positions that must be wrapped as `[\"field\", id]` for specific helpers."
  '{sum [0]
    avg [0]
    min [0]
    max [0]
    distinct [0]
    median [0]
    stddev [0]
    var [0]
    percentile [0]
    cum-sum [0]
    sum-where [0]
    distinct-where [0]})

(defn ensure-arity!
  "Validate a helper arity against the capability catalog."
  [path op arg-count]
  (when-let [allowed (capabilities/fixed-arities op)]
    (when-not (allowed arg-count)
      (invalid-program! path
                        (if (and (= op 'expression) (= arg-count 1))
                          (str "`expression` is a top-level operation, not a nested reference. "
                               "Use `[\"expression\", \"Name\", expr]` as its own operation, and if you need to "
                               "sort by that calculation, reuse the expression body directly inside `order-by`.")
                          (format "operator `%s` expects %s argument(s), got %s"
                                  (name op)
                                  (str/join " or " (sort allowed))
                                  arg-count))
                        {:operator (name op)
                         :allowed  (sort allowed)
                         :actual   arg-count}))))

(defn validate-operator-specific!
  "Validate nested helper tuples against context-derived ids and operator rules."
  [allowed-ids context path value]
  (when (syntax/operator-tuple? value)
    (let [[raw-op & args] value
          op             (runtime/op-symbol raw-op)
          op-name        (name op)]
      (cond
        (syntax/top-level-operation-symbols op)
        (invalid-program! path
                          (format "`%s` is a top-level operation and cannot be nested" op-name)
                          {:operator op-name})

        (= op 'query)
        (invalid-program! path
                          "`query` cannot appear inside operations; the program source already defines the base query."
                          {:operator "query"})

        :else
        (do
          (doseq [arg-position (get field-wrapper-required-arg-positions op)]
            (when (bare-field-id? (nth args arg-position nil))
              (invalid-program! (conj path (inc arg-position))
                                (str "Wrap field ids with `[\"field\", id]` inside `" op-name "`. "
                                     "Do not pass bare numeric ids directly to aggregation helpers.")
                                {:operator       op-name
                                 :retry-category :field-wrapper
                                 :value          (nth args arg-position)})))
          (case op-name
            "case"
            (when (some-> args second map?)
              (when (or (contains? (second args) :default)
                        (contains? (second args) "default"))
                (invalid-program! (conj path 2)
                                  "`case` uses the fallback value itself as the optional third argument. Do not use `{\"default\": ...}`. Omit the third argument instead of using null."
                                  {:operator "case"})))

            "table"
            (let [id (first args)]
              (when-not (pos-int? id)
                (invalid-program! (conj path 1) "table lookup requires a numeric id")))

            "card"
            (let [id (first args)]
              (when-not (pos-int? id)
                (invalid-program! (conj path 1) "card lookup requires a numeric id"))
              (when-not ((:card-ids allowed-ids) id)
                (invalid-program! (conj path 1)
                                  "card id is not available in the provided context"
                                  {:operator "card" :id id})))

            "metric"
            (let [id (first args)]
              (when-not (pos-int? id)
                (invalid-program! (conj path 1) "metric lookup requires a numeric id"))
              (when-not ((:metric-ids allowed-ids) id)
                (invalid-program! (conj path 1)
                                  "metric id is not available in the provided context"
                                  {:operator "metric" :id id})))

            "measure"
            (let [id        (first args)
                  source-id (common.context/source-metric-id context)]
              (when-not (pos-int? id)
                (invalid-program! (conj path 1) "measure lookup requires a numeric id"))
              (when (and source-id (= source-id id))
                (invalid-program! (conj path 1)
                                  (str "source is already metric " source-id
                                       ". Metric ids are not measure ids. Do not reference that same "
                                       "metric as a `measure`; start from the source query and build on it.")
                                  {:operator         "measure"
                                   :id               id
                                   :source-metric-id source-id}))
              (when-not ((:measure-ids allowed-ids) id)
                (invalid-program! (conj path 1)
                                  "measure id is not available in the provided context"
                                  {:operator "measure" :id id})))

            "field"
            (cond
              (not= 1 (count args))
              (invalid-program! path "field lookups must use a single numeric field id")

              (not (pos-int? (first args)))
              (invalid-program! (conj path 1) "field lookup requires a numeric id"))

            "expression-ref"
            (let [expr-name (first args)]
              (when-not (non-blank-string? expr-name)
                (invalid-program! (conj path 1)
                                  "expression-ref requires a non-blank expression name"
                                  {:operator "expression-ref"})))

            "aggregation-ref"
            (let [index (first args)]
              (when-not (and (int? index) (<= 0 index))
                (invalid-program! (conj path 1)
                                  "aggregation-ref requires a zero-based aggregation index"
                                  {:operator "aggregation-ref"
                                   :value    index})))

            nil))))))

(defn validate-top-level-operation!
  "Validate a top-level operation and its arguments."
  [validate-node operation-path operation state]
  (let [[raw-op & args] operation
        op             (runtime/op-symbol raw-op)]
    (when-not (syntax/top-level-operation-symbols op)
      (invalid-program! (conj operation-path 0)
                        "top-level operation is not allowed"
                        {:operator raw-op}))
    (ensure-arity! operation-path op (count args))
    (when (= op 'aggregate)
      (doseq [[idx arg] (map-indexed vector args)]
        (when-not (aggregation-form? arg)
          (invalid-program! (conj operation-path (inc idx))
                            "aggregate operations require aggregation helpers like `count`, `sum`, `avg`, `percentile`, `metric`, or `measure`. Do not pass bare `aggregation-ref` or breakout clauses directly."
                            {:operator "aggregate"
                             :value    arg}))))
    (reduce (fn [state [idx arg]]
              (validate-node (conj operation-path (inc idx)) arg 1 state))
            state
            (map-indexed vector args))))
