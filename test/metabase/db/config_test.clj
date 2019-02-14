(ns metabase.db.config-test
  (:require [expectations :refer [expect]]
            [metabase.db.config :as db.config]))

(defn- do-with-connection-uri [connection-uri f]
  (with-redefs [environ.core/env (assoc environ.core/env :mb-db-connection-uri connection-uri)]
    (f)))

(defmacro ^:private with-connection-uri [uri & body]
  `(do-with-connection-uri ~uri (fn [] ~@body)))

;; parse minimal connection string
(expect
  {:subname                       "//localhost/toms_cool_db"
   :subprotocol                   "postgresql"
   :OpenSourceSubProtocolOverride true}
  (with-connection-uri "postgres://localhost/toms_cool_db"
    (db.config/jdbc-spec)))

(expect
  :postgres
  (with-connection-uri "postgres://localhost/toms_cool_db"
    (db.config/db-type)))

;; parse connection string using alternate `postgreql` URI schema
(expect
  {:subname                     "//localhost/toms_cool_db"
   :subprotocol                   "postgresql"
   :OpenSourceSubProtocolOverride true}
  (with-connection-uri "postgresql://localhost/toms_cool_db"
    (db.config/jdbc-spec)))

;; parse all fields and query string arguments
(expect
  {:subname                       "//localhost:5432/toms_cool_db"
   :subprotocol                   "postgresql"
   :user                          "tom"
   :password                      "1234"
   :ssl                           "true"
   :sslfactory                    "org.postgresql.ssl.NonValidatingFactory"
   :OpenSourceSubProtocolOverride true}
  (with-connection-uri (str "postgres://tom:1234@localhost:5432/toms_cool_db?ssl=true"
                            "&sslfactory=org.postgresql.ssl.NonValidatingFactory")
    (db.config/jdbc-spec)))

;; the leading "jdbc" found in driver JDBC docs should be ignored
(expect
  {:subname                       "//localhost:5432/toms_cool_db"
   :subprotocol                   "postgresql"
   :user                          "tom"
   :password                      "1234"
   :ssl                           "true"
   :sslfactory                    "org.postgresql.ssl.NonValidatingFactory"
   :OpenSourceSubProtocolOverride true}
  (with-connection-uri (str "jdbc:postgres://tom:1234@localhost:5432/toms_cool_db"
                            "?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory")
    (db.config/jdbc-spec)))
