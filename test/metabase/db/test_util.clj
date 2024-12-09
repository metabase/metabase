(ns metabase.db.test-util
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.db :as mdb]
   [metabase.test.util.timezone :as test.tz]
   [metabase.util.random :as u.random]
   [potemkin :as p]
   [pretty.core :as pretty]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(p/deftype+ ClojureJDBCSpecDataSource [jdbc-spec]
  pretty/PrettyPrintable
  (pretty [_]
    (list `->ClojureJDBCSpecDataSource jdbc-spec))

  javax.sql.DataSource
  (getConnection [_]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (jdbc/get-connection jdbc-spec))

  (getConnection [_ _user _password]
    (throw (UnsupportedOperationException. "Use (.getConnection this) instead."))))

(alter-meta!
 #'->ClojureJDBCSpecDataSource
 assoc
 :arglists '(^javax.sql.DataSource [jdbc-spec])
 :deprecated :true
 :doc "Return a [[javax.sql.DataSource]] for a [[clojure.java.jdbc]] spec. DEPRECATED -- this is only provided for
 backwards compatibility without having to rewrite a bunch of tests. Prefer
 [[metabase.db.data-source/broken-out-details->DataSource]] or
 [[metabase.db.data-source/raw-connection-string->DataSource]] instead.")

(deftest jdbc-spec-test
  (let [data-source (->ClojureJDBCSpecDataSource
                     {:subprotocol "h2"
                      :subname     (format "mem:%s" (u.random/random-name))
                      :classname   "org.h2.Driver"})]
    (with-open [conn (.getConnection data-source)]
      (is (= [{:one 1}]
             (jdbc/query {:connection conn} "SELECT 1 AS one;"))))))

(defn do-with-app-db-timezone-id!
  "Sets the app DB time zone to `tz` and runs `thunk`."
  [tz thunk]
  (if (= (mdb/db-type) :h2)
    (test.tz/do-with-system-timezone-id! tz thunk)
    ;; otherwise if db-type is postgres or mysql
    (let [initial-tz (val (first (t2/query-one (case (mdb/db-type)
                                                 :postgres "SELECT current_setting('TIMEZONE')"
                                                 :mysql    "SELECT @@global.time_zone"))))
          set-tz! (fn [x]
                    (t2/query (case (mdb/db-type)
                                :postgres (format "SET TIME ZONE '%s';" x)
                                :mysql    (format "SET @@global.time_zone = '%s';" x))))]
      (set-tz! tz)
      (try (thunk)
           (finally
             (set-tz! initial-tz))))))

(defmacro with-app-db-timezone-id!
  "Execute `body` with the system time zone of the app db temporarily changed to the time zone named by `timezone-id`."
  [timezone-id & body]
  `(do-with-app-db-timezone-id! ~timezone-id (fn [] ~@body)))
