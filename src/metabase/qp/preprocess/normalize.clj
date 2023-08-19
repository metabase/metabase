(ns metabase.qp.preprocess.normalize
  (:require
   [metabase.lib.query :as lib.query]
   [metabase.qp.metadata-provider :as qp.metadata-provider]))

(defn normalize-middleware [what]
  (when (= what :lib.walk/query.pre)
    (fn [query _context]
      (if (:lib/metadata query)
        query
        (lib.query/query (qp.metadata-provider/metadata-provider) query)))))
