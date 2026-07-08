(ns metabase.legacy-mbql.schema.helpers
  (:refer-clojure :exclude [distinct not-empty #?(:clj for)])
  (:require
   [clojure.string :as str]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.util :as lib.util]
   [metabase.types.core]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [not-empty #?(:clj for)]]))

(comment metabase.types.core/keep-me)

(defn clause-registry-name
  "The schema name in the Malli registry for an MBQL 4 clause."
  [clause-name]
  (keyword "metabase.legacy-mbql.schema" (name clause-name)))

(defn defclause
  "Impl for [[defclause*]]."
  [clause-name schema]
  (assert (not (vector? clause-name)))
  (let [clause-name   (keyword clause-name)
        registry-name (clause-registry-name clause-name)]
    (mr/def
      registry-name
      (lib.util/format "Schema for a valid MBQL 4 %s clause." clause-name)
      schema)))

(defn possibly-unnormalized-mbql-clause?
  "True if `x` is a (possibly not-yet-normalized) MBQL 4 clause (a sequence with a keyword as its first arg)."
  [x]
  (and (sequential? x)
       (not (map-entry? x))
       ((some-fn simple-keyword? string?) (first x))))

(defn normalized-mbql-clause?
  "True if `x` is a **normalized** MBQL 4 clause."
  [x]
  (and (vector? x)
       (simple-keyword? (first x))))

(defn normalize-keyword
  "Like [[lib.schema.common/normalize-keyword]] but also converts the keyword to lower-kebabcase (this is needed in
  legacy MBQL because MBQL 1 used uppercase/snake_case keywords in some cases; Lib does not accept MBQL 1 as an input
  directly (it is normalized to MBQL 4 first)."
  [x]
  (some-> x lib.schema.common/memoized-kebab-key))

(defn is-clause?
  "If `x` is an MBQL 4 clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true"
  [k-or-ks x]
  (and
   (possibly-unnormalized-mbql-clause? x)
   (let [k (normalize-keyword (first x))]
     (if (coll? k-or-ks)
       ((set k-or-ks) k)
       (= k-or-ks k)))))

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

(defn clause
  "Impl of [[metabase.legacy-mbql.schema.macros/defclause]] macro. Creates a Malli schema."
  [tag & arg-schemas]
  [:and
   {:description (str "schema for a valid MBQL 4 " tag " clause")}
   [:fn
    {:error/message    (str "must be a `" tag "` clause")
     :decode/normalize (fn [x]
                         (when (and (sequential? x)
                                    ((some-fn simple-keyword? string?) (first x)))
                           (update (vec x) 0 normalize-keyword)))}
    (partial is-clause? tag)]
   (into
    [:catn
     ["tag" [:= {:decode/normalize normalize-keyword} tag]]]
    (for [[arg-name arg-schema] (partition 2 arg-schemas)]
      [arg-name (clause-arg-schema arg-schema)]))])

(defn actual-clause-tag
  "Actual tag of the clause, even if it's one of the MBQL 3 tags removed in MBQL 4. In most cases you want to
  use [[effective-clause-tag]] instead."
  [a-clause]
  (when (possibly-unnormalized-mbql-clause? a-clause)
    (normalize-keyword (first a-clause))))

(defn effective-clause-tag
  "Corresponding MBQL 4 clause tag -- MBQL 3 clauses removed in MBQL 4 are mapped to the equivalent MBQL 4 clause tags."
  [a-clause]
  (when-let [tag (actual-clause-tag a-clause)]
    ;; MBQL 3 field clauses should all get treated as `:field`, which is the MBQL 4 equivalent of all of them.
    (case tag
      :field-literal    :field
      :datetime-field   :field
      :field-id         :field
      :binning-strategy :field
      :fk->             :field
      :joined-field     :field
      :named            :aggregation-options
      tag)))

(defn one-of*
  "Internal impl of `one-of` macro."
  [& schemas]
  (into
   [:multi {:dispatch      effective-clause-tag
            :error/message (str "valid instance of one of these MBQL clauses: " (str/join ", " (map name schemas)))}]
   (for [schema schemas]
     [(keyword (name schema)) [:ref schema]])))

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
      {:error/message    "non-empty"
       :decode/normalize not-empty}
      seq]]))

(defn empty-or-distinct?
  "True if `coll` is either empty or distinct."
  [coll]
  (if (seq coll)
    (apply distinct? coll)
    true))

(mr/def ::distinct
  [:fn
   {:description      "values must be distinct"
    :error/message    "distinct"
    :decode/normalize (fn [x]
                        (when (sequential? x)
                          (into [] (clojure.core/distinct) x)))}
   empty-or-distinct?])

(defn distinct
  "Add an additional constraint to `schema` (presumably an array) that requires all elements to be distinct."
  [schema]
  [:and
   schema
   [:ref ::distinct]])
