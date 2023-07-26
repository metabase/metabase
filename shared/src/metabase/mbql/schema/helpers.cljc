(ns metabase.mbql.schema.helpers
  (:refer-clojure :exclude [distinct])
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

;;; --------------------------------------------------- defclause ----------------------------------------------------

(defn- clause-arg-schema [arg-schema]
  ;; for things like optional schemas
  (if-not (vector? arg-schema)
    [:schema arg-schema]
    (let [[option arg-schema :as vector-arg-schema] arg-schema]
      (case option
        :optional [:? [:maybe [:schema arg-schema]]]
        :rest     [:* [:schema arg-schema]]
        [:schema vector-arg-schema]))))

(defn clause
  "Impl of [[metabase.mbql.schema.macros/defclause]] macro. Creates a Malli schema."
  [tag & arg-schemas]
  (into
   [:catn
    {:error/message (str "Valid " tag " clause")}
    ["tag" [:= tag]]]
   (for [[arg-name arg-schema] (partition 2 arg-schemas)]
     [arg-name (clause-arg-schema arg-schema)])))


;; TODO - this is a copy of the one in the [[metabase.mbql.util]] namespace. We need to reorganize things a bit so we
;; can use the same fn and avoid circular refs
(defn is-clause?
  "If `x` an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true"
  [k-or-ks x]
  (and
   (vector? x)
   (keyword? (first x))
   (if (coll? k-or-ks)
     ((set k-or-ks) (first x))
     (= k-or-ks (first x)))))

(defn- clause-tag [clause]
  (when (and (vector? clause)
             (keyword? (first clause)))
    (first clause)))

(defn one-of*
  "Interal impl of `one-of` macro."
  [& tags+schemas]
  (into
   [:multi {:dispatch      clause-tag
            :error/message (str "Must be a valid instance of one of these clauses: " (str/join ", " (map first tags+schemas)))}]
   (for [[tag schema] tags+schemas]
     [tag schema])))

(def FieldSemanticOrRelationType
  "Schema for a `:Semantic/*` (or `:Relation/*`, until we fix this) or one of their descendents in the Metabase
  Hierarchical Type System (MHTS)."
  [:or
   [:ref ::lib.schema.common/semantic-type]
   [:ref ::lib.schema.common/relation-type]])

(def KeywordOrString
  "Schema for any keyword or string."
  [:or :keyword :string])

(defn non-empty
  "Add an addditonal constraint to `schema` (presumably an array) that requires it to be non-empty
   (i.e., it must satisfy `seq`)."
  [schema]
  (if (and (sequential? schema)
           (= (first schema) :sequential))
    (let [[_sequential & args] schema
          [options & args]     (if (map? (first args))
                                 args
                                 (cons nil args))]
      (into [:sequential (assoc options :min 1)] args))
    [:and
     schema
     [:fn
      {:error/message "non-empty"}
      seq]]))

(defn empty-or-distinct?
  "True if `coll` is either empty or distinct."
  [coll]
  (if (seq coll)
    (apply distinct? coll)
    true))

(mr/def ::distinct
  [:fn
   {:error/message "distinct"}
   empty-or-distinct?])

(defn distinct
  "Add an additional constraint to `schema` (presumably an array) that requires all elements to be distinct."
  [schema]
  [:and schema [:ref ::distinct]])
