(ns metabase.query-processor.middleware.upgrade-field-literals
  (:require [clojure.walk :as walk]
            [metabase.mbql.util :as mbql.u]
            [metabase.util :as u]))

(defn- upgrade-field-literals-one-level [{:keys [source-metadata], :as inner-query}]
  (let [field-name->field (u/key-by :name source-metadata)]
    (mbql.u/replace inner-query
      [:field-literal field-name _]
      (or (when-not (or (contains? (set &parents) :source-query)
                        (contains? (set &parents) :source-metadata))
            (when-let [{field-ref :field_ref} (get field-name->field field-name)]
              (when (mbql.u/match-one field-ref :field-id true)
                field-ref)))
          &match))))

(defn- upgrade-field-literals-all-levels [query]
  (walk/postwalk
   (fn [form]
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
