(ns metabase.driver.mongo.test-data
  "Functionality related to creating / loading a test database for the Mongo driver."
  (:require [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            (metabase.test.data [data :as data]
                                [mongo :as loader])
            [metabase.util :as u]))

;; ## MONGO-TEST-DB + OTHER DELAYS

(defonce
  ^{:doc "A delay that fetches or creates the Mongo test `Database`.
          If DB is created, `load-data` and `sync-database!` are called to get the DB in a state that we can use for testing."}
  mongo-test-db
  (delay (@(resolve 'metabase.test.data/get-or-create-database!) (loader/dataset-loader) data/test-data)))

(defonce
  ^{:doc "A Delay that returns the ID of `mongo-test-db`, forcing creation of it if needed."}
  mongo-test-db-id
  (delay (let [id (:id @mongo-test-db)]
           (assert (integer? id))
           id)))
