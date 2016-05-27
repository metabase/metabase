(ns metabase.api.upload
  "/api/upload endpoints."
  (:require [compojure.core :refer [GET POST PUT DELETE]]
            [clojure.string :refer [replace]]
            [clojure.java.jdbc :refer :all]
            [clojure.tools.logging :as log]
            [clojure-csv.core :refer [parse-csv]]
            [korma.core :as k]
            [metabase.api.common :refer :all]
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.events :as events]
            (metabase.models common
                             [hydrate :refer [hydrate]]
                             [database :refer [Database protected-password]]
                             [field :refer [Field]]
                             [table :refer [Table]])))



(def db
  {:classname   "org.sqlite.JDBC"
   :subprotocol "sqlite"
   :subname     "uploads.db"
   })

(defn create-db [name cols]
  (let [new-name (keyword (replace (str name " " (new java.util.Date)) #"[^a-zA-Z0-9_]" "_"))
        ddl (apply create-table-ddl (concat [new-name] cols))]
    (log/info (str ddl))
    (db-do-commands db ddl)
    new-name))

(defn create-or-sync-db
  []
  (let [db (first (filter #(-> % :details :db (= "uploads.db")) (sel :many Database)))]
    (if db
      (do (events/publish-event :database-trigger-sync db)
        db)
      (let [new-db (ins Database :name "Uploads" :engine "sqlite" :details {:db "uploads.db"})]
        (events/publish-event :database-create new-db)
        new-db))))

(defendpoint POST "/upload_table"
  "Add a file to the uploaded tables"
  [:as {body :body}]
  (let [csv        (slurp body)
        parsed     (parse-csv csv)
        col-names  (map keyword (first parsed))
        cols       (map #(-> [% :text]) col-names)
        rows       (map #(into {} (map vector col-names %)) (rest parsed))
        table-name (create-db "Uploaded " cols)]
    (apply insert! (concat [db table-name] rows))
    (let [db    (create-or-sync-db)
          table (loop []
            (let [table (sel :one Table :name (name table-name))]
              (if table
                table
                (do (log/info "sleeping")
                    (Thread/sleep 1000)
                    (recur)))))]
      {:status "ok"
       :db (:id db)
       :table (:id table)})))

(define-routes)
