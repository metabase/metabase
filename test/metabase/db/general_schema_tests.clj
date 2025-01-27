(ns metabase.db.general-schema-tests
  "General tests to make sure our app DB schema is sane."
  (:require
   [clojure.test :refer :all]
   [metabase.db :as mdb]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest ^:parallel no-tiny-int-columns
  (when (= (mdb/db-type) :mysql)
    (testing "All boolean columns in mysql, mariadb should be bit(1)"
      (is (= [{:table_name "DATABASECHANGELOGLOCK" :column_name "LOCKED"}] ;; outlier because this is liquibase's table
             (t2/query
              (format "SELECT table_name, column_name FROM information_schema.columns WHERE data_type LIKE 'tinyint%%' AND table_schema = '%s';"
                      (with-open [conn (-> (mdb/app-db) .getConnection)]
                        (.getCatalog conn)))))))))

(deftest ^:parallel fks-are-indexed-test
  (when (= (mdb/db-type) :postgres)
    (let [excluded-fks #{{:table_name  "field_usage"
                          :column_name "query_execution_id"}
                         {:table_name  "pulse_channel"
                          :column_name "channel_id"}}
          indexed-fks  (t2/query
                        "SELECT
                              conrelid::regclass::text AS table_name,
                              a.attname AS column_name
                          FROM
                              pg_constraint AS c
                              JOIN pg_attribute AS a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
                          WHERE
                              c.contype = 'f'
                              AND NOT EXISTS (
                                  SELECT 1
                                  FROM pg_index AS i
                                  WHERE i.indrelid = c.conrelid
                                    AND a.attnum = ANY(i.indkey)
                              )
                          ORDER BY
                              table_name,
                              column_name;")]
      (doseq [fk indexed-fks]
        (testing (format "Consider adding an index on %s.%s or add it to the excluded-fks set" (:table_name fk) (:column_name fk))
          (is (contains? excluded-fks fk)))))))
