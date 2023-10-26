(ns metabase.query-processor.normalize
  (:require
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.query-processor.middleware.resolve-database-and-driver :as qp.resolve-database-and-driver]))

(defn- query-type [query]
  (keyword (some (fn [k]
                   (get query k))
                 [:lib/type
                  "lib/type"
                  :type
                  "type"])))

(defn- resolve-database-id [query]
  (let [database-id (qp.resolve-database-and-driver/resolve-database-id query)]
    (assoc query :database database-id)))

(defn normalize [query]
  (case (query-type query)
    :mbql/query
    (-> query
        lib.normalize/normalize
        resolve-database-id)

    (:native :query)
    (-> query
        mbql.normalize/normalize
        lib.convert/->pMBQL
        resolve-database-id)

    :else
    (throw (ex-info "Invalid query: unknown type"
                    {:query query}))))
