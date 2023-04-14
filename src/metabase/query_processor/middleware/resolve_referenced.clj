(ns metabase.query-processor.middleware.resolve-referenced
  (:require
   [metabase.query-processor.middleware.fetch-source-query
    :as fetch-source-query]
   [metabase.query-processor.middleware.resolve-fields
    :as qp.resolve-fields]
   [metabase.query-processor.middleware.resolve-source-table
    :as qp.resolve-source-table]
   [metabase.query-processor.util.tag-referenced-cards
    :as qp.u.tag-referenced-cards]
   [metabase.util.i18n :refer [tru]]
   [schema.core :as s]
   [toucan2.core :as t2]
   [weavejester.dependency :as dep])
  (:import
   (clojure.lang ExceptionInfo)))

(defn- check-query-database-id=
  [query database-id]
  (when-not (= (:database query) database-id)
    (throw (ex-info (tru "Referenced query is from a different database")
                    {:referenced-query     query
                     :expected-database-id database-id}))))

(s/defn ^:private resolve-referenced-card-resources* :- clojure.lang.IPersistentMap
  [query]
  (doseq [referenced-card (qp.u.tag-referenced-cards/tags-referenced-cards query)
          :let [referenced-query (:dataset_query referenced-card)
                resolved-query (fetch-source-query/resolve-card-id-source-tables* referenced-query)]]
    (check-query-database-id= referenced-query (:database query))
    (qp.resolve-source-table/resolve-source-tables resolved-query)
    (qp.resolve-fields/resolve-fields resolved-query))
  query)

(defn- card-subquery-graph
  [graph card-id]
  (let [card-query (t2/select-one-fn :dataset_query 'Card :id card-id)]
    (reduce
     (fn [g sub-card-id]
       (card-subquery-graph (dep/depend g card-id sub-card-id)
                            sub-card-id))
     graph
     (qp.u.tag-referenced-cards/query->tag-card-ids card-query))))

(defn- circular-ref-error
  [from-card to-card]
  (let [[from-name to-name] (map :name (t2/select ['Card :name] :id [:in [from-card to-card]]))]
    (str
     (tru "This query has circular referencing sub-queries. ")
     (tru "These questions seem to be part of the problem: \"{0}\" and \"{1}\"." from-name to-name))))

(defn- check-for-circular-references!
  [query]
  (try
   ;; `card-subquery-graph` will throw if there are circular references
   (reduce card-subquery-graph (dep/graph) (qp.u.tag-referenced-cards/query->tag-card-ids query))
   (catch ExceptionInfo e
     (let [{:keys [reason node dependency]} (ex-data e)]
       (if (= reason :weavejester.dependency/circular-dependency)
         (throw (ex-info (circular-ref-error node dependency) {:original-exception e}))
         (throw e)))))
  query)

(defn resolve-referenced-card-resources
  "Resolves tables and fields referenced in card query template tags."
  [query]
  (-> query check-for-circular-references! resolve-referenced-card-resources*))
