(ns metabase.transforms-inspector.lens.query-util
  "Shared utilities for manipulating preprocessed pMBQL queries in lens code."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(defn bare-query-with-n-joins
  "Stripped-down copy of `query` retaining only `:source-table` and the first `n` joins.
   All other stage keys (`:fields`, `:filters`, `:breakout`, etc.) are removed."
  [query n]
  (lib/update-query-stage query 0
                          (fn [stage]
                            (cond-> (select-keys stage [:lib/type :source-table :joins])
                              (zero? n) (dissoc :joins)
                              (pos? n)  (update :joins #(vec (take n %)))))))

(defn extract-field-info
  "Extract `{:field-id ... :join-alias ...}` from a `:field` ref clause.
   `:join-alias` will be nil for base-table fields."
  [[tag opts id-or-name :as field-ref]]
  (when (and (vector? field-ref)
             (= :field tag)
             (map? opts))
    {:field-id   id-or-name
     :join-alias (:join-alias opts)}))

(defn get-rhs-field-info
  "Field info for the RHS (joined-table side) of the first join condition."
  [conditions]
  (when-let [[_op _opts _lhs rhs] (first conditions)]
    (let [info (extract-field-info rhs)]
      (when (:join-alias info)
        info))))

(defn get-lhs-field-info
  "Field info for the LHS (base or previously-joined side) of the first join condition."
  [conditions]
  (when-let [[_op _opts lhs _rhs] (first conditions)]
    (extract-field-info lhs)))
