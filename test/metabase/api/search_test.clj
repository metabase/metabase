(ns metabase.api.search-test
  (:require [clojure.set :as set]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.api.search :as api.search]
            [metabase.models :refer [Card CardFavorite Collection Dashboard DashboardCard DashboardFavorite Database
                                     Metric PermissionsGroup PermissionsGroupMembership Pulse PulseCard Segment Table]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.test :as mt]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private default-search-row
  {:id                  true
   :description         nil
   :display_name        nil
   :archived            false
   :collection_id       false
   :collection_position nil
   :collection_name     nil
   :favorite            nil
   :table_id            false
   :database_id         false
   :table_schema        nil
   :table_name          nil
   :table_description   nil})

(defn- table-search-results
  "Segments and Metrics come back with information about their Tables as of 0.33.0. The `model-defaults` for Segment and
  Metric put them both in the `:checkins` Table."
  []
  (merge
   {:table_id true, :database_id true}
   (db/select-one [Table [:name :table_name] [:schema :table_schema] [:description :table_description]]
     :id (mt/id :checkins))))

(defn- sorted-results [results]
  (sort-by (juxt (comp (var-get #'api.search/model->sort-position) :model) :name) results))

(defn- default-search-results []
  (sorted-results
   [(merge
     default-search-row
     {:name "dashboard test dashboard", :model "dashboard", :favorite false})
    (merge
     default-search-row
     {:name "collection test collection", :model "collection", :collection_id true, :collection_name true})
    (merge
     default-search-row
     {:name "card test card", :model "card", :favorite false})
    (merge
     default-search-row
     {:name "pulse test pulse", :model "pulse", :archived nil})
    (merge
     default-search-row
     {:model "metric", :name "metric test metric", :description "Lookin' for a blueberry"}
     (table-search-results))
    (merge
     default-search-row
     {:model "segment", :name "segment test segment", :description "Lookin' for a blueberry"}
     (table-search-results))]))

(defn- default-metric-segment-results []
  (filter #(contains? #{"metric" "segment"} (:model %)) (default-search-results)))

(defn- default-archived-results []
  (for [result (default-search-results)
        :when (false? (:archived result))]
    (assoc result :archived true)))

(defn- on-search-types [model-set f coll]
  (for [search-item coll]
    (if (contains? model-set (:model search-item))
      (f search-item)
      search-item)))

(defn- default-results-with-collection []
  (on-search-types #{"dashboard" "pulse" "card"}
                   #(assoc % :collection_id true, :collection_name true)
                   (default-search-results)))

(defn- do-with-search-items [search-string in-root-collection? f]
  (let [data-map      (fn [instance-name]
                        {:name (format instance-name search-string),})
        coll-data-map (fn [instance-name collection]
                        (merge (data-map instance-name)
                               (when-not in-root-collection?
                                 {:collection_id (u/get-id collection)})))]
    (mt/with-temp* [Collection [coll      (data-map "collection %s collection")]
                    Card       [card      (coll-data-map "card %s card" coll)]
                    Dashboard  [dashboard (coll-data-map "dashboard %s dashboard" coll)]
                    Pulse      [pulse     (coll-data-map "pulse %s pulse" coll)]
                    Metric     [metric    (data-map "metric %s metric")]
                    Segment    [segment   (data-map "segment %s segment")]]
      (f {:collection coll
          :card       card
          :dashboard  dashboard
          :pulse      pulse
          :metric     metric
          :segment    segment}))))

(defmacro ^:private with-search-items-in-root-collection [search-string & body]
  `(do-with-search-items ~search-string true (fn [~'_] ~@body)))

(defmacro ^:private with-search-items-in-collection [created-items-sym search-string & body]
  `(do-with-search-items ~search-string false (fn [~created-items-sym] ~@body)))

(def ^:private ^:dynamic *search-request-results-database-id*
  "Filter out all results from `search-request` that don't have this Database ID. Default: the default H2 `test-data`
  Database. Other results are filtered out so these tests can be ran from the REPL without the presence of other
  Databases causing the tests to fail."
  mt/id)

(defn- search-request [user-kwd & params]
  (let [raw-results      (apply (mt/user->client user-kwd) :get 200 "search" params)
        keep-database-id (if (fn? *search-request-results-database-id*)
                           (*search-request-results-database-id*)
                           *search-request-results-database-id*)]
    (if (:error raw-results)
      raw-results
      (vec
       (sorted-results
        (for [result raw-results
              ;; filter out any results not from the usual test data DB (e.g. results from other drivers)
              :when  (contains? #{keep-database-id nil} (:database_id result))]
          (-> result
              mt/boolean-ids-and-timestamps
              (update :collection_name #(some-> % string?)))))))))

(deftest basic-test
  (testing "Basic search, should find 1 of each entity type, all items in the root collection"
    (with-search-items-in-root-collection "test"
      (is (= (default-search-results)
             (search-request :crowberto :q "test")))))

  (testing (str "Search with no search string. Note this search everything in the DB, including any stale data left "
                "behind from previous tests. Instead of an = comparison here, just ensure our default results are "
                "included")
    (with-search-items-in-root-collection "test"
      (is (set/subset?
           (set (default-search-results))
           (set (search-request :crowberto))))))

  (testing "Basic search should only return substring matches"
    (with-search-items-in-root-collection "test"
      (with-search-items-in-root-collection "something different"
        (is (= (default-search-results)
               (search-request :crowberto :q "test")))))))

(deftest permissions-test
  (testing (str "Ensure that users without perms for the root collection don't get results NOTE: Metrics and segments "
                "don't have collections, so they'll be returned")
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-root-collection "test"
        (is (= (default-metric-segment-results)
               (search-request :rasta :q "test"))))))

  (testing "Users that have root collection permissions should get root collection search results"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-root-collection "test"
        (mt/with-temp* [PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/get-id group)}]]
          (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
          (is (= (remove (comp #{"collection"} :model) (default-search-results))
                 (search-request :rasta :q "test")))))))

  (testing "Users without root collection permissions should still see other collections they have access to"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {:keys [collection]} "test"
        (with-search-items-in-root-collection "test2"
          (mt/with-temp* [PermissionsGroup           [group]
                          PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/get-id group)}]]
            (perms/grant-collection-read-permissions! group (u/get-id collection))
            (is (= (sorted-results
                    (into
                     (default-results-with-collection)
                     (map #(merge default-search-row % (table-search-results))
                          [{:name "metric test2 metric", :description "Lookin' for a blueberry", :model "metric"}
                           {:name "segment test2 segment", :description "Lookin' for a blueberry", :model "segment"}])))
                   (search-request :rasta :q "test"))))))))

  (testing (str "Users with root collection permissions should be able to search root collection data long with "
                "collections they have access to")
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {:keys [collection]} "test"
        (with-search-items-in-root-collection "test2"
          (mt/with-temp* [PermissionsGroup           [group]
                          PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/get-id group)}]]
            (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
            (perms/grant-collection-read-permissions! group collection)
            (is (= (sorted-results
                    (into
                     (default-results-with-collection)
                     (for [row   (default-search-results)
                           :when (not= "collection" (:model row))]
                       (update row :name #(str/replace % "test" "test2")))))
                   (search-request :rasta :q "test"))))))))

  (testing "Users with access to multiple collections should see results from all collections they have access to"
    (with-search-items-in-collection {coll-1 :collection} "test"
      (with-search-items-in-collection {coll-2 :collection} "test2"
        (mt/with-temp* [PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/get-id group)}]]
          (perms/grant-collection-read-permissions! group (u/get-id coll-1))
          (perms/grant-collection-read-permissions! group (u/get-id coll-2))
          (is (= (sorted-results
                  (into
                   (default-results-with-collection)
                   (map (fn [row] (update row :name #(str/replace % "test" "test2")))
                        (default-results-with-collection))))
                 (search-request :rasta :q "test")))))))

  (testing "User should only see results in the collection they have access to"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {coll-1 :collection} "test"
        (with-search-items-in-collection {coll-2 :collection} "test2"
          (mt/with-temp* [PermissionsGroup           [group]
                          PermissionsGroupMembership [_ {:user_id (mt/user->id :rasta), :group_id (u/get-id group)}]]
            (perms/grant-collection-read-permissions! group (u/get-id coll-1))
            (is (= (sorted-results
                    (into
                     (default-results-with-collection)
                     (map #(merge default-search-row % (table-search-results))
                          [{:name "metric test2 metric", :description "Lookin' for a blueberry", :model "metric"}
                           {:name "segment test2 segment", :description "Lookin' for a blueberry", :model "segment"}])))
                   (search-request :rasta :q "test"))))))))

  (testing "Metrics on tables for which the user does not have access to should not show up in results"
    (mt/with-temp* [Database [{db-id :id}]
                    Table    [{table-id :id} {:db_id  db-id
                                              :schema nil}]
                    Metric   [_ {:table_id table-id
                                 :name     "test metric"}]]
      (perms/revoke-permissions! (group/all-users) db-id)
      (is (= []
             (search-request :rasta :q "test")))))

  (testing "Segments on tables for which the user does not have access to should not show up in results"
    (mt/with-temp* [Database [{db-id :id}]
                    Table    [{table-id :id} {:db_id  db-id
                                              :schema nil}]
                    Segment  [_ {:table_id table-id
                                 :name     "test segment"}]]
      (perms/revoke-permissions! (group/all-users) db-id)
      (is (= []
             (search-request :rasta :q "test"))))))

(deftest favorites-test
  (testing "Favorites are per user, so other user's favorites don't cause search results to be favorited"
    (with-search-items-in-collection {:keys [card dashboard]} "test"
      (mt/with-temp* [CardFavorite      [_ {:card_id  (u/get-id card)
                                            :owner_id (mt/user->id :rasta)}]
                      DashboardFavorite [_ {:dashboard_id (u/get-id dashboard)
                                            :user_id      (mt/user->id :rasta)}]]
        (is (= (default-results-with-collection)
               (search-request :crowberto :q "test"))))))

  (testing "Basic search, should find 1 of each entity type and include favorites when available"
    (with-search-items-in-collection {:keys [card dashboard]} "test"
      (mt/with-temp* [CardFavorite      [_ {:card_id  (u/get-id card)
                                            :owner_id (mt/user->id :crowberto)}]
                      DashboardFavorite [_ {:dashboard_id (u/get-id dashboard)
                                            :user_id      (mt/user->id :crowberto)}]]
        (is (= (on-search-types #{"dashboard" "card"}
                                #(assoc % :favorite true)
                                (default-results-with-collection))
               (search-request :crowberto :q "test")))))))

(defn- archived [m]
  (assoc m :archived true))

(deftest archived-results-test
  (testing "Should return unarchived results by default"
    (with-search-items-in-root-collection "test"
      (mt/with-temp* [Card       [_ (archived {:name "card test card 2"})]
                      Dashboard  [_ (archived {:name "dashboard test dashboard 2"})]
                      Collection [_ (archived {:name "collection test collection 2"})]
                      Metric     [_ (archived {:name "metric test metric 2"})]
                      Segment    [_ (archived {:name "segment test segment 2"})]]
        (is (= (default-search-results)
               (search-request :crowberto :q "test"))))))

  (testing "Should return archived results when specified"
    (with-search-items-in-root-collection "test2"
      (mt/with-temp* [Card       [_ (archived {:name "card test card"})]
                      Dashboard  [_ (archived {:name "dashboard test dashboard"})]
                      Collection [_ (archived {:name "collection test collection"})]
                      Metric     [_ (archived {:name "metric test metric"})]
                      Segment    [_ (archived {:name "segment test segment"})]]
        (is (= (default-archived-results)
               (search-request :crowberto :q "test", :archived "true")))))))

(deftest alerts-test
  (testing "Search should not return alerts"
    (with-search-items-in-root-collection "test"
      (mt/with-temp* [Pulse [pulse {:alert_condition  "rows"
                                    :alert_first_only false
                                    :alert_above_goal nil
                                    :name             nil}]]
        (is (= []
               (filter (fn [{:keys [model id]}]
                         (and (= id (u/the-id pulse))
                              (= "pulse" model)))
                       (mt/user-http-request :crowberto :get 200 "search"))))))))

(defn- default-table-search-row [table-name]
  (merge
   default-search-row
   {:name         table-name
    :display_name table-name
    :table_name   table-name
    :table_id     true
    :archived     nil
    :model        "table"
    :database_id  true}))

(defmacro ^:private do-test-users {:style/indent 1} [[user-binding users] & body]
  `(doseq [user# ~users
           :let [~user-binding user#]]
     (testing (format "\nuser = %s" user#)
       ~@body)))

(deftest table-test
  (testing "You should see Tables in the search results!\n"
    (mt/with-temp Table [table {:name "Round Table"}]
      (do-test-users [user [:crowberto :rasta]]
        (is (= [(default-table-search-row "Round Table")]
               (search-request user :q "Round Table"))))))
  (testing "You should be able to search by their display name"
    (mt/with-temp Table [table {:name "Round Table" :display_name "Lancelot's Favorite Furniture"}]
      (do-test-users [user [:crowberto :rasta]]
        (is (= [(assoc (default-table-search-row "Round Table") :display_name "Lancelot's Favorite Furniture")]
               (search-request user :q "Lancelot"))))))
  (testing "When searching with ?archived=true, normal Tables should not show up in the results"
    (let [table-name (mt/random-name)]
      (mt/with-temp Table [table {:name table-name}]
        (do-test-users [user [:crowberto :rasta]]
          (is (= []
                 (search-request user :q table-name :archived true)))))))
  (testing "*archived* tables should not appear in search results"
    (let [table-name (mt/random-name)]
      (mt/with-temp Table [table {:name table-name, :active false}]
        (do-test-users [user [:crowberto :rasta]]
          (is (= []
                 (search-request user :q table-name)))))))
  (testing "you should not be able to see a Table if the current user doesn't have permissions for that Table"
    (mt/with-temp* [Database [{db-id :id}]
                    Table    [table {:db_id db-id}]]
      (perms/revoke-permissions! (group/all-users) db-id)
      (is (= []
             (binding [*search-request-results-database-id* db-id]
               (search-request :rasta :q (:name table))))))))

(deftest all-users-no-perms-table-test
  (testing (str "If the All Users group doesn't have perms to view a Table, but the current User is in a group that "
                "does have perms, they should still be able to see it (#12332)")
    (mt/with-temp* [Database                   [{db-id :id}]
                    Table                      [table {:name "Round Table", :db_id db-id}]
                    PermissionsGroup           [{group-id :id}]
                    PermissionsGroupMembership [_ {:group_id group-id, :user_id (mt/user->id :rasta)}]]
      (perms/revoke-permissions! (group/all-users) db-id (:schema table) (:id table))
      (perms/grant-permissions! group-id (perms/table-read-path table))
      (do-test-users [user [:crowberto :rasta]]
        (is (= [(default-table-search-row "Round Table")]
               (binding [*search-request-results-database-id* db-id]
                 (search-request user :q "Round Table"))))))))

(deftest collection-namespaces-test
  (testing "Search should only return Collections in the 'default' namespace"
    (mt/with-temp* [Collection [c1 {:name "Normal Collection"}]
                    Collection [c2 {:name "Coin Collection", :namespace "currency"}]]
      (is (= ["Normal Collection"]
             (->> (search-request :crowberto :q "Collection")
                  (filter #(and (= (:model %) "collection")
                                (#{"Normal Collection" "Coin Collection"} (:name %))))
                  (map :name)))))))

(deftest no-dashboard-subscription-pulses-test
  (testing "Pulses used for Dashboard subscriptions should not be returned by search results (#14190)"
    (letfn [(search-for-pulses [{pulse-id :id}]
              (->> (mt/user-http-request :crowberto :get "search?q=electro")
                   (filter #(and (= (:model %) "pulse")
                                 (= (:id %) pulse-id)))
                   first))]
      (mt/with-temp Pulse [pulse {:name "Electro-Magnetic Pulse"}]
        (testing "sanity check: should be able to fetch a Pulse normally"
          (is (schema= {:name (s/eq "Electro-Magnetic Pulse")
                        s/Keyword s/Any}
                       (search-for-pulses pulse))))
        (mt/with-temp* [Card      [card-1]
                        PulseCard [pc-1 {:pulse_id (:id pulse), :card_id (:id card-1)}]
                        Card      [card-2]
                        PulseCard [pc-2 {:pulse_id (:id pulse), :card_id (:id card-2)}]]
          (testing "Create some Pulse Cards: should still be able to search for it it"
            (is (schema= {:name     (s/eq "Electro-Magnetic Pulse")
                          s/Keyword s/Any}
                         (search-for-pulses pulse))))
          (testing "Now make this Pulse a dashboard subscription; Pulse should no longer come back from search-results"
            (mt/with-temp* [Dashboard [dashboard]]
              (db/update! Pulse (:id pulse) :dashboard_id (:id dashboard))
              (is (= nil
                     (search-for-pulses pulse))))))))))
