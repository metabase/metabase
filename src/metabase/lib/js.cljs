(ns metabase.lib.js
  "JavaScript-friendly interface to the entire Metabase lib? This stuff will probably change a bit as MLv2 evolves."
  (:require
   [metabase.lib.convert :as convert]
   [metabase.lib.js.metadata :as js.metadata]
   [metabase.lib.metadata.calculate.describe-query :as metadata.calculate.describe-query]
   [metabase.lib.query :as lib.query]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.util.log :as log]))

(defn ^:export describeQuery
  "Return a nice description of a query."
  [query]
  (metadata.calculate.describe-query/describe-query query))

(defn- pMBQL [query-map]
  (as-> query-map <>
    (js->clj <> :keywordize-keys true)
    (if (:type <>)
      <>
      (assoc <> :type :query))
    (mbql.normalize/normalize <>)
    (convert/->pMBQL <>)))

(defn ^:export query
  "Coerce a plain map `query` to an actual query object that you can use with Metabase lib."
  [database-id metadata query-map]
  (let [query-map (pMBQL query-map)]
    (log/debugf "query map: %s" (pr-str query-map))
    (lib.query/query (js.metadata/metadata-provider database-id metadata)
                     query-map)))
