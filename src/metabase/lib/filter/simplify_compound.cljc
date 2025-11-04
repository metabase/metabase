(ns metabase.lib.filter.simplify-compound
  (:refer-clojure :exclude [some empty?])
  (:require
   [medley.core :as m]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.mbql-clause :as lib.schema.mbql-clause]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [some empty?]]))

(mr/def ::mbql-clause
  "An MBQL clause that may not be well-formed, e.g. an `:and` clause with only one arg."
  [:schema
   [:cat
    keyword?
    map?
    [:+ any?]]])

(mu/defn- combine-compound-filters-of-type :- [:sequential [:maybe ::mbql-clause]]
  [tag     :- [:enum :and :or]
   clauses :- [:sequential ::mbql-clause]]
  (loop [acc [], [clause & more] clauses]
    (cond
      (and (not clause)
           (seq more))
      (recur acc more)

      (and (not clause)
           (empty? more))
      acc

      (lib.util/clause-of-type? clause tag)
      (recur acc (concat (drop 2 clause) more))

      :else
      (recur (conj acc clause) more))))

(declare simplify-compound-filter)

(mu/defn- simplify-and-or-filter :- [:maybe ::lib.schema.mbql-clause/clause]
  [tag  :- [:enum :and :or]
   opts :- :map
   args]
  (let [args (m/distinct-by lib.schema.util/mbql-clause-distinct-key (filter some? args))]
    (case (count args)
      ;; an empty filter, toss it
      0 nil
      ;; single arg, unwrap it
      1 (simplify-compound-filter (first args))
      ;; else
      (if (some #(lib.util/clause-of-type? % tag) args)
        ;; clause of the same type embedded, flatten it
        (recur tag opts (combine-compound-filters-of-type tag args))
        ;; simplify the arguments
        (let [simplified (map simplify-compound-filter args)]
          (if (= simplified args)
            ;; no change
            (into [tag opts] args)
            ;; there is a change, we might be able to simplify even further
            (recur tag opts simplified)))))))

(mu/defn simplify-compound-filter :- ::lib.schema.util/unique-uuids
  "Simplify compound `:and`, `:or`, and `:not` compound filters, combining or eliminating them where possible. This
  also fixes theoretically disallowed compound filters like `:and` with only a single subclause, and eliminates `nils`
  and duplicate subclauses from the clauses."
  [x]
  (lib.util.match/replace x
    ;; double negation, eliminate both
    [:not opts [:not arg-opts arg-arg]]
    (recur
     ;; preserve options from the collapsed clauses.
     (lib.options/update-options arg-arg merge arg-opts opts))

    ;; use de Morgan's law to push the negation down
    [:not opts [:and arg-opts & arg-args]]
    (simplify-and-or-filter :or (merge arg-opts opts) (map lib.filter/not arg-args))

    [:not opts [:or arg-opts & arg-args]]
    (simplify-and-or-filter :and (merge arg-opts opts) (map lib.filter/not arg-args))

    [:and opts & args]
    (simplify-and-or-filter :and opts args)

    [:or opts & args]
    (simplify-and-or-filter :or opts args)))

(defn simplify-filters
  "Simplify multiple filters, combining them into fewer if possible and deduplicating them."
  [clauses]
  ;; combine into one `:and` clause, simplify with [[simplify-compound-filter]], then pull out the simplified
  ;; subclauses
  (case (count clauses)
    0
    clauses

    1
    [(simplify-compound-filter (first clauses))]

    #_else
    (let [[tag _opts & args, :as simplified] (simplify-compound-filter (apply lib.filter/and clauses))]
      (if (= tag :and)
        (vec args)
        ;; simplified to a single clause
        [simplified]))))
