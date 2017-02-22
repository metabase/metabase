(ns metabase.db-test
  (:require [expectations :refer :all]
            metabase.db
            [metabase.test.util :as tu]))

(tu/resolve-private-vars metabase.db parse-connection-string)

;; parse minimal connection string
(expect
  {:type :postgres, :user nil, :password nil, :host "localhost", :port nil, :dbname "toms_cool_db" }
  (parse-connection-string "postgres://localhost/toms_cool_db"))

;; parse connection string using alternate `postgreql` URI schema
(expect
  {:type :postgres, :user nil, :password nil, :host "localhost", :port nil, :dbname "toms_cool_db" }
  (parse-connection-string "postgresql://localhost/toms_cool_db"))

;; parse all fields and query string arguments
(expect
  {:type :postgres, :user "tom", :password "1234", :host "localhost", :port "5432", :dbname "toms_cool_db", :ssl "true", :sslfactory "org.postgresql.ssl.NonValidatingFactory"}
  (parse-connection-string "postgres://tom:1234@localhost:5432/toms_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory"))
