(ns metabase.mbql.schema.helpers
  (:require [clojure.string :as str]
            [schema.core :as s]))

;;; --------------------------------------------------- defclause ----------------------------------------------------

(defn- clause-arg-schema [arg-name arg-schema]
  ;; for things like optional schemas
  (if-not (vector? arg-schema)
    (s/one arg-schema arg-name)
    (let [[option arg-schema :as vector-arg-schema] arg-schema]
      (case option
        :optional (s/optional (s/maybe arg-schema) arg-name)
        :rest     (s/named arg-schema arg-name)
        (s/one vector-arg-schema arg-name)))))

(defn clause
  "Impl of `defclause` macro."
  [clause-name & arg-schemas]
  (vec
   (cons
    (s/one (s/eq clause-name) clause-name)
    (for [[arg-name arg-schema] (partition 2 arg-schemas)]
      (clause-arg-schema arg-name arg-schema)))))

(defn- stringify-names [arg-names-and-schemas]
  (reduce concat (for [[arg-name schema] (partition 2 arg-names-and-schemas)]
                   [(name arg-name) (if (and (list? schema)
                                             (#{:optional :rest} (keyword (first schema))))
                                      (vec (cons (keyword (first schema)) (rest schema)))
                                      schema)])))

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
                                  [clause-name clause-name])]
    `(def ~(vary-meta symb-name assoc
                      :clause-name (keyword clause-name)
                      :doc         (format "Schema for a valid %s clause." clause-name))
       (clause ~(keyword clause-name) ~@(stringify-names arg-names-and-schemas)))))


;;; ----------------------------------------------------- one-of -----------------------------------------------------

;; TODO - this is a copy of the one in the `metabase.mbql.util` namespace. We need to reorganize things a bit so we
;; can use the same fn and avoid circular refs
(defn is-clause?
  "If `x` an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true"
  [k-or-ks x]
  (and
   (sequential? x)
   (keyword? (first x))
   (if (coll? k-or-ks)
     ((set k-or-ks) (first x))
     (= k-or-ks (first x)))))

(defn one-of*
  "Interal impl of `one-of` macro."
  [& clause-names+schemas]
  (s/named
   (apply
    s/conditional
    (reduce concat (for [[clause-name schema] clause-names+schemas]
                     [(partial is-clause? clause-name) schema])))
   (str "Must be a valid instance of one of these clauses: " (str/join ", " (map first clause-names+schemas)))))

(defmacro one-of
  "Define a schema that accepts one of several different MBQL clauses.

    (one-of field-id field-literal)"
  [& clauses]
  `(one-of* ~@(for [clause clauses]
                [`(:clause-name (meta (resolve '~clause))) clause])))
