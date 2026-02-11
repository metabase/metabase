(ns metabase.transforms-inspector.lens.query-util
  "Shared utilities for manipulating preprocessed pMBQL queries in lens code.")

(set! *warn-on-reflection* true)

(defn query-with-n-joins
  "Copy of `query` retaining only the first `n` joins."
  [query n]
  (if (zero? n)
    (update-in query [:stages 0] dissoc :joins)
    (update-in query [:stages 0 :joins] #(vec (take n %)))))

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
