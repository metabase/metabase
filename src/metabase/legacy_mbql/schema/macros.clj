(ns metabase.legacy-mbql.schema.macros
  (:refer-clojure :exclude [run!])
  (:require
   [metabase.legacy-mbql.schema.helpers]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [run!]]))

(defn- stringify-names [arg-names-and-schemas]
  (into []
        (comp (partition-all 2)
              (mapcat (fn [[arg-name schema]]
                        [(name arg-name) (if (and (list? schema)
                                                  (#{:optional :rest} (keyword (first schema))))
                                           (vec (cons (keyword (first schema)) (rest schema)))
                                           schema)])))
        arg-names-and-schemas))

(defmacro defclause
  "Define a new MBQL clause.

    (defclause field-id, id su/IntGreaterThanZero)

  The first arg is the name of the clause, and should be followed by pairs of arg name, arg schema. Arg schemas may
  optionally be wrapped in `optional` or `rest` to signify that the arg is optional, or to accept varargs:

    (defclause count, field (optional Field))
    (defclause and, filters (rest Filter))

  Since there are some cases where clauses should be parsed differently in MBQL (such as expressions in the
  `expressions` clause vs in aggregations), you can give the actual symbol produced by this macro a different name as
  follows:

    (defclause [ag:+ +] ...) ; define symbol `ag:+` to be used for a `[:+ ...]` clause"
  [clause-name & arg-names-and-schemas]
  (let [[symb-name clause-name] (if (vector? clause-name)
                                  clause-name
                                  [clause-name clause-name])
        clause-name-kw          (keyword clause-name)
        clause-registry-name    (keyword "metabase.legacy-mbql.schema" (name clause-name))]
    `(do
       (mr/register! ~clause-registry-name
                     (metabase.legacy-mbql.schema.helpers/clause ~clause-name-kw ~@(stringify-names arg-names-and-schemas)))
       (def ~(vary-meta symb-name assoc :doc (format "Schema for a valid %s clause." clause-name))
         (with-meta [:ref ~clause-registry-name] {:clause-name ~clause-name-kw})))))

(defmacro one-of
  "Define a schema that accepts one of several different MBQL clauses.

    (one-of field-id field-literal)"
  [& clauses]
  (run! #(assert (symbol? %)) clauses)
  `(metabase.legacy-mbql.schema.helpers/one-of*
    ~@(for [clause clauses
            ;; Ensure that the symbol we inline into the code has no metadata to reduce CLJS bundle size.
            :let [sym (with-meta clause {})]]
        [`(or (:clause-name (meta ~clause))
              '~sym)
         clause])))
