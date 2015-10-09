(ns metabase.db-test
  (:require [expectations :refer :all]
            [metabase.db :as db]))

;; parse minimal connection string
(expect {:type :postgres :user nil :password nil :host "localhost" :port nil :dbname "toms_cool_db" }
  (db/parse-connection-string "postgres://localhost/toms_cool_db"))

;; parse all fields and query string arguments
(expect {:type :postgres :user "tom" :password "1234" :host "localhost" :port "5432" :dbname "toms_cool_db" :ssl "true" :sslfactory "org.postgresql.ssl.NonValidatingFactory"}
  (db/parse-connection-string "postgres://tom:1234@localhost:5432/toms_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory"))
