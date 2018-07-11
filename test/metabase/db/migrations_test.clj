(ns metabase.db.migrations-test
  "Tests to make sure the data migrations actually work as expected and don't break things. Shamefully, we have way less
  of these than we should... but that doesn't mean we can't write them for our new ones :)"
  (:require [expectations :refer :all]
            [medley.core :as m]
            [metabase.db.migrations :as migrations]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [user :refer [User]]]
            [metabase.util :as u]
            [metabase.util.password :as upass]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; add-legacy-sql-directive-to-bigquery-sql-cards
(expect
  {"Card that should get directive"
   {:database true
    :type     "native"
    :native   {:query "#legacySQL\nSELECT * FROM [dataset.table];"}}
   "Card that already has directive"
   {:database true
    :type     "native"
    :native   {:query "#standardSQL\nSELECT * FROM `dataset.table`;"}}}
  ;; Create a BigQuery database with 2 SQL Cards, one that already has a directive and one that doesn't.
  (tt/with-temp* [Database [database {:engine "bigquery"}]
                  Card     [card-1   {:name          "Card that should get directive"
                                      :database_id   (u/get-id database)
                                      :dataset_query {:database (u/get-id database)
                                                      :type     :native
                                                      :native   {:query "SELECT * FROM [dataset.table];"}}}]
                  Card     [card-2   {:name          "Card that already has directive"
                                      :database_id   (u/get-id database)
                                      :dataset_query {:database (u/get-id database)
                                                      :type     :native
                                                      :native   {:query "#standardSQL\nSELECT * FROM `dataset.table`;"}}}]]
    ;; manually running the migration function should cause card-1, which needs a directive, to get updated, but
    ;; should not affect card-2.
    (#'migrations/add-legacy-sql-directive-to-bigquery-sql-cards)
    (->> (db/select-field->field :name :dataset_query Card :id [:in (map u/get-id [card-1 card-2])])
         (m/map-vals #(update % :database integer?)))))

;; Test clearing of LDAP user local passwords
(expect
  [false true]
  (do
    (tt/with-temp* [User [ldap-user {:email     "ldapuser@metabase.com"
                                     :password  "something secret"
                                     :ldap_auth true}]
                    User [user      {:email    "notanldapuser@metabase.com"
                                     :password "no change"}]]
      (#'migrations/clear-ldap-user-local-passwords)
      (let [get-pass-and-salt          #(db/select-one [User :password :password_salt] :id (u/get-id %))
            {ldap-pass :password,
             ldap-salt :password_salt} (get-pass-and-salt ldap-user)
            {user-pass :password,
             user-salt :password_salt} (get-pass-and-salt user)]
        ;; The LDAP user password should be no good now that it's been cleared and replaced
        [(upass/verify-password "something secret" ldap-salt ldap-pass)
         ;; There should be no change for a non ldap user
         (upass/verify-password "no change" user-salt user-pass)]))))
