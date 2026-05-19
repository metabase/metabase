(ns metabase.agent-lib.join-spec
  "Shared parsing helpers for explicit join clauses."
  (:require
   [metabase.agent-lib.common.coercions :refer [normalize-direction]]
   [metabase.agent-lib.syntax :as syntax]))

(set! *warn-on-reflection* true)

(defn program-field-ref-id
  "Return the field id when `form` is a canonical `[\"field\", id]` tuple."
  [form]
  (when (and (vector? form)
             (= "field" (syntax/canonical-op-name (first form)))
             (pos-int? (second form)))
    (second form)))

(defn parse-join-condition-pair
  "Parse a join equality condition into a `[lhs-id rhs-id]` pair."
  [condition]
  (when (and (vector? condition)
             (= "=" (syntax/canonical-op-name (first condition)))
             (= 3 (count condition)))
    (when-let [lhs-id (program-field-ref-id (second condition))]
      (when-let [rhs-id (program-field-ref-id (nth condition 2))]
        [lhs-id rhs-id]))))

(defn parse-join-spec
  "Parse nested join-clause wrappers into a normalized join-spec map."
  [form]
  (when (vector? form)
    (let [[raw-op & args] form
          op-name         (syntax/canonical-op-name raw-op)]
      (case op-name
        "join-clause"
        (let [target (first args)]
          (when (and (vector? target)
                     (= "table" (syntax/canonical-op-name (first target)))
                     (pos-int? (second target)))
            {:target-table-id (second target)
             :conditions      nil
             :fields-mode     nil
             :strategy        nil
             :alias           nil}))

        "with-join-conditions"
        (when-let [parsed (parse-join-spec (first args))]
          (let [conditions (second args)
                pairs      (when (sequential? conditions)
                             (mapv parse-join-condition-pair conditions))]
            (when (and (seq pairs)
                       (every? some? pairs))
              (assoc parsed :conditions pairs))))

        "with-join-fields"
        (when-let [parsed (parse-join-spec (first args))]
          (assoc parsed :fields-mode (second args)))

        "with-join-strategy"
        (when-let [parsed (parse-join-spec (first args))]
          (assoc parsed :strategy (normalize-direction (second args))))

        "with-join-alias"
        (when-let [parsed (parse-join-spec (first args))]
          (assoc parsed :alias (second args)))

        nil))))

(defn no-explicit-join-fields?
  "True when a join spec does not explicitly request joined fields."
  [fields-mode]
  (or (nil? fields-mode)
      (= "none" fields-mode)
      (= :none fields-mode)))

(defn implicit-join-compatible-fields-mode?
  "True when explicit join fields still match implicit related-field semantics."
  [fields-mode]
  (or (no-explicit-join-fields? fields-mode)
      (= "all" fields-mode)
      (= :all fields-mode)))
