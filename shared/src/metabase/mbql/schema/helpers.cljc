(ns metabase.mbql.schema.helpers
  (:refer-clojure :exclude [distinct])
  (:require [clojure.string :as str]
            metabase.types
            [schema.core :as s]))

(comment metabase.types/keep-me)

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

(def NonBlankString
  "Schema for a string that isn't blank."
  (s/constrained s/Str (complement str/blank?) "Non-blank string"))

(def FieldType
  "Schema for `:type/*` or one of its descendants in the Metabase type hierarchy."
  (s/pred #(isa? % :type/*) "Valid field type"))

(def FieldSemanticOrRelationType
  "Schema for a `:Semantic/*` (or `:Relation/*`, until we fix this) or one of their descendents in the Metabase
  Hierarchical Type System (MHTS)."
  (s/pred (fn [k]
            (or (isa? k :Semantic/*)
                (isa? k :Relation/*)))
          "Valid semantic type"))

(def IntGreaterThanZero
  "Schema for a positive integer."
  (s/constrained s/Int pos? "positive integer"))

(def IntGreaterThanOrEqualToZero
  "Schema for an integer >= zero."
  (s/constrained s/Int (complement neg?) "integer >= 0"))

(def Map
  "Schema for any map."
  {s/Any s/Any})

(def KeywordOrString
  "Schema for any keyword or string."
  (s/cond-pre s/Keyword s/Str))

(defn non-empty
  "Add an addditonal constraint to `schema` (presumably an array) that requires it to be non-empty
   (i.e., it must satisfy `seq`)."
  [schema]
  (s/constrained schema seq "Non-empty"))

(defn empty-or-distinct?
  "True if `coll` is either empty or distinct."
  [coll]
  (if (seq coll)
    (apply distinct? coll)
    true))

(defn distinct
  "Add an additional constraint to `schema` (presumably an array) that requires all elements to be distinct."
  [schema]
  (s/constrained schema empty-or-distinct? "distinct"))
