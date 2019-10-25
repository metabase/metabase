(ns metabase.api.search-test
  (:require [clojure
             [set :as set]
             [string :as str]]
            [expectations :refer [expect]]
            [metabase.models
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [collection :as coll :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [database :refer [Database]]
             [metric :refer [Metric]]
             [permissions :as perms]
             [permissions-group :as group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [pulse :refer [Pulse]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.users :as test-users]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

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
     :id (data/id :checkins))))

(defn- sorted-results [results]
  (sort-by (juxt :model :name) results))

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
    (tt/with-temp* [Collection [coll      (data-map "collection %s collection")]
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

(defn- search-request [user-kwd & params]
  (vec
   (sorted-results
    (let [raw-results (apply (test-users/user->client user-kwd) :get 200 "search" params)]
      (for [result raw-results
            ;; filter out any results not from the usual test data DB (e.g. results from other drivers)
            :when  (contains? #{(data/id) nil} (:database_id result))]
        (-> result
            tu/boolean-ids-and-timestamps
            (update :collection_name #(some-> % string?))))))))

;; Basic search, should find 1 of each entity type, all items in the root collection
(expect
  (default-search-results)
  (with-search-items-in-root-collection "test"
    (search-request :crowberto :q "test")))

;; Search with no search string. Note this search everything in the DB, including any stale data left behind from
;; previous tests. Instead of an = comparison here, just ensure our default results are included
(expect
  (set/subset?
   (set (default-search-results))
   (set (with-search-items-in-root-collection "test"
          (search-request :crowberto)))))

;; Ensure that users without perms for the root collection don't get results
;; NOTE: Metrics and segments don't have collections, so they'll be returned
(expect
  (default-metric-segment-results)
  (tu/with-non-admin-groups-no-root-collection-perms
    (with-search-items-in-root-collection "test"
      (search-request :rasta :q "test"))))

;; Users that have root collection permissions should get root collection search results
(expect
  (remove (comp #{"collection"} :model) (default-search-results))
  (tu/with-non-admin-groups-no-root-collection-perms
    (with-search-items-in-root-collection "test"
      (tt/with-temp* [PermissionsGroup           [group]
                      PermissionsGroupMembership [_ {:user_id (test-users/user->id :rasta), :group_id (u/get-id group)}]]
        (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection/is-root? true}))
        (search-request :rasta :q "test")))))

;; Users without root collection permissions should still see other collections they have access to
(expect
  (sorted-results
   (into
    (default-results-with-collection)
    (map #(merge default-search-row % (table-search-results))
         [{:name "metric test2 metric", :description "Lookin' for a blueberry", :model "metric"}
          {:name "segment test2 segment", :description "Lookin' for a blueberry", :model "segment"}])))
  (tu/with-non-admin-groups-no-root-collection-perms
    (with-search-items-in-collection {:keys [collection]} "test"
      (with-search-items-in-root-collection "test2"
        (tt/with-temp* [PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (test-users/user->id :rasta), :group_id (u/get-id group)}]]
          (perms/grant-collection-read-permissions! group (u/get-id collection))
          (search-request :rasta :q "test"))))))

;; Users with root collection permissions should be able to search root collection data long with collections they
;; have access to
(expect
  (sorted-results
   (into
    (default-results-with-collection)
    (for [row   (default-search-results)
          :when (not= "collection" (:model row))]
      (update row :name #(str/replace % "test" "test2")))))
  (tu/with-non-admin-groups-no-root-collection-perms
    (with-search-items-in-collection {:keys [collection]} "test"
      (with-search-items-in-root-collection "test2"
        (tt/with-temp* [PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (test-users/user->id :rasta), :group_id (u/get-id group)}]]
          (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection/is-root? true}))
          (perms/grant-collection-read-permissions! group collection)
          (search-request :rasta :q "test"))))))

;; Users with access to multiple collections should see results from all collections they have access to
(expect
  (sorted-results
   (into
    (default-results-with-collection)
    (map (fn [row] (update row :name #(str/replace % "test" "test2")))
         (default-results-with-collection))))
  (with-search-items-in-collection {coll-1 :collection} "test"
    (with-search-items-in-collection {coll-2 :collection} "test2"
      (tt/with-temp* [PermissionsGroup           [group]
                      PermissionsGroupMembership [_ {:user_id (test-users/user->id :rasta), :group_id (u/get-id group)}]]
        (perms/grant-collection-read-permissions! group (u/get-id coll-1))
        (perms/grant-collection-read-permissions! group (u/get-id coll-2))
        (search-request :rasta :q "test")))))

;; User should only see results in the collection they have access to
(expect
  (sorted-results
   (into
    (default-results-with-collection)
    (map #(merge default-search-row % (table-search-results))
         [{:name "metric test2 metric", :description "Lookin' for a blueberry", :model "metric"}
          {:name "segment test2 segment", :description "Lookin' for a blueberry", :model "segment"}])))
  (tu/with-non-admin-groups-no-root-collection-perms
    (with-search-items-in-collection {coll-1 :collection} "test"
      (with-search-items-in-collection {coll-2 :collection} "test2"
        (tt/with-temp* [PermissionsGroup           [group]
                        PermissionsGroupMembership [_ {:user_id (test-users/user->id :rasta), :group_id (u/get-id group)}]]
          (perms/grant-collection-read-permissions! group (u/get-id coll-1))
          (search-request :rasta :q "test"))))))

;; Favorites are per user, so other user's favorites don't cause search results to be favorited
(expect
  (default-results-with-collection)
  (with-search-items-in-collection {:keys [card dashboard]} "test"
    (tt/with-temp* [CardFavorite      [_ {:card_id (u/get-id card)
                                          :owner_id (test-users/user->id :rasta)}]
                    DashboardFavorite [_ {:dashboard_id (u/get-id dashboard)
                                          :user_id (test-users/user->id :rasta)}]]
      (search-request :crowberto :q "test"))))

;; Basic search, should find 1 of each entity type and include favorites when available
(expect
  (on-search-types #{"dashboard" "card"}
                   #(assoc % :favorite true)
                   (default-results-with-collection))
  (with-search-items-in-collection {:keys [card dashboard]} "test"
    (tt/with-temp* [CardFavorite      [_ {:card_id  (u/get-id card)
                                          :owner_id (test-users/user->id :crowberto)}]
                    DashboardFavorite [_ {:dashboard_id (u/get-id dashboard)
                                          :user_id      (test-users/user->id :crowberto)}]]
      (search-request :crowberto :q "test"))))

;; Basic search should only return substring matches
(expect
  (default-search-results)
  (with-search-items-in-root-collection "test"
    (with-search-items-in-root-collection "something different"
      (search-request :crowberto :q "test"))))

(defn- archived [m]
  (assoc m :archived true))

;; Should return unarchived results by default
(expect
  (default-search-results)
  (with-search-items-in-root-collection "test"
    (tt/with-temp* [Card       [_ (archived {:name "card test card 2"})]
                    Dashboard  [_ (archived {:name "dashboard test dashboard 2"})]
                    Collection [_ (archived {:name "collection test collection 2"})]
                    Metric     [_ (archived {:name "metric test metric 2"})]
                    Segment    [_ (archived {:name "segment test segment 2"})]]
      (search-request :crowberto :q "test"))))

;; Should return archived results when specified
(expect
  (default-archived-results)
  (with-search-items-in-root-collection "test2"
    (tt/with-temp* [Card       [_ (archived {:name "card test card"})]
                    Dashboard  [_ (archived {:name "dashboard test dashboard"})]
                    Collection [_ (archived {:name "collection test collection"})]
                    Metric     [_ (archived {:name "metric test metric"})]
                    Segment    [_ (archived {:name "segment test segment"})]]
      (search-request :crowberto :q "test", :archived "true"))))

;; Search should not return alerts
(expect
  []
  (with-search-items-in-root-collection "test"
    (tt/with-temp* [Pulse [pulse {:alert_condition  "rows"
                                  :alert_first_only false
                                  :alert_above_goal nil
                                  :name             nil}]]
      (filter (fn [{:keys [model id]}]
                (and (= id (u/get-id pulse))
                     (= "pulse" model)))
              ((test-users/user->client :crowberto) :get 200 "search")))))

;; You should see TABLES in the search results!
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

(expect
  [(default-table-search-row "Round Table")]
  (tt/with-temp Table [table {:name "Round Table"}]
    (search-request :crowberto :q "Round Table")))

(expect
  [(default-table-search-row "Kitchen Table")]
  (tt/with-temp Table [table {:name "Kitchen Table"}]
    (search-request :rasta :q "Kitchen Table")))

;; But *archived* tables should not appear in search results
(let [table-name (tu/random-name)]
  (expect
    []
    (tt/with-temp Table [table {:name table-name}]
      (search-request :crowberto :q table-name :archived true))))

(let [table-name (tu/random-name)]
  (expect
    []
    (tt/with-temp Table [table {:name table-name}]
      (search-request :rasta :q table-name :archived true))))

;; you should not be able to see a Table if the current user doesn't have permissions for that Table
(expect
  []
  (tt/with-temp* [Database [{db-id :id}]
                  Table    [table {:db_id db-id}]]
    (perms/revoke-permissions! (group/all-users) db-id)
    (search-request :rasta :q (:name table))))
