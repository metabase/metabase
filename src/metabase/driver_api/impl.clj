(ns metabase.driver-api.impl
  {:clj-kondo/config
   '{:linters
     {:discouraged-namespace {metabase.query-processor.store {:level :off}}
      :deprecated-namespace  {:exclude [metabase.query-processor.store]}}}}
  (:require
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.util.nest-query :as nest-query]
   [metabase.util :as u]
   [toucan2.core :as t2]))

;;; replacement for the old [[metabase.query-processor.store/cached]] macro, deprecated in 57
;;;
;;; TODO (Cam 9/10/25) -- this is just kicking the can down the road a bit, since eventually we'll probably want to
;;; remove this too in favor of using [[metabase.lib.metadata/general-cached-value]] directly -- since the plan is
;;; eventually to do away with the entire [[metabase.query-processor.store]] namespace (you can pass in the MBQL 5
;;; query to `general-cached-value` instead)
(defmacro cached
  "Cache the value of `body` for key(s) for the duration of this QP execution. (Body is only evaluated the once per QP
  run; subsequent calls return the cached result.)

  Note that each use of `cached` generates its own unique first key for cache keyseq; thus while it is not possible to
  share values between multiple `cached` forms, you do not need to worry about conflicts with other places using this
  macro.

    ;; cache lookups of Card.dataset_query
    (driver-api/cached card-id
      (t2/select-one-fn :dataset_query Card :id card-id))"
  {:style/indent 1}
  [k-or-ks & body]
  (let [ks (into [(list 'quote (gensym (str (name (ns-name *ns*)) "/misc-cache-")))] (u/one-or-many k-or-ks))]
    `(lib.metadata/general-cached-value
      (qp.store/metadata-provider)
      ~ks
      (fn [] ~@body))))

(defn mbql-clause?
  "True if `x` is an MBQL clause (a sequence with a keyword as its first arg)."
  [x]
  (and (sequential? x)
       (not (map-entry? x))
       (keyword? (first x))))

(defn is-clause?
  "If `x` is an MBQL clause, and an instance of clauses defined by keyword(s) `k-or-ks`?

    (is-clause? :count [:count 10])        ; -> true
    (is-clause? #{:+ :- :* :/} [:+ 10 20]) ; -> true"
  [k-or-ks x]
  (and
   (mbql-clause? x)
   (if (coll? k-or-ks)
     ((set k-or-ks) (first x))
     (= k-or-ks (first x)))))

(defn dispatch-by-clause-name-or-class
  "Dispatch function perfect for use with multimethods that dispatch off elements of an MBQL query. If `x` is an MBQL
  clause, dispatches off the clause name; otherwise dispatches off `x`'s class."
  ([x]
   (letfn [(clause-type [x]
             (when (mbql-clause? x)
               (first x)))
           (mbql5-lib-type [x]
             (when (map? x)
               (:lib/type x)))
           (model-type [x]
             (t2/model x))]
     (or
      (clause-type x)
      (mbql5-lib-type x)
      (model-type x)
      (type x))))
  ([x _]
   (dispatch-by-clause-name-or-class x)))

(defn nest-expressions
  "Wrapper around [[metabase.query-processor.util.nest-query/nest-expressions]] to allow it to work with legacy MBQL
  inner queries. This is a temporary placeholder until we start migrating drivers to use Lib/MBQL 5 directly."
  [lib-query-or-legacy-inner-query]
  (if (:lib/type lib-query-or-legacy-inner-query)
    (nest-query/nest-expressions lib-query-or-legacy-inner-query)
    #_{:clj-kondo/ignore [:deprecated-var :discouraged-var]}
    (-> lib-query-or-legacy-inner-query
        (->> (lib/query-from-legacy-inner-query (qp.store/metadata-provider)
                                                (:id (lib.metadata/database (qp.store/metadata-provider)))))
        nest-query/nest-expressions
        lib/->legacy-MBQL
        :query)))
