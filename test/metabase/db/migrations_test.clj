(ns metabase.db.migrations-test
  "Tests to make sure the data migrations actually work as expected and don't break things. Shamefully, we have way less
  of these than we should... but that doesn't mean we can't write them for our new ones :)"
  (:require [clojure
             [set :as set]
             [test :refer :all]]
            [expectations :refer :all]
            [medley.core :as m]
            [metabase.db.migrations :as migrations]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as perm-group :refer [PermissionsGroup]]
             [pulse :refer [Pulse]]
             [user :refer [User]]]
            [metabase.test.data.datasets :as datasets]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util.log :as tu.log]
            [metabase.util :as u]
            [metabase.util.password :as upass]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :db))

;; add-legacy-sql-directive-to-bigquery-sql-cards
;;
;; only run this test when we're running tests for BigQuery because when a Database gets deleted it calls
;; `driver/notify-database-updated` which attempts to load the BQ driver
(datasets/expect-with-driver :bigquery
  {"Card that should get directive"
   {:database true
    :type     :native
    :native   {:query "#legacySQL\nSELECT * FROM [dataset.table];"}}
   "Card that already has directive"
   {:database true
    :type     :native
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

;; if for some reason we have a BigQuery native query that does not actually have any SQL, ignore it rather than
;; barfing (#8924) (No idea how this was possible, but clearly it was)
(datasets/expect-with-driver :bigquery
  {:database true, :type :native, :native {:query 1000}}
  (tt/with-temp* [Database [database {:engine "bigquery"}]
                  Card     [card     {:database_id   (u/get-id database)
                                      :dataset_query {:database (u/get-id database)
                                                      :type     :native
                                                      :native   {:query 1000}}}]]
    (tu.log/suppress-output
      (#'migrations/add-legacy-sql-directive-to-bigquery-sql-cards))
    (-> (db/select-one-field :dataset_query Card :id (u/get-id card))
        (update :database integer?))))

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


;;; -------------------------------------------- add-migrated-collections --------------------------------------------

(def ^:private migrated-collection-names #{"Migrated Dashboards" "Migrated Pulses" "Migrated Questions"})

(defn- do-with-add-migrated-collections-cleanup [f]
  ;; remove the root collection perms if they're already there so we don't see warnings about duplicate perms
  (try
    (doseq [group-id (db/select-ids PermissionsGroup :id [:not= (u/get-id (perm-group/admin))])]
      (perms/revoke-collection-permissions! group-id collection/root-collection))
    (f)
    (finally
      (doseq [collection-name migrated-collection-names]
        (db/delete! Collection :name collection-name)))))

(defmacro ^:private with-add-migrated-collections-cleanup [& body]
  `(do-with-add-migrated-collections-cleanup (fn [] ~@body)))

;; Should grant All Users Root Collection read permissions
(expect
  #{"/collection/root/"}
  (with-add-migrated-collections-cleanup
    (#'migrations/add-migrated-collections)
    (db/select-field :object Permissions
      :group_id (u/get-id (perm-group/all-users))
      :object   [:like "/collection/root/%"])))

;; should grant whatever other random groups perms as well
(expect
  #{"/collection/root/"}
  (with-add-migrated-collections-cleanup
    (tt/with-temp PermissionsGroup [group]
      (#'migrations/add-migrated-collections)
      (db/select-field :object Permissions
                       :group_id (u/get-id group)
                       :object   [:like "/collection/root/%"]))))

;; Should create the new Collections
(expect
  migrated-collection-names
  (with-add-migrated-collections-cleanup
    (tt/with-temp* [Pulse     [_]
                    Card      [_]
                    Dashboard [_]]
      (let [collections-before (db/select-field :name Collection)]
        (#'migrations/add-migrated-collections)
        (set/difference (db/select-field :name Collection) collections-before)))))

;; Shouldn't create new Collections for models where there's nothing to migrate
(expect
  #{"Migrated Dashboards"}
  (with-add-migrated-collections-cleanup
    (tt/with-temp* [Dashboard [_]]
      (let [collections-before (db/select-field :name Collection)]
        (#'migrations/add-migrated-collections)
        (set/difference (db/select-field :name Collection) collections-before)))))

;; Should move stuff into the new Collections as appropriate
(expect
  (with-add-migrated-collections-cleanup
    (tt/with-temp Pulse [pulse]
      (#'migrations/add-migrated-collections)
      (= (db/select-one-field :collection_id Pulse :id (u/get-id pulse))
         (db/select-one-id Collection :name "Migrated Pulses")))))

(expect
  (with-add-migrated-collections-cleanup
    (tt/with-temp Card [card]
      (#'migrations/add-migrated-collections)
      (= (db/select-one-field :collection_id Card :id (u/get-id card))
         (db/select-one-id Collection :name "Migrated Questions")))))

(expect
  (with-add-migrated-collections-cleanup
    (tt/with-temp Dashboard [dashboard]
      (#'migrations/add-migrated-collections)
      (= (db/select-one-field :collection_id Dashboard :id (u/get-id dashboard))
         (db/select-one-id Collection :name "Migrated Dashboards")))))

;; All Users shouldn't get any permissions for the 'migrated' groups
(expect
  []
  (with-add-migrated-collections-cleanup
    (tt/with-temp* [Pulse     [_]
                    Card      [_]
                    Dashboard [_]]
      (#'migrations/add-migrated-collections)
      (db/select Permissions
        {:where [:and
                 [:= :group_id (u/get-id (perm-group/all-users))]
                 (cons
                  :or
                  (for [migrated-collection-id (db/select-ids Collection :name [:in migrated-collection-names])]
                    [:like :object (format "/collection/%d/%%" migrated-collection-id)]))]}))))

;; ...nor should other groups that happen to exist
(expect
  []
  (tt/with-temp PermissionsGroup [group]
    (with-add-migrated-collections-cleanup
      (tt/with-temp* [Pulse     [_]
                      Card      [_]
                      Dashboard [_]]
        (#'migrations/add-migrated-collections)
        (db/select Permissions
          {:where [:and
                   [:= :group_id (u/get-id group)]
                   (cons
                    :or
                    (for [migrated-collection-id (db/select-ids Collection :name [:in migrated-collection-names])]
                      [:like :object (format "/collection/%d/%%" migrated-collection-id)]))]})))))
