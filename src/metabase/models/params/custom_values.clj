(ns metabase.models.params.custom-values
  (:require [metabase.query-processor :as qp]))

(defn- custom-values-query
  [card-id value-name-or-id field-name-or-id _query]
  {:database 1
   :type     :query
   :query    {:source-table (format "card__%d" card-id)
              :fields       (if (= value-name-or-id field-name-or-id)
                              [[:field value-name-or-id nil]]
                              [[:field value-name-or-id nil]
                               [:field field-name-or-id nil]])}
   :middleware {:disable-remaps? true}})

(defn get-values-for-card
  "a docstring"
  ([card-id value label]
   (get-values-for-card card-id value label nil))
  ([card-id value label query]
   {:values          (qp/process-query (custom-values-query card-id value label query)
                                       {:rff (constantly conj)})
    :has_more_values false}))


(comment
  (get-values-for-card 2 49 49) ;; source is a mbql query
  (get-values-for-card 3 "id" "name") ;; source is native query
  )
