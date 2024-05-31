(ns metabase.driver.sql-jdbc.metadata
  "SQL JDBC implementation of [[metabase.driver/query-result-metadata]]."
  (:require
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn query-result-metadata :- [:sequential ::lib.schema.metadata/column]
  "Default implementation of [[metabase.driver/query-result-metadata]] for JDBC-based drivers. Gets metadata without
  actually running a query."
  ([driver :- :keyword
    query  :- :map]
   (qp.setup/with-qp-setup [query query]
     (let [database               (lib.metadata/database (qp.store/metadata-provider))
           {:keys [query params]} (qp.compile/compile query)]
       (query-result-metadata driver database query params))))

  ([driver      :- :keyword
    database    :- ::lib.schema.metadata/database
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
                     :base-type     (sql-jdbc.sync.interface/database-type->base-type driver (keyword database-type))
                     ;; the following columns are extra 'bonus' metadata that's not actually used anywhere but maybe
                     ;; helpful for debugging stuff.
                     :original-name (.getColumnName rsmeta i)}))
                (range 1 (inc (.getColumnCount rsmeta))))))))))
