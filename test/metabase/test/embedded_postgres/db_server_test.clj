(ns metabase.test.embedded-postgres.db-server-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test.embedded-postgres.core :as emb-pg]
   [next.jdbc :as jdbc]))

(deftest db-server-smoke-test
  (testing "the embedded-postgres db-server component starts, accepts a JDBC connection, and runs a query"
    (emb-pg/with-system [system {::emb-pg/db-server {}}]
      (let [{::emb-pg/keys [port jdbc-url]} (::emb-pg/db-server system)]
        (is (pos-int? port))
        (is (= {:ok 1} (jdbc/execute-one! {:jdbcUrl jdbc-url} ["select 1 as ok"])))))))
