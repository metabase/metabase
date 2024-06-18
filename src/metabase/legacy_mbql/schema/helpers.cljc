(ns metabase.legacy-mbql.schema.helpers
  (:refer-clojure :exclude [distinct])
  (:require
   [clojure.string :as str]
   [metabase.types]
   [metabase.util.malli.registry :as mr]))

(comment metabase.types/keep-me)

;;; --------------------------------------------------- defclause ----------------------------------------------------

(defn- wrap-clause-arg-schema [arg-schema]
  [:schema (if (qualified-keyword? arg-schema)
             [:ref arg-schema]
             arg-schema)])

(defn- clause-arg-schema [arg-schema]
  ;; for things like optional schemas
  (if-not (vector? arg-schema)
    (wrap-clause-arg-schema arg-schema)
    (let [[option arg-schema :as vector-arg-schema] arg-schema]
      (case option
        :optional [:? [:maybe (wrap-clause-arg-schema arg-schema)]]
        :rest     [:* (wrap-clause-arg-schema arg-schema)]
        (wrap-clause-arg-schema vector-arg-schema)))))

;; TODO - this is a copy of the one in the [[metabase.legacy-mbql.util]] namespace. We need to reorganize things a bit
;; so we can use the same fn and avoid circular refs
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

(defn clause
  "Impl of [[metabase.legacy-mbql.schema.macros/defclause]] macro. Creates a Malli schema."
  [tag & arg-schemas]
  [:and
   {:doc/title [:span [:code (pr-str tag)] " clause"]}
   [:fn
    {:error/message (str "must be a `" tag "` clause")}
    (partial is-clause? tag)]
   (into
    [:catn
     ["tag" [:= tag]]]
    (for [[arg-name arg-schema] (partition 2 arg-schemas)]
      [arg-name (clause-arg-schema arg-schema)]))])

(defn- clause-tag [a-clause]
  (when (and (vector? a-clause)
             (keyword? (first a-clause)))
    (first a-clause)))

(defn one-of*
  "Interal impl of `one-of` macro."
  [& tags+schemas]
  (into
   [:multi {:dispatch      clause-tag
            :error/message (str "valid instance of one of these MBQL clauses: " (str/join ", " (map first tags+schemas)))
            :doc/schema    (into
                            [:or
                             {:doc/message "valid instance of one of these MBQL clauses:"}]
                            (map second)
                            tags+schemas)}]
   (for [[tag schema] tags+schemas]
     [tag (if (qualified-keyword? schema)
            [:ref schema]
            schema)])))

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
   {:doc/message   "values must be distinct"
    :error/message "distinct"}
   empty-or-distinct?])

(defn distinct
  "Add an additional constraint to `schema` (presumably an array) that requires all elements to be distinct."
  [schema]
  [:and
   schema
   [:ref ::distinct]])
