(ns metabase.api.dbinfo
  (:require [compojure.core :refer [GET]]
            [metabase.api.common :as api]
            [clojure.tools.logging :as log]
                        [clojure.java.jdbc :as jdbc]
            ))

(def db-spec {:classname "org.sqlite.JDBC"
 :subprotocol "sqlite"
 :subname "dbinfo.db"})

(defn dbinfoGet
  "Return info for graph point"
  [clickedKey clickedValue tablexAxis tableyAxis]
      ; here find data in database
        (jdbc/with-db-connection [conn db-spec]
            (jdbc/execute! conn ["CREATE TABLE IF NOT EXISTS dbinfo (id INTEGER PRIMARY KEY, clickedkey TEXT, clickedvalue TEXT, tablexaxis TEXT, tableyaxis TEXT, pointinfo TEXT)"]))
        (jdbc/with-db-connection [conn db-spec]
          (let [result
              (jdbc/query conn ["SELECT pointinfo FROM dbinfo where clickedkey = ? and clickedvalue = ? and tablexaxis = ? and tableyaxis = ? ORDER BY ID DESC LIMIT 1" clickedKey clickedValue tablexAxis tableyAxis])
          ]
            (when-not (empty? result)
              (let [pointinfo (-> result first :pointinfo)]
                (str pointinfo)))))
)

(defn dbinfoSet
  "Return info for graph point"
  [clickedKey clickedValue tablexAxis tableyAxis pointInfo]
      ; here find data in database
        (jdbc/with-db-connection [conn db-spec]
            (jdbc/execute! conn ["CREATE TABLE IF NOT EXISTS dbinfo (id INTEGER PRIMARY KEY, clickedkey TEXT, clickedvalue TEXT, tablexaxis TEXT, tableyaxis TEXT, pointinfo TEXT)"]))
        (jdbc/with-db-connection [conn db-spec]
            (jdbc/execute! conn ["DELETE FROM dbinfo where clickedkey = ? and clickedvalue = ? and tablexaxis = ? and tableyaxis = ?" clickedKey clickedValue tablexAxis tableyAxis]))
        (if (not (= pointInfo "erase"))
            (jdbc/with-db-connection [conn db-spec]
                (jdbc/execute! conn ["INSERT INTO dbinfo (clickedkey, clickedvalue, tablexaxis, tableyaxis, pointinfo) VALUES (?,?,?,?,?)" clickedKey clickedValue tablexAxis tableyAxis pointInfo]))
        )
        (str "ok")
)

(api/defendpoint GET "/get/:clickedKey/:clickedValue/:tablexAxis/:tableyAxis/"
  [clickedKey clickedValue tablexAxis tableyAxis]
  (dbinfoGet clickedKey clickedValue tablexAxis tableyAxis))

(api/defendpoint GET "/set/:clickedKey/:clickedValue/:tablexAxis/:tableyAxis/:pointInfo/"
  [clickedKey clickedValue tablexAxis tableyAxis pointInfo]
  (dbinfoSet clickedKey clickedValue tablexAxis tableyAxis pointInfo))

(api/define-routes)