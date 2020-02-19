(ns metabase.query-processor.middleware.cache-backend.db-test
  (:require [clojure.java.jdbc :as jdbc]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.query-processor.middleware.cache-backend.db :as db]))

(deftest seconds-ago-honeysql-form-test
  (mt/test-drivers #{:h2 :postgres :mysql}
    (let [[sql] (hsql/format {:select [[(#'db/seconds-ago-honeysql-form driver/*driver* 1.4) :a]
                                       [(#'db/seconds-ago-honeysql-form driver/*driver* 1.0) :b]
                                       [(#'db/seconds-ago-honeysql-form driver/*driver* 1.0) :c]]})]
      (with-open [conn (sql-jdbc.execute/connection-with-timezone driver/*driver* (mt/db) nil)]
        (let [[{:keys [a b c]}] (jdbc/query {:connection conn} sql)]
          (is (not= a b)
              "1.0 seconds ago should not be equal to 1.4 seconds ago")
          (is (= b c)
              "1.0 seconds ago should be equal to 1.0 seconds ago"))))))
