(ns dev.migrate-test
  (:require
   [clojure.test :refer :all]
   [metabase.dev.migrate :as dev.migrate]))

(deftest migration-sql-by-id-test
  (is (= {:forward
          "ALTER TABLE public.query_field RENAME COLUMN direct_reference TO explicit_reference;",
          :rollback
          "ALTER TABLE public.query_field RENAME COLUMN explicit_reference TO direct_reference;"}
         (dev.migrate/migration-sql-by-id "v51.2024-06-07T12:37:36"))))
