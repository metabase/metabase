(ns metabase.query-processor.middleware.upgrade-field-literals
  (:require [clojure.walk :as walk]
            [metabase.mbql.util :as mbql.u]
            [metabase.util :as u]))

(defn- upgrade-field-literals-one-level [{:keys [source-metadata], :as inner-query}]
  (let [field-name->field (u/key-by :name source-metadata)]
    ;; look for `field-literal` clauses...
    (mbql.u/replace inner-query
      [:field-literal field-name _]
      ;; don't upgrade anything inside `source-query` or `source-metadata`.
      (or (when-not (or (contains? (set &parents) :source-query)
                        (contains? (set &parents) :source-metadata))
            (when-let [{field-ref :field_ref} (get field-name->field field-name)]
              ;; only do a replacement if the field ref is a `field-id` form or something wrapping one.
              (when (mbql.u/match-one field-ref :field-id true)
                ;; replace the `field-literal` with either `field-id`, `joined-field`, or `fk->` -- these are the
                ;; lowest-level forms that are directly swappable with `field-literal`. Don't include `datetime-field`
                ;; `binning-strategy`, or anything other "wrapper" clauses, because they may already be wrapping the
                ;; clause we're replacing
                (mbql.u/match-one field-ref
                  #{:field-id :joined-field :fk->}
                  &match))))
          ;; if they don't meet the conditions above, return them as is
          &match))))

(defn- upgrade-field-literals-all-levels [query]
  (walk/postwalk
   (fn [form]
     ;; find maps that have `source-query` and `source-metadata`, but whose source query is an MBQL source query
     ;; rather than an native one
     (if (and (map? form)
              (:source-query form)
              (seq (:source-metadata form))
              (not (get-in form [:source-query :native])))
       (upgrade-field-literals-one-level form)
       form))
   query))

(defn upgrade-field-literals
  "Look for usage of `field-literal` forms where `field-id` would have been the correct thing to use, and fix it, so the
  resulting query doesn't end up being broken."
  [qp]
  (fn [query rff context]
    (qp (upgrade-field-literals-all-levels query) rff context)))
