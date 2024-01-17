(ns dev.explain
  (:require
   [clojure.string :as str]
   [honey.sql :as sql]
   [toucan2.core :as t2]))

(defn explain-query
  "Explain a sql query or a honeysql query with option to analyze the query."
  ([queryable]
   (explain-query queryable false))
  ([queryable analyze?]
   (->> (t2/query
         (str/join
          " "
          (remove nil? ["EXPLAIN"
                        (when analyze? "ANALYZE")
                        "(" (if (map? queryable) (first (sql/format queryable {:inline true})) queryable) ")"])))
        (map #(get % (keyword "query plan"))))))
