(ns metabase.driver.sql-jdbc.metadata
  "SQL JDBC implementation of [[metabase.driver/query-result-metadata]]."
  (:refer-clojure :exclude [mapv])
  (:require
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv]]))

(set! *warn-on-reflection* true)

(mu/defn query-result-metadata :- [:sequential driver-api/schema.metadata.column]
  "Default implementation of [[metabase.driver/query-result-metadata]] for JDBC-based drivers. Gets metadata without
  actually running a query."
  ([driver :- :keyword
    query  :- :map]
   (driver-api/with-qp-setup [query query]
     (let [database               (driver-api/database (driver-api/metadata-provider))
           {:keys [query params]} (driver-api/compile query)]
       (query-result-metadata driver database query params))))

  ([driver      :- :keyword
    database    :- driver-api/schema.metadata.database
    ^String sql :- :string
    params      :- [:maybe [:sequential :any]]]
   (sql-jdbc.execute/do-with-connection-with-options
    driver
    database
    nil
    (fn [^java.sql.Connection conn]
      (with-open [stmt (sql-jdbc.execute/prepared-statement driver conn sql params)]
        (let [rsmeta (.getMetaData stmt)]
          (mapv (fn [i]
                  (let [database-type (.getColumnTypeName rsmeta i)]
                    {:lib/type      :metadata/column
                     :name          (.getColumnLabel rsmeta i)
                     :database-type database-type
                     :base-type     (or (sql-jdbc.sync.interface/database-type->base-type driver (keyword database-type))
                                        :type/*)}))
                (range 1 (inc (.getColumnCount rsmeta))))))))))
