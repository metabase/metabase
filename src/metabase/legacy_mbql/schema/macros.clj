(ns metabase.legacy-mbql.schema.macros
  (:require
   [metabase.legacy-mbql.schema.helpers]
   [metabase.util.malli.registry :as mr]))

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
                                  [clause-name (or (:clause-name (meta clause-name)) clause-name)])
        clause-registry-name    (keyword "metabase.legacy-mbql.schema" (name symb-name))]
    `(do
       (mr/register! ~clause-registry-name
                     (metabase.legacy-mbql.schema.helpers/clause ~(keyword clause-name) ~@(stringify-names arg-names-and-schemas)))
       (def ~(vary-meta symb-name assoc
                        :clause-name (keyword clause-name)
                        :clause-form (into [(keyword clause-name)]
                                           (mapcat (fn [[arg schema]]
                                                     [(keyword arg) `'~schema])
                                                   (partition 2 arg-names-and-schemas)))
                        :doc         (format "Schema for a valid %s clause." clause-name))
         [:ref ~clause-registry-name]))))

(defmacro one-of
  "Define a schema that accepts one of several different MBQL clauses.

    (one-of field-id field-literal)"
  [& clauses]
  `(metabase.legacy-mbql.schema.helpers/one-of*
    ~@(for [clause clauses]
        [`(or (:clause-name (meta (resolve '~clause)))
              '~clause)
         clause])))
