(ns metabase.driver.sql-jdbc-test
  (:require [expectations :refer :all]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]
            [metabase.driver.util :as driver.u]
            [metabase.models
             [field :refer [Field]]
             [table :as table :refer [Table]]]
            [metabase.test.data :as data :refer :all]
            [metabase.test.data
             [datasets :as datasets]
             [env :as tx.env]
             [interface :as tx]]
            [metabase.test.util.log :as tu.log]
            [metabase.util.date :as du]
            [toucan.db :as db]))

(def ^:private users-table      (delay (Table :name "USERS")))
(def ^:private venues-table     (delay (Table (id :venues))))
(def ^:private users-name-field (delay (Field (id :users :name))))

(defonce sql-jdbc-drivers
  (delay
   (du/profile "resolve @metabase.driver.sql-jdbc-test/sql-jdbc-drivers"
     (set
      (for [driver tx.env/test-drivers
            :when  (isa? driver/hierarchy (driver/the-driver driver) (driver/the-driver :sql-jdbc))]
        (tx/the-driver-with-test-extensions driver))))))


;; DESCRIBE-DATABASE
(expect
  {:tables (set (map #(hash-map :name % :schema "PUBLIC" :description nil)
                     ["CATEGORIES" "VENUES" "CHECKINS" "USERS"]))}
  (driver/describe-database :h2 (db)))

;; DESCRIBE-TABLE
(expect
  {:name   "VENUES"
   :schema "PUBLIC"
   :fields #{{:name          "NAME",
              :database-type "VARCHAR"
              :base-type     :type/Text}
             {:name          "LATITUDE"
              :database-type "DOUBLE"
              :base-type     :type/Float}
             {:name          "LONGITUDE"
              :database-type "DOUBLE"
              :base-type     :type/Float}
             {:name          "PRICE"
              :database-type "INTEGER"
              :base-type     :type/Integer}
             {:name          "CATEGORY_ID"
              :database-type "INTEGER"
              :base-type     :type/Integer}
             {:name          "ID"
              :database-type "BIGINT"
              :base-type     :type/BigInteger
              :pk?           true}}}
  (driver/describe-table :h2 (db) @venues-table))

;; DESCRIBE-TABLE-FKS
(expect
  #{{:fk-column-name   "CATEGORY_ID"
     :dest-table       {:name   "CATEGORIES"
                        :schema "PUBLIC"}
     :dest-column-name "ID"}}
  (driver/describe-table-fks :h2 (db) @venues-table))

;;; TABLE-ROWS-SAMPLE
(datasets/expect-with-drivers @sql-jdbc-drivers
  [["20th Century Cafe"]
   ["25°"]
   ["33 Taps"]
   ["800 Degrees Neapolitan Pizzeria"]
   ["BCD Tofu House"]]
  (->> (metadata-queries/table-rows-sample (Table (data/id :venues))
         [(Field (data/id :venues :name))])
       ;; since order is not guaranteed do some sorting here so we always get the same results
       (sort-by first)
       (take 5)))


;;; TABLE-ROWS-SEQ
(datasets/expect-with-drivers @sql-jdbc-drivers
  [{:name "Red Medicine",                 :price 3, :category_id  4, :id 1}
   {:name "Stout Burgers & Beers",        :price 2, :category_id 11, :id 2}
   {:name "The Apple Pan",                :price 2, :category_id 11, :id 3}
   {:name "Wurstküche",                   :price 2, :category_id 29, :id 4}
   {:name "Brite Spot Family Restaurant", :price 2, :category_id 20, :id 5}]
  (for [row (take 5 (sort-by :id (driver/table-rows-seq driver/*driver*
                                                        (db/select-one 'Database :id (id))
                                                        (db/select-one 'Table :id (id :venues)))))]
    ;; different DBs use different precisions for these
    (-> (dissoc row :latitude :longitude)
        (update :price int)
        (update :category_id int)
        (update :id int))))


;;; Make sure invalid ssh credentials are detected if a direct connection is possible
(expect
  #"com.jcraft.jsch.JSchException:"
  (try (let [engine  :postgres
             details {:ssl            false
                      :password       "changeme"
                      :tunnel-host    "localhost" ; this test works if sshd is running or not
                      :tunnel-pass    "BOGUS-BOGUS-BOGUS"
                      :port           5432
                      :dbname         "test"
                      :host           "localhost"
                      :tunnel-enabled true
                      :tunnel-port    22
                      :engine         :postgres
                      :user           "postgres"
                      :tunnel-user    "example"}]
         (tu.log/suppress-output
           (driver.u/can-connect-with-details? engine details :throw-exceptions)))
       (catch Exception e
         (.getMessage e))))
