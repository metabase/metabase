(ns metabase.driver.sql.query-processor.preprocess.add-merged-select
  " Create a `:sql.qp/fields` clause that exactly matches the Fields in the `SELECT` clause we're generating, complete
  with the appropriate aliases."
  (:refer-clojure :exclude [alias])
  (:require [metabase.driver.sql.query-processor.preprocess.alias :as alias]
            [metabase.driver.sql.query-processor.preprocess.schemas :as schemas]
            [metabase.mbql.schema :as mbql.s]
            [metabase.mbql.util :as mbql.u]
            [schema.core :as s]))

(defn add-unambiguous-alias [driver {:keys [clause source], :as m}]
  (assoc m :alias (alias/clause-alias driver clause)))

(defn- deduplicate-aliases [rf]
  (let [unique-name-fn (mbql.u/unique-name-generator)]
    ((map (fn [info]
            (update info :alias unique-name-fn))) rf)))

(s/defn merged-select :- schemas/SelectInfos
  [driver inner-query :- mbql.s/MBQLQuery]
  (into
   []
   (comp (map (fn [k]
                (map-indexed
                 (fn [i clause]
                   {:clause clause
                    :source k
                    ::index i})
                 (get inner-query k))))
         cat
         (map (partial add-unambiguous-alias driver))
         deduplicate-aliases
         (map (fn [{:keys [source], ::keys [index], :as m}]
                (cond-> m (= source :aggregation) (assoc :clause [:aggregation index]))))
         (map #(dissoc % ::index)))
   [:breakout :aggregation :fields]))

(defn add-merged-select
  [driver {:keys [source-query joins], :as inner-query}]
  (let [add-merged-select* (partial add-merged-select driver)
        inner-query        (cond-> inner-query
                             source-query (update :source-query add-merged-select*)
                             (seq joins)  (update :joins (partial mapv add-merged-select*)))
        select             (merged-select driver inner-query)]
    (cond-> (dissoc inner-query :fields :aggregation)
      (seq select) (assoc :sql.qp/select select))))
