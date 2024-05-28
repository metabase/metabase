(ns metabase.db.test-util
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.util.random :as u.random]
   [potemkin :as p]
   [pretty.core :as pretty]))

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
