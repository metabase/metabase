(ns metabase.query-processor.middleware.resolve-referenced
  (:require [metabase.models.card :refer [Card]]
            [metabase.query-processor.middleware
             [resolve-fields :as qp.resolve-fields]
             [resolve-source-table :as qp.resolve-tables]]
            [metabase.util.i18n :refer [deferred-tru]]
            [schema.core :as s]
            [toucan.db :as db]
            [weavejester.dependency :as dep])
  (:import clojure.lang.ExceptionInfo))

(defn- query->template-tags
  [query]
  (vals (get-in query [:native :template-tags])))

(defn- query->tag-card-ids
  [query]
  (keep :card-id (query->template-tags query)))

(defn tags-referenced-cards
  "Returns Card instances referenced by the given native `query`."
  [query]
  (mapv
   (fn [card-id]
     (if-let [card (db/select-one 'Card :id card-id)]
       card
       (throw (ex-info (str (deferred-tru "Referenced question #{0} could not be found" (str card-id)))
                       {:card-id card-id}))))
   (query->tag-card-ids query)))

(defn- check-query-database-id=
  [query database-id]
  (when-not (= (:database query) database-id)
    (throw (ex-info (str (deferred-tru "Referenced query is from a different database"))
                    {:referenced-query     query
                     :expected-database-id database-id}))))

(s/defn ^:private resolve-referenced-card-resources* :- clojure.lang.IPersistentMap
  [query]
  (doseq [referenced-card (tags-referenced-cards query)
          :let [referenced-query (:dataset_query referenced-card)]]
    (check-query-database-id= referenced-query (:database query))
    (qp.resolve-tables/resolve-source-tables* referenced-query)
    (qp.resolve-fields/resolve-fields* referenced-query))
  query)

(defn- card-subquery-graph
  [graph card-id]
  (let [card-query (db/select-one-field :dataset_query Card :id card-id)]
    (reduce
     (fn [g sub-card-id]
       (card-subquery-graph (dep/depend g card-id sub-card-id)
                            sub-card-id))
     graph
     (query->tag-card-ids card-query))))

(defn- circular-ref-error
  [from-card to-card]
  (let [[from-name to-name] (map :name (db/select ['Card :name] :id [:in [from-card to-card]]))]
    (str
     (deferred-tru "This query has circular referencing sub-queries. ")
     (deferred-tru "These questions seem to be part of the problem: \"{0}\" and \"{1}\"." from-name to-name))))

(defn- check-for-circular-references!
  [query]
  (try
   ;; `card-subquery-graph` will throw if there are circular references
   (reduce card-subquery-graph (dep/graph) (query->tag-card-ids query))
   (catch ExceptionInfo e
     (let [{:keys [reason node dependency]} (ex-data e)]
       (if (= reason :weavejester.dependency/circular-dependency)
         (throw (ex-info (circular-ref-error node dependency) {:original-exception e}))
         (throw e)))))
  query)

(defn resolve-referenced-card-resources
  "Resolves tables and fields referenced in card query template tags."
  [qp]
  (fn [query rff context]
    (qp (-> query check-for-circular-references! resolve-referenced-card-resources*)
        rff context)))
