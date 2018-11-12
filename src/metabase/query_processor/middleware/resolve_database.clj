(ns metabase.query-processor.middleware.resolve-database
  (:require [metabase.util :as u]
            [metabase.query-processor.store :as qp.store]
            [metabase.models.database :as database :refer [Database]]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

(defn- resolve-database* [{database-id :database, :as query}]
  (u/prog1 query
    (when-not (= database-id database/virtual-id)
      (qp.store/store-database! (or (db/select-one (apply vector Database qp.store/database-columns-to-fetch)
                                      :id (u/get-id database-id))
                                    (throw (Exception. (str (tru "Database {0} does not exist." database-id)))))))))

(defn resolve-database
  "Middleware that resolves the Database referenced by the query under that `:database` key and stores it in the QP
  Store."
  [qp]
  (comp qp resolve-database*))
