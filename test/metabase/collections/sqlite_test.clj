(ns metabase.collections.sqlite-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as connection]
   [metabase.app-db.core :as app-db]
   [metabase.app-db.data-source :as data-source]
   [metabase.app-db.jdbc-protocols]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.collections.children :as children]
   [metabase.request.session :as request.session]
   [toucan2.connection :as t2.conn]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)))

(set! *warn-on-reflection* true)

(deftest sqlite-example-collection-items-test
  (let [source (data-source/broken-out-details->DataSource :sqlite {:db ":memory:"})]
    (with-open [^Connection conn (.getConnection source)]
      (binding [connection/*application-db* (connection/application-db :sqlite source)
                t2.conn/*current-connectable* conn]
        (liquibase/with-liquibase [lb conn]
          (.update lb ""))
        (app-db/finish-db-setup!)
        (request.session/with-current-user 13371338
          (request.session/as-admin
            (let [result (children/collection-children
                          (t2/select-one :model/Collection :id 2)
                          {:archived? false :show-dashboard-questions? false
                           :sort-info {:sort-column :name :sort-direction :asc}})
                  items (:data result)]
              (is (= 40 (:total result)))
              (is (= 40 (count items)))
              (is (= #{{:id 1 :name "E-commerce Insights"}}
                     (into #{} (comp (filter #(= "dashboard" (:model %)))
                                     (map #(select-keys % [:id :name]))) items)))
              (is (= #{{:id 1 :name "Orders + People"}}
                     (into #{} (comp (filter #(= "dataset" (:model %)))
                                     (map #(select-keys % [:id :name]))) items))))))))))
