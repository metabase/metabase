(ns metabase.driver.sql.query-processor.preprocess
  (:require [metabase.driver.sql.query-processor.preprocess.add-merged-select :as add-merged-select]
            [metabase.driver.sql.query-processor.preprocess.add-references :as add-references]
            [metabase.driver.sql.query-processor.preprocess.schemas :as schemas]
            [metabase.mbql.schema :as mbql.s]
            [schema.core :as s]))

(s/defn ^:private preprocess-one :- schemas/PreprocessedInnerQuery
  [driver inner-query]
  (->> inner-query
       (add-merged-select/add-merged-select driver)
       (add-references/add-references driver)
       ;; subselectify (?)
       ;; add-level-info
       ))

(s/defn preprocess :- schemas/PreprocessedInnerQuery
  [driver                                        :- s/Keyword
   {:keys [source-query joins], :as inner-query} :- mbql.s/MBQLQuery]
  (->> (cond-> inner-query
         source-query (update :source-query (partial preprocess driver))
         (seq joins)  (update :joins (partial mapv (partial preprocess driver))))
       (preprocess-one driver)))
