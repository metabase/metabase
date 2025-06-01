(ns metabase.util.net
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [toucan2.core :as t2]))

(defn preprocess-details
  [details]
  (-> details
      (update :db-ids (fn [db-ids]
                        (if (string? db-ids)
                          (->> (str/split db-ids #",")
                               (mapv #(Long/parseLong ^String %)))
                          db-ids)))))
(comment
  (preprocess-details (:details (toucan2.core/select-one :model/Database :id [:= 5]))))

(defn preprocess-db-details
  [db]
  (-> db
      (update :details preprocess-details)
      (assoc-in [:details :engine] (:engine db))))
(comment
  (preprocess-db-details (toucan2.core/select-one :model/Database :id [:= 5])))

(defn preprocess-slave-db-details
  [db]
  (assert (nil? (get-in db [:details :engine])))
  (assoc-in db [:details :engine] (:engine db)))

(defn preprocessed-slave-dbs
  [db]
  (let [slave-ids (-> db preprocess-db-details (get-in [:details :db-ids]))]
    (mapv preprocess-slave-db-details
          (t2/select :model/Database :id [:in slave-ids]))))
(comment
  (slaves (t2/select-one :model/Database :id 5)))

(defn fetch-tables-for-a-slave
  [db])

(defn preprocess-our-table
  [table]
  (update table :description #(Long/parseLong %)))

(defn master-database
  [db]
  (preprocess-db-details db))

(defn preprocess-master-table
  [table]
  (m/update-existing table :description #(Long/parseLong %)))

(defn master-tables
  [db]
  (let [{:keys [id]} (master-database db)]
    (t2/select-fn-vec preprocess-master-table :model/Table :db_id id)))

(defn preprocess-master-field
  [field]
  (m/update-existing field :description #(Long/parseLong %)))

(defn master-fields
  [db]
  (when-some [master-tables* (seq @(def kokocit (master-tables db)))]
    (t2/select-fn-vec preprocess-master-field :model/Field :table_id [:in (map :id master-tables*)])))

(defn slave-fields
  [master-db]
  (let [master-db* @(def mdmd (master-database master-db))
        slave-db-ids (-> master-db* :details :db-ids)
        slave-tables @(def stst (t2/select :model/Table :db_id [:in slave-db-ids]))
        slave-table-ids (map :id slave-tables)
        slave-fields (t2/select :model/Field :table_id [:in slave-table-ids])]
    slave-fields))

(defn- slave-databases
  [master-database]
  (let [db-ids (-> master-database :details :db-ids)]
    (assert (and (< 1 (count db-ids)) (every? pos-int? db-ids)))
    (t2/select :model/Database :id [:in db-ids])))

;; continue here!!! based on this stuff make the fields sync work... requires lot of typing, however not that complicated
(defn slave-tables
  [master-database*]
  (let [master-database* (master-database master-database*)
        slave-databases* (slave-databases master-database*)
        slave-db-id->slave-db (m/index-by :id slave-databases*)
        slave-db-ids (keys slave-db-id->slave-db)
        tables (t2/select :model/Table :db_id [:in slave-db-ids])]
    tables))

(comment
  (slave-tables (t2/select-one :model/Database :id 5))
  (->> (slave-tables (t2/select-one :model/Database :id 5))
       (map #(select-keys % [:id :db_id :name :description]))))

(defn schema-for-slave-db
  [{:keys [id name] :as _slave-db}]
  (str name "__" id))