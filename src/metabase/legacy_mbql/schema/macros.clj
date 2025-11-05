(ns metabase.legacy-mbql.schema.macros
  (:refer-clojure :exclude [run!])
  (:require
   [metabase.legacy-mbql.schema.helpers :as helpers]
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

(defmacro defclause*
  "Like [[defclause]] but takes the schema to register directly instead of building it from arguments."
  [clause-name schema]
  `(helpers/defclause ~(keyword clause-name) ~schema))

(defmacro defclause
  "Define a new MBQL clause. This builds and registers a schema like `:metabase.legacy-mbql.schema/clause-name`.

    (defclause field-id, id ::lib.schema.id/field)

  The first arg is the name of the clause, and should be followed by pairs of arg name, arg schema. Arg schemas may
  optionally be wrapped in `optional` or `rest` to signify that the arg is optional, or to accept varargs:

    (defclause count, field (optional Field))
    (defclause and, filters (rest Filter))"
  [clause-name & arg-names-and-schemas]
  (let [clause-name-kw (keyword clause-name)]
    `(defclause*
       ~clause-name
       (helpers/clause ~clause-name-kw ~@(stringify-names arg-names-and-schemas)))))

(defmacro one-of
  "Define a schema that accepts one of several different MBQL clauses.

    (one-of field-id field-literal)"
  [& clauses]
  (run! #(assert (symbol? %)) clauses)
  `(helpers/one-of*
    ~@(for [clause clauses
            :let [k (helpers/clause-registry-name clause)]]
        k)))
