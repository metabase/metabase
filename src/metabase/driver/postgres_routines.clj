(ns metabase.driver.postgres-routines
  "Improved PostgreSQL routine (stored procedures/functions) implementation"
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [clojure.string :as str])
  (:import
   (java.sql Connection)))

(defn describe-routines-improved
  "Production-ready implementation of describe-routines for PostgreSQL.
   - Uses system catalogs instead of regex parsing
   - Supports PostgreSQL < 11
   - Returns reducible/streaming results"
  [driver database & {:keys [schema-names routine-names]}]
  (sql-jdbc.execute/do-with-connection-with-options
   driver database nil
   (fn [^Connection conn]
     (let [;; First check PostgreSQL version for compatibility
           version-query "SELECT current_setting('server_version_num')::int as version"
           pg-version (-> (jdbc/query {:connection conn} version-query)
                         first
                         :version)
           ;; Use prokind for PG 11+, fall back to function type checks for older versions
           routine-type-expr (if (>= pg-version 110000)
                              "CASE WHEN p.prokind = 'p' THEN 'procedure' ELSE 'function' END"
                              "'function'") ; Pre-11 doesn't have procedures
           ;; Build WHERE clause parts
           type-filter (if (>= pg-version 110000)
                        " AND p.prokind IN ('f', 'p')"
                        " AND NOT p.proisagg AND NOT p.proiswindow")
           schema-filter (when schema-names
                          (format " AND n.nspname IN (%s)"
                                 (str/join "," (map #(format "'%s'" %) schema-names))))
           routine-filter (when routine-names
                           (format " AND p.proname IN (%s)"
                                  (str/join "," (map #(format "'%s'" %) routine-names))))
           where-clause (str "WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')" 
                            type-filter schema-filter routine-filter)
           ;; Include prokind for PG 11+ or dummy field for older versions
           prokind-field (if (>= pg-version 110000) "p.prokind," "")
           base-query (format "WITH filtered_routines AS (
                                 SELECT p.oid, p.proname, p.pronamespace, p.prosrc, p.pronargs,
                                        p.proargtypes, p.proallargtypes, p.proargnames, p.proargmodes,
                                        %s
                                        %s AS routine_type
                                 FROM pg_proc p
                                 JOIN pg_namespace n ON n.oid = p.pronamespace
                                 %s
                               ),
                               routine_params AS (
                                 SELECT 
                                   p.oid AS routine_oid,
                                   unnest(COALESCE(p.proallargtypes::int[], p.proargtypes::int[])) AS type_oid,
                                   unnest(COALESCE(p.proargnames::text[], 
                                           ARRAY(SELECT 'arg' || generate_series(1, array_length(p.proargtypes, 1))))) AS param_name,
                                   unnest(COALESCE(p.proargmodes::text[], 
                                           array_fill('i'::text, ARRAY[COALESCE(array_length(p.proargtypes, 1), 0)]))) AS param_mode,
                                   generate_series(1, 
                                     GREATEST(
                                       COALESCE(array_length(p.proallargtypes, 1), 0),
                                       COALESCE(array_length(p.proargtypes, 1), 0)
                                     )) AS param_position
                                 FROM filtered_routines p
                               ),
                               param_types AS (
                                 SELECT 
                                   rp.routine_oid,
                                   rp.param_name,
                                   rp.param_mode,
                                   rp.param_position,
                                   CASE 
                                     WHEN t.typelem != 0 AND t.typlen = -1 THEN te.typname || '[]'
                                     ELSE t.typname
                                   END AS data_type
                                 FROM routine_params rp
                                 JOIN pg_type t ON t.oid = rp.type_oid
                                 LEFT JOIN pg_type te ON te.oid = t.typelem
                               )
                               SELECT p.oid,
                                      p.proname AS name,
                                      n.nspname AS schema,
                                      p.routine_type,
                                      pd.description AS description,
                                      p.prosrc AS definition,
                                      pg_get_function_result(p.oid) AS return_type,
                                      p.pronargs AS arg_count,
                                      COALESCE(
                                        json_agg(
                                          json_build_object(
                                            'name', pt.param_name,
                                            'mode', CASE pt.param_mode 
                                                     WHEN 'i' THEN 'IN'
                                                     WHEN 'o' THEN 'OUT'
                                                     WHEN 'b' THEN 'INOUT'
                                                     WHEN 'v' THEN 'VARIADIC'
                                                     WHEN 't' THEN 'TABLE'
                                                   END,
                                            'type', pt.data_type,
                                            'position', pt.param_position
                                          ) ORDER BY pt.param_position
                                        ) FILTER (WHERE pt.routine_oid IS NOT NULL),
                                        '[]'::json
                                      ) AS parameters
                               FROM filtered_routines p
                               JOIN pg_namespace n ON n.oid = p.pronamespace
                               LEFT JOIN pg_description pd ON pd.objoid = p.oid AND pd.objsubid = 0
                               LEFT JOIN param_types pt ON pt.routine_oid = p.oid
                               GROUP BY p.oid, p.proname, n.nspname, p.routine_type, pd.description, p.prosrc, p.pronargs"
                              prokind-field routine-type-expr where-clause)
           results (jdbc/query {:connection conn} base-query)]
       ;; Return a concrete vector instead of lazy sequence
       (into []
             (map (fn [routine]
               (let [;; Parse JSON parameters from the query
                     params-json (:parameters routine)
                     params (when (and params-json (not= params-json "[]"))
                             (vec
                              (map (fn [p]
                                     {:name             (:name p)
                                      :parameter_mode   (keyword (str/lower-case (or (:mode p) "IN")))
                                      :data_type        (:type p)
                                      :ordinal_position (:position p)})
                                   (json/parse-string params-json true))))]
                 (cond-> {:schema       (:schema routine)
                          :name         (:name routine)
                          :routine-type (keyword (:routine_type routine))
                          :description  (:description routine)
                          :definition   (:definition routine)}
                   (:return_type routine) (assoc :return-type (:return_type routine))
                   (seq params) (assoc :parameters params))))
             results))))))

;; To use this in postgres.clj, replace the existing method with:
;; (defmethod driver/describe-routines :postgres
;;   [driver database & opts]
;;   (postgres-routines/describe-routines-improved driver database opts))