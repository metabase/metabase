(ns metabase.driver.mongo.connection
  (:require (monger [collection :as mc]
                    [command :as cmd]
                    [conversion :as conv]
                    [core :as mg])
            [metabase.driver :as driver]
            [metabase.driver.mongo.util :refer [with-db-connection]]))

;; ## LOADING TEST DATA
;; curl http://media.mongodb.org/zips.json > mongo_zips.json
;; mongod && mongoimport --db test --collection zips --file mongo_zips.json

;; ## METHOD IMPLS

(defmethod driver/connection-details :mongo [database]
  ;; do we *actually* need to implement this ?
  "TODO")

(defmethod driver/connection :mongo [database]
  ;; (I don't think we need to implement this on either)
  "TODO")

(defmethod driver/can-connect? :mongo [{{connection-string :conn_str} :details}]
  (= (with-db-connection [db connection-string]
       (-> (cmd/db-stats db)
           (conv/from-db-object :keywordize)
           :ok))
     1.0))

(defmethod driver/can-connect-with-details? :mongo [{:keys [user password host port dbname]}]
  (driver/can-connect? {:engine :mongo
                        :details {:conn_str (str "mongodb://"
                                                 user
                                                 (when password
                                                   (assert user "Can't have a password without a user!")
                                                   (str ":" password))
                                                 (when user "@")
                                                 host
                                                 (when port
                                                   (str ":" port))
                                                 "/"
                                                 dbname)}}))
