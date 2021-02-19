(ns metabase.query-processor.middleware.upgrade-field-literals
  (:require [clojure.walk :as walk]
            [metabase.mbql.util :as mbql.u]
            [metabase.util :as u]))

(defn- upgrade-field-literals-one-level [{:keys [source-metadata], :as inner-query}]
  (let [field-name->field (u/key-by :name source-metadata)]
    ;; look for `field` clauses that use a string name...
    (mbql.u/replace inner-query
      [:field (field-name :guard string?) options]
      ;; don't upgrade anything inside `source-query` or `source-metadata`.
      (or (when-not (or (contains? (set &parents) :source-query)
                        (contains? (set &parents) :source-metadata))
            (when-let [{field-ref :field_ref} (get field-name->field field-name)]
              ;; only do a replacement if the field ref is a `field` clause that uses an ID
              (mbql.u/match-one field-ref
                [:field (id :guard integer?) new-options]
                [:field id (merge new-options (dissoc options :base-type))])))
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
  "Look for usage of `:field` (name) forms where `field` (ID) would have been the correct thing to use, and fix it, so
  the resulting query doesn't end up being broken."
  [qp]
  (fn [query rff context]
    (qp (upgrade-field-literals-all-levels query) rff context)))
