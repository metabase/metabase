(ns metabase.lib.filter.negate
  (:require
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.desugar :as lib.filter.desugar]
   [metabase.lib.filter.simplify-compound :as lib.filter.simplify-compound]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defmulti ^:private negate*
  {:arglists '([mbql-clause])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod negate* :default
  [x]
  (lib.filter/not x))

(defmethod negate* :not
  [[_tag _opts subclause]]
  subclause)

(defmethod negate* :and
  [[_tag _opts & subclauses]]
  (apply lib.filter/or (map negate* subclauses)))

(defmethod negate* :or
  [[_tag _opts & subclauses]]
  (apply lib.filter/and (map negate* subclauses)))

(defmethod negate* :=  [[_tag _opts x value]] (lib.filter/!= x value))
(defmethod negate* :!= [[_tag _opts x value]] (lib.filter/=  x value))
(defmethod negate* :>  [[_tag _opts x value]] (lib.filter/<= x value))
(defmethod negate* :<  [[_tag _opts x value]] (lib.filter/>= x value))
(defmethod negate* :>= [[_tag _opts x value]] (lib.filter/<  x value))
(defmethod negate* :<= [[_tag _opts x value]] (lib.filter/>  x value))

(defmethod negate* :between
  [[_tag _opts x min-value max-value]]
  (lib.filter/or
   (lib.filter/< x min-value)
   (lib.filter/> (lib.util/fresh-uuids x) max-value)))

(defmethod negate* :contains    [clause] (lib.filter/not clause))
(defmethod negate* :starts-with [clause] (lib.filter/not clause))
(defmethod negate* :ends-with   [clause] (lib.filter/not clause))

(mu/defn negate-boolean-expression :- [:and
                                       [:ref ::lib.schema.expression/boolean]
                                       [:ref ::lib.schema.util/unique-uuids]]
  "Logically negate a boolean expression (presumably a filter clause)."
  [boolean-expression :- ::lib.schema.expression/boolean]
  (let [expression' (-> boolean-expression
                        lib.filter.desugar/desugar-filter-clause
                        negate*
                        lib.filter.simplify-compound/simplify-compound-filter)]
    (if (= expression' boolean-expression)
      boolean-expression
      ;; preserve the options of the original clause, in case it has something important like `:lib/expression-name`
      (lib.options/update-options expression' merge (dissoc (lib.options/options boolean-expression) :lib/uuid)))))
