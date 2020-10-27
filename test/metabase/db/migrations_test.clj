(ns metabase.db.migrations-test
  "Tests to make sure the data migrations actually work as expected and don't break things. Shamefully, we have way less
  of these than we should... but that doesn't mean we can't write them for our new ones :)"
  (:require [clojure
             [set :as set]
             [test :refer :all]]
            [medley.core :as m]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.db.migrations :as migrations]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [database :refer [Database]]
             [permissions :as perms :refer [Permissions]]
             [permissions-group :as group :refer [PermissionsGroup]]
             [pulse :refer [Pulse]]
             [user :refer [User]]]
            [metabase.test.fixtures :as fixtures]
            [metabase.util.password :as u.password]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

;; only run these tests when we're running tests for BigQuery because when a Database gets deleted it calls
;; `driver/notify-database-updated` which attempts to load the BQ driver
(deftest add-legacy-sql-directive-to-bigquery-sql-cards-test
  (mt/test-driver :bigquery
    ;; Create a BigQuery database with 2 SQL Cards, one that already has a directive and one that doesn't.
    (mt/with-temp* [Database [database {:engine "bigquery"}]
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
      (is (= {"Card that should get directive"
              {:database true
               :type     :native
               :native   {:query "#legacySQL\nSELECT * FROM [dataset.table];"}}
              "Card that already has directive"
              {:database true
               :type     :native
               :native   {:query "#standardSQL\nSELECT * FROM `dataset.table`;"}}}
             (->> (db/select-field->field :name :dataset_query Card :id [:in (map u/get-id [card-1 card-2])])
                  (m/map-vals #(update % :database integer?))))))))

(deftest add-legacy-sql-directive-to-bigquery-sql-cards-empty-query-test
  (mt/test-driver :bigquery
    (testing (str "If for some reason we have a BigQuery native query that does not actually have any SQL, ignore it "
                  "rather than barfing (#8924) (No idea how this was possible, but clearly it was)")
      (mt/with-temp* [Database [database {:engine "bigquery"}]
                      Card     [card     {:database_id   (u/get-id database)
                                          :dataset_query {:database (u/get-id database)
                                                          :type     :native
                                                          :native   {:query 1000}}}]]
        (mt/suppress-output
          (#'migrations/add-legacy-sql-directive-to-bigquery-sql-cards))
        (is (= {:database true, :type :native, :native {:query 1000}}
               (-> (db/select-one-field :dataset_query Card :id (u/get-id card))
                   (update :database integer?))))))))

(deftest clear-ldap-user-local-passwords-test
  (testing "Test clearing of LDAP user local passwords"
    (mt/with-temp* [User [ldap-user {:email     "ldapuser@metabase.com"
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
        (testing "The LDAP user password should be no good now that it's been cleared and replaced"
          (is (= false
                 (u.password/verify-password "something secret" ldap-salt ldap-pass))))
        (testing "There should be no change for a non ldap user"
          (is (= true
                 (u.password/verify-password "no change" user-salt user-pass))))))))


;;; -------------------------------------------- add-migrated-collections --------------------------------------------

(def ^:private migrated-collection-names #{"Migrated Dashboards" "Migrated Pulses" "Migrated Questions"})

(defn- do-with-add-migrated-collections-cleanup [f]
  ;; remove the root collection perms if they're already there so we don't see warnings about duplicate perms
  (try
    (doseq [group-id (db/select-ids PermissionsGroup :id [:not= (u/get-id (group/admin))])]
      (perms/revoke-collection-permissions! group-id collection/root-collection))
    (f)
    (finally
      (doseq [collection-name migrated-collection-names]
        (db/delete! Collection :name collection-name)))))

(defmacro ^:private with-add-migrated-collections-cleanup [& body]
  `(do-with-add-migrated-collections-cleanup (fn [] ~@body)))

(deftest add-migrated-collections-root-read-perms-test
  (testing "should grant Root Collection read perms"
    (with-add-migrated-collections-cleanup
      (mt/with-temp PermissionsGroup [group]
        (#'migrations/add-migrated-collections)
        (letfn [(perms [group]
                  (db/select-field :object Permissions
                    :group_id (u/get-id group)
                    :object   [:like "/collection/root/%"]))]
          (testing "to All Users"
            (is (= #{"/collection/root/"}
                   (perms (group/all-users)))))
          (testing "to other groups"
            (is (= #{"/collection/root/"}
                   (perms group)))))))))

(deftest add-migrated-collections-create-collections-test
  (testing "Should create the new Collections"
    (with-add-migrated-collections-cleanup
      (mt/with-temp* [Pulse     [_]
                      Card      [_]
                      Dashboard [_]]
        (#'migrations/add-migrated-collections)
        (let [collections (db/select-field :name Collection)]
          (doseq [collection-name migrated-collection-names]
            (is (contains? collections collection-name)))))))

  (testing "Shouldn't create new Collections for models where there's nothing to migrate"
    (with-add-migrated-collections-cleanup
      (mt/with-temp Dashboard [_]
        (let [collections-before (db/select-field :name Collection)
              orig-db-exists?    db/exists?]
          ;; pretend no Pulses or Cards exist if we happen to be running this from the REPL.
          (with-redefs [db/exists? (fn [model & args]
                                     (if (#{Pulse Card} model)
                                       false
                                       (apply orig-db-exists? model args)))]
            (#'migrations/add-migrated-collections)
            (is (= #{"Migrated Dashboards"}
                   (set/difference (db/select-field :name Collection) collections-before)))))))))

(deftest add-migrated-collections-move-objects-test
  (testing "Should move stuff into the new Collections as appropriate"
    (testing "Pulse"
      (with-add-migrated-collections-cleanup
        (mt/with-temp Pulse [pulse]
          (#'migrations/add-migrated-collections)
          (is (= (db/select-one-field :collection_id Pulse :id (u/get-id pulse))
                 (db/select-one-id Collection :name "Migrated Pulses"))))))

    (testing "Card"
      (with-add-migrated-collections-cleanup
        (mt/with-temp Card [card]
          (#'migrations/add-migrated-collections)
          (is (= (db/select-one-field :collection_id Card :id (u/get-id card))
                 (db/select-one-id Collection :name "Migrated Questions"))))))

    (testing "Dashboard"
      (with-add-migrated-collections-cleanup
        (mt/with-temp Dashboard [dashboard]
          (#'migrations/add-migrated-collections)
          (is (= (db/select-one-field :collection_id Dashboard :id (u/get-id dashboard))
                 (db/select-one-id Collection :name "Migrated Dashboards"))))))))

(deftest add-migrated-collections-perms-test
  (with-add-migrated-collections-cleanup
    (mt/with-temp* [PermissionsGroup [group]
                    Pulse            [_]
                    Card             [_]
                    Dashboard        [_]]
      (#'migrations/add-migrated-collections)
      (letfn [(perms [group]
                (db/select Permissions
                  {:where [:and
                           [:= :group_id (u/get-id (group/all-users))]
                           (cons
                            :or
                            (for [migrated-collection-id (db/select-ids Collection :name [:in migrated-collection-names])]
                              [:like :object (format "/collection/%d/%%" migrated-collection-id)]))]}))]
        (testing "All Users shouldn't get any permissions for the 'migrated' groups"
          (is (= []
                 (perms (group/all-users)))))
        (testing "...nor should other groups that happen to exist"
          (is (= []
                 (perms group))))))))
