(ns metabase-enterprise.advanced-config.file.workspace
  (:require
   [clojure.walk :as walk]
   [metabase-enterprise.advanced-config.file.interface :as advanced-config.file.i]
   [metabase-enterprise.workspaces.core :as ws]
   [toucan2.core :as t2]))

(def example "version: 1
config:
  users:
    - first_name: dan
      last_name: sutton
      password: password
      email: dan@metabase.com
  databases:
    - name: Analytics Data Warehouse
      engine: postgres
      details:
        host: mbdata.metabase.com
        port: 5432
        user: mb__isolation_754bd_github
        password: 7Dj6LtY3Vnh=*d5&%5-#-3-FUD5=7t6-sJ9-jQPY=ka+1Q2ECfhktU4&m9u2*H
        dbname: stitchdata_incoming
        schema-filters-type: inclusion
        schema-filters-patterns: raw_github
workspace:
  name: github
  databases:
    Analytics Data Warehouse:
      input_schemas:
      - raw_github
      output_schema: mb__isolation_754bd_github")

(defn- ordered->plain [x]
  (walk/postwalk
   (fn [form]
     (if (map? form)
       (into {} form)
       form))
   x))

(defn- normalize
  [raw-config]
  (-> (ordered->plain raw-config)
      (update :databases
              (fn [dbs]
                (->> dbs
                     (map (fn [[name-kw config]]
                            (let [db-name (name name-kw)
                                  db-id (t2/select-one-pk :model/Database :name (name name-kw))]
                              [db-id (assoc config :name db-name)])))
                     (into {}))))))

(defmethod advanced-config.file.i/initialize-section! :workspace
  [_section-name section-config]
  (ws/set-config! (-> (ordered->plain section-config)
                      (update :databases (fn [dbs]
                                           (->> dbs
                                                (map (fn [[name-kw config]]
                                                       (let [db-name (name name-kw)
                                                             db-id 7 #_()]
                                                         [db-id (assoc config :name db-name)])))
                                                (into {})))))))

(comment
  (normalize
   {:name "github",
    :databases
    {(keyword "Analytics Data Warehouse")
     {:input_schemas ["raw_github"]
      :output_schema "mb__isolation_754bd_github"}}}))

