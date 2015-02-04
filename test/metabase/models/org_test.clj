(ns metabase.models.org-test
  (:require [clojure.tools.logging :as log]
            [clojure.java.jdbc :as jdbc]
            [metabase.db :refer :all]
            [metabase.config :refer [app-defaults]]
            [metabase.models.org :refer [Org]]
            [korma.core :refer :all]
            [midje.sweet :refer :all]))


(defn liquibase-up []
  (let [conn (jdbc/get-connection {:subprotocol "h2"
                                   :subname (get-db-file)})]
    (com.metabase.corvus.migrations.LiquibaseMigrations/setupDatabase conn)))

(defn liquibase-down []
  (let [conn (jdbc/get-connection {:subprotocol "h2"
                                   :subname (get-db-file)})]
    (com.metabase.corvus.migrations.LiquibaseMigrations/teardownDatabase conn)))


(defn count-orgs []
  (get-in (first (select Org (aggregate (count :*) :cnt))) [:cnt]))


(facts "about Core model"
  (with-state-changes [(before :facts (liquibase-up))
                       (after :facts (liquibase-down))]
    (fact "starts with 0 entries"
      (count-orgs) => 0)
    (fact "can insert new entries"
      (let [result (insert Org (values {:name "test"
                            :slug "test"
                            :inherits false}))]
        (nil? result) => false
        (> 0 (or (get-in result [:generated_key]) (get-in result [:scope_identity()]) -1)))
      (count-orgs) => 1)
    ))
