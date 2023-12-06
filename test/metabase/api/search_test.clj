(ns metabase.api.search-test
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.api.search :as api.search]
   [metabase.mbql.normalize :as mbql.normalize]
   [metabase.models
    :refer [Action Card CardBookmark Collection Dashboard DashboardBookmark
            DashboardCard Database Metric PermissionsGroup
            PermissionsGroupMembership Pulse PulseCard QueryAction Segment Table]]
   [metabase.models.collection :as collection]
   [metabase.models.model-index :as model-index]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.revision :as revision]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as scoring]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(defn- ordered-subset?
  "Test if all the elements in `xs` appear in the same order in `ys`. Search results in this test suite can be polluted
  by local data, so this is a way to ignore extraneous results."
  [[x & rest-x :as xs] [y & rest-y :as ys]]
  (or (zero? (count xs))
      (if (> (count xs) (count ys))
        false
        (if (= x y)
          (recur rest-x rest-y)
          (recur xs rest-y)))))

(def ^:private default-collection {:id false :name nil :authority_level nil :type nil})

(def ^:private default-search-row
  {:archived                   false
   :bookmark                   nil
   :collection                 default-collection
   :collection_authority_level nil
   :collection_position        nil
   :context                    nil
   :created_at                 true
   :creator_common_name        nil
   :creator_id                 false
   :dashboardcard_count        nil
   :database_id                false
   :dataset_query              nil
   :description                nil
   :id                         true
   :initial_sync_status        nil
   :model_id                   false
   :model_name                 nil
   :moderated_status           nil
   :last_editor_common_name    nil
   :last_editor_id             false
   :last_edited_at             false
   :pk_ref                     nil
   :model_index_id             false ;; columns ending in _id get booleaned
   :table_description          nil
   :table_id                   false
   :table_name                 nil
   :table_schema               nil
   :updated_at                 true})

(defn- table-search-results
  "Segments and Metrics come back with information about their Tables as of 0.33.0. The `model-defaults` for Segment and
  Metric put them both in the `:checkins` Table."
  []
  (merge
   {:table_id true, :database_id true}
   (t2/select-one [Table [:name :table_name] [:schema :table_schema] [:description :table_description]]
                  :id (mt/id :checkins))))

(defn- sorted-results [results]
  (->> results
       (sort-by (juxt (comp (var-get #'scoring/model->sort-position) :model)))
       reverse))

(defn- make-result
  [name & kvs]
  (apply assoc default-search-row :name name kvs))

(defn- query-action
  [action-id]
  {:action_id     action-id
   :database_id   (u/the-id (mt/db))
   :dataset_query (mt/query venues)})

(def ^:private test-collection (make-result "collection test collection"
                                            :bookmark false
                                            :model "collection"
                                            ;; TODO the default-collection data for this doesn't make sense:
                                            :collection (assoc default-collection :id true :name true)
                                            :updated_at false))

(def ^:private action-model-params {:name "ActionModel", :dataset true})

(defn- default-search-results []
  (sorted-results
   [(make-result "dashboard test dashboard", :model "dashboard", :bookmark false :creator_id true :creator_common_name "Rasta Toucan")
    test-collection
    (make-result "card test card", :model "card", :bookmark false, :dashboardcard_count 0 :creator_id true :creator_common_name "Rasta Toucan" :dataset_query nil)
    (make-result "dataset test dataset", :model "dataset", :bookmark false, :dashboardcard_count 0 :creator_id true :creator_common_name "Rasta Toucan" :dataset_query nil)
    (make-result "action test action", :model "action", :model_name (:name action-model-params), :model_id true,
                 :database_id true :creator_id true :creator_common_name "Rasta Toucan" :dataset_query (update (mt/query venues) :type name))
    (merge
     (make-result "metric test metric", :model "metric", :description "Lookin' for a blueberry" :creator_id true :creator_common_name "Rasta Toucan")
     (table-search-results))
    (merge
     (make-result "segment test segment", :model "segment", :description "Lookin' for a blueberry" :creator_id true :creator_common_name "Rasta Toucan")
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
  (on-search-types #{"dashboard" "pulse" "card" "dataset" "action"}
                   #(assoc % :collection {:id true, :name (if (= (:model %) "action") nil true) :authority_level nil :type nil})
                   (default-search-results)))

(defn- do-with-search-items [search-string in-root-collection? f]
  (let [data-map      (fn [instance-name]
                        {:name (format instance-name search-string)})
        coll-data-map (fn [instance-name collection]
                        (merge (data-map instance-name)
                               (when-not in-root-collection?
                                 {:collection_id (u/the-id collection)})))]
    (mt/with-temp [Collection  coll           (data-map "collection %s collection")
                   Card        action-model   (if in-root-collection?
                                                action-model-params
                                                (assoc action-model-params :collection_id (u/the-id coll)))
                   Action      {action-id :id
                                :as action}   (merge (data-map "action %s action")
                                                     {:type :query, :model_id (u/the-id action-model)})
                   Database    {db-id :id
                                :as db}       (data-map "database %s database")
                   Table       table          (merge (data-map "database %s database")
                                                     {:db_id db-id})

                   QueryAction _qa (query-action action-id)
                   Card        card           (coll-data-map "card %s card" coll)
                   Card        dataset        (assoc (coll-data-map "dataset %s dataset" coll)
                                                     :dataset true)
                   Dashboard   dashboard      (coll-data-map "dashboard %s dashboard" coll)
                   Metric      metric         (assoc (data-map "metric %s metric")
                                                     :table_id (mt/id :checkins))
                   Segment     segment        (data-map "segment %s segment")]
      (f {:action     action
          :collection coll
          :card       card
          :database   db
          :dataset    dataset
          :dashboard  dashboard
          :metric     metric
          :table      table
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

(def ^:private remove-databases
  "Remove DBs from the results, which is useful since test databases unrelated to this suite can pollute the results"
  (partial remove #(= (:model %) "database")))

(defn- process-raw-data [raw-data keep-database-id]
  (for [result raw-data
        ;; filter out any results not from the usual test data DB (e.g. results from other drivers)
        :when  (contains? #{keep-database-id nil} (:database_id result))]
    (-> result
        mt/boolean-ids-and-timestamps
        (update-in [:collection :name] #(some-> % string?))
        ;; `:scores` is just used for debugging and would be a pain to match against.
        (dissoc :scores))))

(defn- make-search-request [user-kwd params]
  (apply mt/user-http-request user-kwd :get 200 "search" params))

(defn- search-request-data-with [xf user-kwd & params]
  (let [raw-results-data (:data (make-search-request user-kwd params))
        keep-database-id (if (fn? *search-request-results-database-id*)
                           (*search-request-results-database-id*)
                           *search-request-results-database-id*)]
    (if (:error raw-results-data)
      raw-results-data
      (vec (xf (process-raw-data raw-results-data keep-database-id))))))

(defn- search-request-with [xf user-kwd & params]
  (let [raw-results      (make-search-request user-kwd params)
        keep-database-id (if (fn? *search-request-results-database-id*)
                           (*search-request-results-database-id*)
                           *search-request-results-database-id*)]
    (if (:error (:data raw-results))
      raw-results
      (update raw-results :data
              (fn [raw-data]
                (vec (xf (process-raw-data raw-data keep-database-id))))))))

(defn- search-request
  [& args]
  (apply search-request-with (comp sorted-results remove-databases) args))

(defn- search-request-data
  "Gets just the data elements of the search"
  [& args]
  (apply search-request-data-with (comp sorted-results remove-databases) args))

(defn- unsorted-search-request-data
  [& args]
  (apply search-request-data-with identity args))

(deftest order-clause-test
  (testing "it includes all columns and normalizes the query"
    (is (= [[:case
             [:like [:lower :model]             "%foo%"] [:inline 0]
             [:like [:lower :name]              "%foo%"] [:inline 0]
             [:like [:lower :display_name]      "%foo%"] [:inline 0]
             [:like [:lower :description]       "%foo%"] [:inline 0]
             [:like [:lower :collection_name]   "%foo%"] [:inline 0]
             [:like [:lower :collection_type]   "%foo%"] [:inline 0]
             [:like [:lower :table_schema]      "%foo%"] [:inline 0]
             [:like [:lower :table_name]        "%foo%"] [:inline 0]
             [:like [:lower :table_description] "%foo%"] [:inline 0]
             [:like [:lower :model_name]        "%foo%"] [:inline 0]
             [:like [:lower :dataset_query]     "%foo%"] [:inline 0]
             :else [:inline 1]]]
           (api.search/order-clause "Foo")))))

(deftest basic-test
  (testing "Basic search, should find 1 of each entity type, all items in the root collection"
    (with-search-items-in-root-collection "test"
      (is (= (default-search-results)
             (search-request-data :crowberto :q "test")))))
  (testing "Basic search should only return substring matches"
    (with-search-items-in-root-collection "test"
      (with-search-items-in-root-collection "something different"
        (is (= (default-search-results)
               (search-request-data :crowberto :q "test"))))))
  (testing "It prioritizes exact matches"
    (with-search-items-in-root-collection "test"
      (with-redefs [search.config/*db-max-results* 1]
        (is (= [test-collection]
               (search-request-data :crowberto :q "test collection"))))))
  (testing "It limits matches properly"
    (with-search-items-in-root-collection "test"
      (is (>= 2 (count (search-request-data :crowberto :q "test" :limit "2" :offset "0"))))))
  (testing "It offsets matches properly"
    (with-search-items-in-root-collection "test"
      (is (<= 4 (count (search-request-data :crowberto :q "test" :limit "100" :offset "2"))))))
  (testing "It offsets without limit properly"
    (with-search-items-in-root-collection "test"
      (is (<= 5 (count (search-request-data :crowberto :q "test" :offset "2"))))))
  (testing "It limits without offset properly"
    (with-search-items-in-root-collection "test"
      (is (>= 2 (count (search-request-data :crowberto :q "test" :limit "2"))))))
  (testing "It subsets matches for model"
    (with-search-items-in-root-collection "test"
      (is (= 0 (count (search-request-data :crowberto :q "test" :models "database"))))
      (is (= 1 (count (search-request-data :crowberto :q "test" :models "database" :models "card"))))))
  (testing "It distinguishes datasets from cards"
    (with-search-items-in-root-collection "test"
      (let [results (search-request-data :crowberto :q "test" :models "dataset")]
        (is (= 1 (count results)))
        (is (= "dataset" (-> results first :model))))
      (let [results (search-request-data :crowberto :q "test" :models "card")]
        (is (= 1 (count results)))
        (is (= "card" (-> results first :model))))))
  (testing "It returns limit and offset params in return result"
    (with-search-items-in-root-collection "test"
      (is (= 2 (:limit (search-request :crowberto :q "test" :limit "2" :offset "3"))))
      (is (= 3 (:offset (search-request :crowberto :q "test" :limit "2" :offset "3")))))))

(deftest archived-models-test
  (testing "It returns some stuff when you get results"
    (with-search-items-in-root-collection "test"
      ;; sometimes there is a "table" in these responses. might be do to garbage in CI
      (is (set/subset? #{"dashboard" "dataset" "segment" "collection" "database" "metric" "card"}
                       (-> (mt/user-http-request :crowberto :get 200 "search?q=test")
                           :available_models
                           set)))))
  (testing "It returns nothing if there are no results"
    (with-search-items-in-root-collection "test"
      (is (= [] (:available_models (mt/user-http-request :crowberto :get 200 "search?q=noresults")))))))

(deftest query-model-set-test
  (let [search-term "query-model-set"]
    (with-search-items-in-root-collection search-term
      (testing "should returns a list of models that search result will return"
        (is (= #{"dashboard" "table" "dataset" "segment" "collection" "database" "action" "metric" "card"}
               (set (mt/user-http-request :crowberto :get 200 "search/models" :q search-term)))))
      (testing "return a subset of model for created-by filter"
        (is (= #{"dashboard" "dataset" "card" "action"}
               (set (mt/user-http-request :crowberto :get 200 "search/models"
                                          :q search-term
                                          :created_by (mt/user->id :rasta))))))
      (testing "return a subset of model for verified filter"
        (t2.with-temp/with-temp
          [:model/Card       {v-card-id :id}  {:name (format "%s Verified Card" search-term)}
           :model/Card       {v-model-id :id} {:name (format "%s Verified Model" search-term) :dataset true}
           :model/Collection {_v-coll-id :id} {:name (format "%s Verified Collection" search-term) :authority_level "official"}]
          (testing "when has both :content-verification features"
            (premium-features-test/with-premium-features #{:content-verification}
              (mt/with-verified-cards [v-card-id v-model-id]
                (is (= #{"card" "dataset"}
                       (set (mt/user-http-request :crowberto :get 200 "search/models"
                                                  :q search-term
                                                  :verified true)))))))
          (testing "when has :content-verification feature only"
            (premium-features-test/with-premium-features #{:content-verification}
              (mt/with-verified-cards [v-card-id]
                (is (= #{"card"}
                       (set (mt/user-http-request :crowberto :get 200 "search/models"
                                                  :q search-term
                                                  :verified true)))))))))
      (testing "return a subset of model for created_at filter"
        (is (= #{"dashboard" "table" "dataset" "collection" "database" "action" "card"}
               (set (mt/user-http-request :crowberto :get 200 "search/models"
                                          :q search-term
                                          :created_at "today")))))

      (testing "return a subset of model for search_native_query filter"
        (is (= #{"dataset" "action" "card"}
               (set (mt/user-http-request :crowberto :get 200 "search/models"
                                          :q search-term
                                          :search_native_query true))))))))

(def ^:private dashboard-count-results
  (letfn [(make-card [dashboard-count]
            (make-result (str "dashboard-count " dashboard-count) :dashboardcard_count dashboard-count,
                         :model "card", :bookmark false :creator_id true :creator_common_name "Rasta Toucan" :dataset_query nil))]
    (set [(make-card 5)
          (make-card 3)
          (make-card 0)])))

(deftest dashboard-count-test
  (testing "It sorts by dashboard count"
    (mt/with-temp [Card          {card-id-3 :id} {:name "dashboard-count 3"}
                   Card          {card-id-5 :id} {:name "dashboard-count 5"}
                   Card          _               {:name "dashboard-count 0"}
                   Dashboard     {dash-id :id}   {}
                   DashboardCard _               {:card_id card-id-3 :dashboard_id dash-id}
                   DashboardCard _               {:card_id card-id-3 :dashboard_id dash-id}
                   DashboardCard _               {:card_id card-id-3 :dashboard_id dash-id}
                   DashboardCard _               {:card_id card-id-5 :dashboard_id dash-id}
                   DashboardCard _               {:card_id card-id-5 :dashboard_id dash-id}
                   DashboardCard _               {:card_id card-id-5 :dashboard_id dash-id}
                   DashboardCard _               {:card_id card-id-5 :dashboard_id dash-id}
                   DashboardCard _               {:card_id card-id-5 :dashboard_id dash-id}]
      (is (= dashboard-count-results
             (set (unsorted-search-request-data :rasta :q "dashboard-count")))))))

(deftest moderated-status-test
  (let [search-term "moderated-status-test"]
    (mt/with-temp [:model/Card {card-id :id} {:name "moderated-status-test"}]
      ;; an item could have multiple moderation-review, and it's current status is defined as
      ;; moderation-review.most_recent, so we creates multiple moderation review here to make sure
      ;; test result return the most recent status and don't duplicate the result
      (doseq [status ["verified" nil "verified"]]
        (moderation-review/create-review! {:moderated_item_id   card-id
                                           :moderated_item_type "card"
                                           :moderator_id        (mt/user->id :crowberto)
                                           :status              status}))
      (is (=? [{:id               card-id
                :model            "card"
                :moderated_status "verified"}]
              (:data (mt/user-http-request :crowberto :get 200 "search" :q search-term)))))))

(deftest permissions-test
  (testing (str "Ensure that users without perms for the root collection don't get results NOTE: Metrics and segments "
                "don't have collections, so they'll be returned")
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-root-collection "test"
        (is (= (default-metric-segment-results)
               (search-request-data :rasta :q "test"))))))

  (testing "Users that have root collection permissions should get root collection search results"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-root-collection "test"
        (mt/with-temp [PermissionsGroup           group {}
                       PermissionsGroupMembership _ {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
          (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
          (is (ordered-subset? (remove (comp #{"collection"} :model) (default-search-results))
                               (search-request-data :rasta :q "test")))))))

  (testing "Users without root collection permissions should still see other collections they have access to"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {:keys [collection]} "test"
        (with-search-items-in-root-collection "test2"
          (mt/with-temp [PermissionsGroup           group {}
                         PermissionsGroupMembership _ {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
            (perms/grant-collection-read-permissions! group (u/the-id collection))
            (is (= (sorted-results
                    (reverse ;; This reverse is hokey; it's because the test2 results happen to come first in the API response
                     (into
                      (default-results-with-collection)
                      (map #(merge default-search-row % (table-search-results))
                           [{:name "metric test2 metric", :description "Lookin' for a blueberry",
                             :model "metric" :creator_id true :creator_common_name "Rasta Toucan"}
                            {:name "segment test2 segment", :description "Lookin' for a blueberry",
                             :model "segment" :creator_id true :creator_common_name "Rasta Toucan"}]))))
                   (search-request-data :rasta :q "test"))))))))

  (testing (str "Users with root collection permissions should be able to search root collection data long with "
                "collections they have access to")
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {:keys [collection]} "test"
        (with-search-items-in-root-collection "test2"
          (mt/with-temp [PermissionsGroup           group {}
                         PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id (u/the-id group)}]
            (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
            (perms/grant-collection-read-permissions! group collection)
            (is (ordered-subset? (sorted-results
                                  (reverse
                                   (into
                                    (default-results-with-collection)
                                    (for [row  (default-search-results)
                                          :when (not= "collection" (:model row))]
                                      (update row :name #(str/replace % "test" "test2"))))))
                                 (search-request-data :rasta :q "test"))))))))

  (testing "Users with access to multiple collections should see results from all collections they have access to"
    (with-search-items-in-collection {coll-1 :collection} "test"
      (with-search-items-in-collection {coll-2 :collection} "test2"
        (mt/with-temp [PermissionsGroup           group {}
                       PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id (u/the-id group)}]
          (perms/grant-collection-read-permissions! group (u/the-id coll-1))
          (perms/grant-collection-read-permissions! group (u/the-id coll-2))
          (is (ordered-subset? (sorted-results
                                (reverse
                                 (into
                                  (default-results-with-collection)
                                  (map (fn [row] (update row :name #(str/replace % "test" "test2")))
                                       (default-results-with-collection)))))
                               (search-request-data :rasta :q "test")))))))

  (testing "User should only see results in the collection they have access to"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {coll-1 :collection} "test"
        (with-search-items-in-collection _ "test2"
          (mt/with-temp [PermissionsGroup           group {}
                         PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id (u/the-id group)}]
            (perms/grant-collection-read-permissions! group (u/the-id coll-1))
            (is (= (sorted-results
                    (reverse
                     (into
                      (default-results-with-collection)
                      (map #(merge default-search-row % (table-search-results))
                           [{:name "metric test2 metric" :description "Lookin' for a blueberry"
                             :model "metric" :creator_id true :creator_common_name "Rasta Toucan"}
                            {:name "segment test2 segment" :description "Lookin' for a blueberry" :model "segment"
                             :creator_id true :creator_common_name "Rasta Toucan"}]))))
                   (search-request-data :rasta :q "test"))))))))

  (testing "Metrics on tables for which the user does not have access to should not show up in results"
    (mt/with-temp [Database {db-id :id} {}
                   Table    {table-id :id} {:db_id  db-id
                                            :schema nil}
                   Metric   _ {:table_id table-id
                               :name     "test metric"}]
      (perms/revoke-data-perms! (perms-group/all-users) db-id)
      (is (= []
             (search-request-data :rasta :q "test")))))

  (testing "Segments on tables for which the user does not have access to should not show up in results"
    (mt/with-temp [Database {db-id :id} {}
                   Table    {table-id :id} {:db_id  db-id
                                            :schema nil}
                   Segment  _ {:table_id table-id
                               :name     "test segment"}]
      (perms/revoke-data-perms! (perms-group/all-users) db-id)
      (is (= []
             (search-request-data :rasta :q "test")))))

  (testing "Databases for which the user does not have access to should not show up in results"
    (mt/with-temp [Database db-1  {:name "db-1"}
                   Database _db-2 {:name "db-2"}]
      (is (set/subset? #{"db-2" "db-1"}
                       (->> (search-request-data-with sorted-results :rasta :q "db")
                            (map :name)
                            set)))
      (perms/revoke-data-perms! (perms-group/all-users) (:id db-1))
      (is (nil? ((->> (search-request-data-with sorted-results :rasta :q "db")
                      (map :name)
                      set)
                 "db-1"))))))

(deftest bookmarks-test
  (testing "Bookmarks are per user, so other user's bookmarks don't cause search results to be altered"
    (with-search-items-in-collection {:keys [card dashboard]} "test"
      (mt/with-temp [CardBookmark      _ {:card_id (u/the-id card)
                                          :user_id (mt/user->id :rasta)}
                     DashboardBookmark _ {:dashboard_id (u/the-id dashboard)
                                          :user_id      (mt/user->id :rasta)}]
        (is (= (default-results-with-collection)
               (search-request-data :crowberto :q "test"))))))

  (testing "Basic search, should find 1 of each entity type and include bookmarks when available"
    (with-search-items-in-collection {:keys [card dashboard]} "test"
      (mt/with-temp [CardBookmark      _ {:card_id (u/the-id card)
                                          :user_id (mt/user->id :crowberto)}
                     DashboardBookmark _ {:dashboard_id (u/the-id dashboard)
                                          :user_id      (mt/user->id :crowberto)}]
        (is (= (on-search-types #{"dashboard" "card"}
                                #(assoc % :bookmark true)
                                (default-results-with-collection))
               (search-request-data :crowberto :q "test")))))))

(defn- archived [m]
  (assoc m :archived true))

(deftest database-test
  (testing "Should search database names and descriptions"
    (mt/with-temp [Database       _ {:name "aviaries"}
                   Database       _ {:name "user_favorite_places" :description "Join table between users and their favorite places, which could include aviaries"}
                   Database       _ {:name "users" :description "As it sounds"}]
      (letfn [(result [db]
                (merge {:name nil
                        :model "database"
                        :description nil}
                       db))]
        (is (= (sorted-results
                (map result [{:name "aviaries"}
                             {:name "user_favorite_places"
                              :description "Join table between users and their favorite places, which could include aviaries"}]))
               (map #(select-keys % [:name :model :description])
                    (search-request-data-with sorted-results :crowberto :q "aviaries"))))))))

(deftest indexed-entity-test
  (testing "Should search indexed entities"
    (mt/dataset airports
      (let [query (mt/mbql-query municipality)]
        (mt/with-temp [Card model {:dataset       true
                                   :dataset_query query}]
          (let [model-index (model-index/create
                             (mt/$ids {:model-id   (:id model)
                                       :pk-ref     $municipality.id
                                       :value-ref  $municipality.name
                                       :creator-id (mt/user->id :rasta)}))
                relevant    (comp (filter (comp #{(:id model)} :model_id))
                                  (filter (comp #{"indexed-entity"} :model)))
                search!     (fn [search-term]
                              (:data (make-search-request :crowberto [:q search-term])))]
            (model-index/add-values! model-index)

            (is (= #{"Dallas-Fort Worth" "Fort Lauderdale" "Fort Myers"
                     "Fort Worth" "Fort Smith" "Fort Wayne"}
                   (into #{} (comp relevant (map :name)) (search! "fort"))))

            (testing "Sandboxed users do not see indexed entities in search"
              (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly true)]
                (is (= #{}
                       (into #{} (comp relevant (map :name)) (search! "fort"))))))

            (let [normalize (fn [x] (-> x (update :pk_ref mbql.normalize/normalize)))]
              (is (=? {"Rome"   {:pk_ref         (mt/$ids $municipality.id)
                                 :name           "Rome"
                                 :model_id       (:id model)
                                 :model_name     (:name model)
                                 :model_index_id (mt/malli=? :int)}
                       "Tromsø" {:pk_ref         (mt/$ids $municipality.id)
                                 :name           "Tromsø"
                                 :model_id       (:id model)
                                 :model_name     (:name model)
                                 :model_index_id (mt/malli=? :int)}}
                      (into {} (comp relevant (map (juxt :name normalize)))
                            (search! "rom")))))))))))

(deftest archived-results-test
  (testing "Should return unarchived results by default"
    (with-search-items-in-root-collection "test"
      (mt/with-temp [Card        action-model {:dataset true}
                     Action      {action-id :id} (archived {:name     "action test action 2"
                                                            :type     :query
                                                            :model_id (u/the-id action-model)})
                     QueryAction _ (query-action action-id)
                     Card        _ (archived {:name "card test card 2"})
                     Card        _ (archived {:name "dataset test dataset" :dataset true})
                     Dashboard   _ (archived {:name "dashboard test dashboard 2"})
                     Collection  _ (archived {:name "collection test collection 2"})
                     Metric      _ (archived {:name     "metric test metric 2"
                                              :table_id (mt/id :checkins)})
                     Segment     _ (archived {:name "segment test segment 2"})]
        (is (= (default-search-results)
               (search-request-data :crowberto :q "test"))))))

  (testing "Should return archived results when specified"
    (with-search-items-in-root-collection "test2"
      (mt/with-temp [Card        action-model action-model-params
                     Action      {action-id :id} (archived {:name     "action test action"
                                                            :type     :query
                                                            :model_id (u/the-id action-model)})
                     QueryAction _ (query-action action-id)
                     Action      _ (archived {:name     "action that will not appear in results"
                                              :type     :query
                                              :model_id (u/the-id action-model)})
                     Card        _ (archived {:name "card test card"})
                     Card        _ (archived {:name "card that will not appear in results"})
                     Card        _ (archived {:name "dataset test dataset" :dataset true})
                     Dashboard   _ (archived {:name "dashboard test dashboard"})
                     Collection  _ (archived {:name "collection test collection"})
                     Metric      _ (archived {:name     "metric test metric"
                                              :table_id (mt/id :checkins)})
                     Segment     _ (archived {:name "segment test segment"})]
        (is (= (default-archived-results)
               (search-request-data :crowberto :q "test", :archived "true"))))))

  (testing "Should return archived results when specified without a search query"
    (with-search-items-in-root-collection "test2"
      (mt/with-temp [Card        action-model action-model-params
                     Action      {action-id :id} (archived {:name     "action test action"
                                                            :type     :query
                                                            :model_id (u/the-id action-model)})
                     QueryAction _ (query-action action-id)
                     Card        _ (archived {:name "card test card"})
                     Card        _ (archived {:name "dataset test dataset" :dataset true})
                     Dashboard   _ (archived {:name "dashboard test dashboard"})
                     Collection  _ (archived {:name "collection test collection"})
                     Metric      _ (archived {:name     "metric test metric"
                                              :table_id (mt/id :checkins)})
                     Segment     _ (archived {:name "segment test segment"})]
        (is (ordered-subset? (default-archived-results)
                             (search-request-data :crowberto :archived "true")))))))

(deftest alerts-test
  (testing "Search should not return alerts"
    (with-search-items-in-root-collection "test"
      (mt/with-temp [Pulse pulse {:alert_condition  "rows"
                                  :alert_first_only false
                                  :alert_above_goal nil
                                  :name             nil}]
        (is (= []
               (filter (fn [{:keys [model id]}]
                         (and (= id (u/the-id pulse))
                              (= "pulse" model)))
                       (:data (mt/user-http-request :crowberto :get 200 "search")))))))))

(defn- default-table-search-row [table-name]
  (merge
   default-search-row
   {:name                table-name
    :table_name          table-name
    :table_id            true
    :archived            nil
    :model               "table"
    :database_id         true
    :pk_ref              nil
    :initial_sync_status "complete"}))

(defmacro ^:private do-test-users {:style/indent 1} [[user-binding users] & body]
  `(doseq [user# ~users
           :let [~user-binding user#]]
     (testing (format "\nuser = %s" user#)
       ~@body)))

(deftest table-test
  (testing "You should see Tables in the search results!\n"
    (mt/with-temp [Table _ {:name "RoundTable"}]
      (do-test-users [user [:crowberto :rasta]]
        (is (= [(default-table-search-row "RoundTable")]
               (search-request-data user :q "RoundTable"))))))
  (testing "You should not see hidden tables"
    (mt/with-temp [Table _normal {:name "Foo Visible"}
                   Table _hidden {:name "Foo Hidden", :visibility_type "hidden"}]
      (do-test-users [user [:crowberto :rasta]]
        (is (= [(default-table-search-row "Foo Visible")]
               (search-request-data user :q "Foo"))))))
  (testing "You should be able to search by their display name"
    (let [lancelot "Lancelot's Favorite Furniture"]
      (mt/with-temp [Table _ {:name "RoundTable" :display_name lancelot}]
        (do-test-users [user [:crowberto :rasta]]
          (is (= [(assoc (default-table-search-row "RoundTable") :name lancelot)]
                 (search-request-data user :q "Lancelot")))))))
  (testing "You should be able to search by their description"
    (let [lancelot "Lancelot's Favorite Furniture"]
      (mt/with-temp [Table _ {:name "RoundTable" :description lancelot}]
        (do-test-users [user [:crowberto :rasta]]
          (is (= [(assoc (default-table-search-row "RoundTable") :description lancelot :table_description lancelot)]
                 (search-request-data user :q "Lancelot")))))))
  (testing "When searching with ?archived=true, normal Tables should not show up in the results"
    (let [table-name (mt/random-name)]
      (mt/with-temp [Table _ {:name table-name}]
        (do-test-users [user [:crowberto :rasta]]
          (is (= []
                 (search-request-data user :q table-name :archived true)))))))
  (testing "*archived* tables should not appear in search results"
    (let [table-name (mt/random-name)]
      (mt/with-temp [Table _ {:name table-name, :active false}]
        (do-test-users [user [:crowberto :rasta]]
          (is (= []
                 (search-request-data user :q table-name)))))))
  (testing "you should not be able to see a Table if the current user doesn't have permissions for that Table"
    (mt/with-temp [Database {db-id :id} {}
                   Table    table {:db_id db-id}]
      (perms/revoke-data-perms! (perms-group/all-users) db-id)
      (is (= []
             (binding [*search-request-results-database-id* db-id]
               (search-request-data :rasta :q (:name table))))))))

(deftest all-users-no-perms-table-test
  (testing (str "If the All Users group doesn't have perms to view a Table, but the current User is in a group that "
                "does have perms, they should still be able to see it (#12332)")
    (mt/with-temp [Database                   {db-id :id} {}
                   Table                      table {:name "RoundTable" :db_id db-id}
                   PermissionsGroup           {group-id :id} {}
                   PermissionsGroupMembership _ {:group_id group-id :user_id (mt/user->id :rasta)}]
      (perms/revoke-data-perms! (perms-group/all-users) db-id (:schema table) (:id table))
      (perms/grant-permissions! group-id (perms/table-read-path table))
      (do-test-users [user [:crowberto :rasta]]
        (is (= [(default-table-search-row "RoundTable")]
               (binding [*search-request-results-database-id* db-id]
                 (search-request-data user :q "RoundTable"))))))))

(deftest all-users-no-data-perms-table-test
  (testing "If the All Users group doesn't have perms to view a Table they sholdn't see it (#16855)"
    (mt/with-temp [Database                   {db-id :id} {}
                   Table                      table {:name "RoundTable", :db_id db-id}]
      (perms/revoke-data-perms! (perms-group/all-users) db-id (:schema table) (:id table))
      (is (= []
             (filter #(= (:name %) "RoundTable")
                     (binding [*search-request-results-database-id* db-id]
                       (search-request-data :rasta :q "RoundTable"))))))))

(deftest collection-namespaces-test
  (testing "Search should only return Collections in the 'default' namespace"
    (mt/with-temp [Collection _c1 {:name "Normal Collection"}
                   Collection _c2 {:name "Coin Collection" :namespace "currency"}]
      (assert (not (t2/exists? Collection :name "Coin Collection", :namespace nil)))
      (is (=? [{:name "Normal Collection"}]
              (->> (search-request-data :crowberto :q "Collection")
                   (filter #(and (= (:model %) "collection")
                                 (#{"Normal Collection" "Coin Collection"} (:name %))))))))))

(deftest no-dashboard-subscription-pulses-test
  (testing "Pulses used for Dashboard subscriptions should not be returned by search results (#14190)"
    (letfn [(search-for-pulses [{pulse-id :id}]
              (->> (:data (mt/user-http-request :crowberto :get "search?q=electro"))
                   (filter #(and (= (:model %) "pulse")
                                 (= (:id %) pulse-id)))
                   first))]
      (t2.with-temp/with-temp [Pulse pulse {:name "Electro-Magnetic Pulse"}]
        (testing "Pulses are not searchable"
          (is (= nil (search-for-pulses pulse))))
        (mt/with-temp [Card      card-1 {}
                       PulseCard _ {:pulse_id (:id pulse), :card_id (:id card-1)}
                       Card      card-2 {}
                       PulseCard _ {:pulse_id (:id pulse), :card_id (:id card-2)}]
          (testing "Create some Pulse Cards: we should not find them."
            (is (= nil (search-for-pulses pulse))))
          (testing "Even as a dashboard subscription, the pulse is not found."
            (mt/with-temp [Dashboard dashboard {}]
              (t2/update! Pulse (:id pulse) {:dashboard_id (:id dashboard)})
              (is (= nil (search-for-pulses pulse))))))))))

(deftest search-db-call-count-test
  (let [search-string (mt/random-name)]
    (t2.with-temp/with-temp
      [Card      _              {:name (str "card db 1 " search-string)}
       Card      _              {:name (str "card db 2 " search-string)}
       Card      _              {:name (str "card db 3 " search-string)}
       Dashboard _              {:name (str "dash 1 " search-string)}
       Dashboard _              {:name (str "dash 2 " search-string)}
       Dashboard _              {:name (str "dash 3 " search-string)}
       Database  {db-id :id}    {:name (str "database 1 " search-string)}
       Database  _              {:name (str "database 2 " search-string)}
       Database  _              {:name (str "database 3 " search-string)}
       Table     {table-id :id} {:db_id  db-id
                                 :schema nil}
       Metric    _              {:table_id table-id
                                 :name     (str "metric 1 " search-string)}
       Metric    _              {:table_id table-id
                                 :name     (str "metric 1 " search-string)}
       Metric    _              {:table_id table-id
                                 :name     (str "metric 2 " search-string)}
       Segment   _              {:table_id table-id
                                 :name     (str "segment 1 " search-string)}
       Segment   _              {:table_id table-id
                                 :name     (str "segment 2 " search-string)}
       Segment   _              {:table_id table-id
                                 :name     (str "segment 3 " search-string)}]
      (mt/with-current-user (mt/user->id :crowberto)
        (let [do-search (fn []
                          (#'api.search/search {:search-string      search-string
                                                :archived?          false
                                                :models             search.config/all-models
                                                :current-user-perms #{"/"}
                                                :limit-int          100}))]
          ;; warm it up, in case the DB call depends on the order of test execution and it needs to
          ;; do some initialization
          (do-search)
          (t2/with-call-count [call-count]
            (do-search)
            ;; the call count number here are expected to change if we change the search api
            ;; we have this test here just to keep tracks this number to remind us to put effort
            ;; into keep this number as low as we can
            (is (= 9 (call-count)))))))))

(deftest snowplow-new-search-query-event-test
  (testing "Send a snowplow event when a search query is triggered and context is passed"
    (snowplow-test/with-fake-snowplow-collector
      (mt/user-http-request :crowberto :get 200 "search?q=test" :context "search-bar")
      (is (=? {:data    {"event"                "new_search_query"
                         "runtime_milliseconds" pos?
                         "context"              "search-bar"}
               :user-id (str (mt/user->id :crowberto))}
              (last (snowplow-test/pop-event-data-and-user-id!)))))
    (snowplow-test/with-fake-snowplow-collector
      (mt/user-http-request :crowberto :get 200 "search?q=test" :context "search-app")
      (is (=? {:data    {"event"                "new_search_query"
                         "runtime_milliseconds" pos?
                         "context"              "search-app"}
               :user-id (str (mt/user->id :crowberto))}
              (last (snowplow-test/pop-event-data-and-user-id!))))))

  (testing "Don't send a snowplow event if the search doesn't contain context"
    (snowplow-test/with-fake-snowplow-collector
      (mt/user-http-request :crowberto :get 200 "search" :q "test" :models "table")
      (is (empty? (snowplow-test/pop-event-data-and-user-id!)))

      (mt/user-http-request :crowberto :get 200 "search" :q "test" :table_db_id (mt/id))
      (is (empty? (snowplow-test/pop-event-data-and-user-id!)))

      (mt/user-http-request :crowberto :get 200 "search" :q "test" :archived true)
      (is (empty? (snowplow-test/pop-event-data-and-user-id!))))))

(deftest snowplow-search-results-filtered-event-test
  (testing "Send a snowplow event when a new filtered search query is made"
    (snowplow-test/with-fake-snowplow-collector
      (mt/user-http-request :crowberto :get 200 "search" :q "test" :context "search-app" :models "card")
      (is (=? {:data    {"event"                 "search_results_filtered"
                         "runtime_milliseconds"  pos?
                         "creation_date"         false
                         "creator"               false
                         "last_edit_date"        false
                         "last_editor"           false
                         "content_type"          ["card"]
                         "search_native_queries" false
                         "verified_items"        false}
               :user-id (str (mt/user->id :crowberto))}
              (last (snowplow-test/pop-event-data-and-user-id!)))))

    (snowplow-test/with-fake-snowplow-collector
      (mt/user-http-request :crowberto :get 200 "search"
                            :q "test"
                            :context "search-app"
                            :models "card"
                            :models "dashboard"
                            :created_at "2000-01-01"
                            :created_by (mt/user->id :crowberto)
                            :last_edited_at "2000-01-01" :last_edited_by (mt/user->id :crowberto)
                            :search_native_query true)
      (is (=? {:data    {"event"                 "search_results_filtered"
                         "runtime_milliseconds"  pos?
                         "creation_date"         true
                         "creator"               true
                         "last_edit_date"        true
                         "last_editor"           true
                         "content_type"          ["card" "dashboard"]
                         "search_native_queries" true
                         "verified_items"        false}
               :user-id (str (mt/user->id :crowberto))}
              (last (snowplow-test/pop-event-data-and-user-id!))))))

  (snowplow-test/with-fake-snowplow-collector
    (testing "Send a snowplow event even if the search doesn't have any advanced filters"
      (mt/user-http-request :crowberto :get 200 "search" :q "test" :context "search-app")
      (is (=? {:data    {"event"                "new_search_query"
                         "runtime_milliseconds" pos?
                         "context"              "search-app"}
               :user-id (str (mt/user->id :crowberto))}
              (last (snowplow-test/pop-event-data-and-user-id!)))))

    (testing "Don't send a snowplow event if the doesn't have context"
      (mt/user-http-request :crowberto :get 200 "search" :q "test" :created_at "2000-01-01")
      (is (empty? (snowplow-test/pop-event-data-and-user-id!))))))

;; ------------------------------------------------ Filter Tests ------------------------------------------------ ;;

(deftest filter-by-creator-test
  (let [search-term "Created by Filter"]
    (with-search-items-in-root-collection search-term
      (mt/with-temp
        [:model/User      {user-id :id}      {:first_name "Explorer" :last_name "Curious"}
         :model/User      {user-id-2 :id}    {:first_name "Explorer" :last_name "Hubble"}
         :model/Card      {card-id :id}      {:name (format "%s Card 1" search-term) :creator_id user-id}
         :model/Card      {card-id-2 :id}    {:name (format "%s Card 2" search-term) :creator_id user-id
                                              :collection_id (:id (collection/user->personal-collection user-id))}
         :model/Card      {card-id-3 :id}    {:name (format "%s Card 3" search-term) :creator_id user-id :archived true}
         :model/Card      {card-id-4 :id}    {:name (format "%s Card 4" search-term) :creator_id user-id-2}
         :model/Card      {model-id :id}     {:name (format "%s Dataset 1" search-term) :dataset true :creator_id user-id}
         :model/Dashboard {dashboard-id :id} {:name (format "%s Dashboard 1" search-term) :creator_id user-id}
         :model/Action    {action-id :id}    {:name (format "%s Action 1" search-term) :model_id model-id :creator_id user-id :type :http}]

        (testing "sanity check that without search by created_by we have more results than if a filter is provided"
          (is (> (:total (mt/user-http-request :crowberto :get 200 "search" :q search-term))
                 5)))

        (testing "Able to filter by creator"
          (let [resp (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_by user-id)]

            (testing "only a subset of models are applicable"
              (is (= #{"card" "dataset" "dashboard" "action"} (set (:available_models resp)))))

            (testing "results contains only entities with the specified creator"
              (is (= #{[dashboard-id "dashboard" "Created by Filter Dashboard 1"]
                       [card-id      "card"      "Created by Filter Card 1"]
                       [card-id-2    "card"      "Created by Filter Card 2"]
                       [model-id     "dataset"   "Created by Filter Dataset 1"]
                       [action-id    "action"    "Created by Filter Action 1"]}
                     (->> (:data resp)
                          (map (juxt :id :model :name))
                          set))))))

        (testing "Able to filter by multiple creators"
          (let [resp (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_by user-id :created_by user-id-2)]

            (testing "only a subset of models are applicable"
              (is (= #{"card" "dataset" "dashboard" "action"} (set (:available_models resp)))))

            (testing "results contains only entities with the specified creator"
              (is (= #{[dashboard-id "dashboard" "Created by Filter Dashboard 1"]
                       [card-id      "card"      "Created by Filter Card 1"]
                       [card-id-2    "card"      "Created by Filter Card 2"]
                       [card-id-4    "card"      "Created by Filter Card 4"]
                       [model-id     "dataset"   "Created by Filter Dataset 1"]
                       [action-id    "action"    "Created by Filter Action 1"]}
                     (->> (:data resp)
                          (map (juxt :id :model :name))
                          set))))))

        (testing "Works with archived filter"
          (is (=? [{:model "card"
                    :id     card-id-3
                    :archived true}]
                  (:data (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_by user-id :archived true)))))

        (testing "Works with models filter"
          (testing "return intersections of supported models with provided models"
            (is (= #{"dashboard" "card"}
                   (->> (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_by user-id :models "card" :models "dashboard")
                        :data
                        (map :model)
                        set))))

          (testing "return nothing if there is no intersection"
            (is (= #{}
                   (->> (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_by user-id :models "table" :models "database")
                        :data
                        (map :model)
                        set)))))

        (testing "respect the read permissions"
          (let [resp (mt/user-http-request :rasta :get 200 "search" :q search-term :created_by user-id)]
            (is (not (contains?
                      (->> (:data resp)
                           (filter #(= (:model %) "card"))
                           (map :id)
                           set)
                      card-id-2)))))

        (testing "error if creator_id is not an integer"
          (let [resp (mt/user-http-request :crowberto :get 400 "search" :q search-term :created_by "not-a-valid-user-id")]
            (is (= {:created_by "nullable value must be an integer greater than zero., or sequence of value must be an integer greater than zero."}
                   (:errors resp)))))))))

(deftest filter-by-last-edited-by-test
  (let [search-term "last-edited-by"]
    (mt/with-temp
      [:model/Card       {rasta-card-id :id}   {:name search-term}
       :model/Card       {lucky-card-id :id}   {:name search-term}
       :model/Card       {rasta-model-id :id}  {:name search-term :dataset true}
       :model/Card       {lucky-model-id :id}  {:name search-term :dataset true}
       :model/Dashboard  {rasta-dash-id :id}   {:name search-term}
       :model/Dashboard  {lucky-dash-id :id}   {:name search-term}
       :model/Metric     {rasta-metric-id :id} {:name search-term :table_id (mt/id :checkins)}
       :model/Metric     {lucky-metric-id :id} {:name search-term :table_id (mt/id :checkins)}]
      (let [rasta-user-id (mt/user->id :rasta)
            lucky-user-id (mt/user->id :lucky)]
        (doseq [[model id user-id] [[:model/Card rasta-card-id rasta-user-id] [:model/Card rasta-model-id rasta-user-id]
                                    [:model/Dashboard rasta-dash-id rasta-user-id] [:model/Metric rasta-metric-id rasta-user-id]
                                    [:model/Card lucky-card-id lucky-user-id] [:model/Card lucky-model-id lucky-user-id]
                                    [:model/Dashboard lucky-dash-id lucky-user-id] [:model/Metric lucky-metric-id lucky-user-id]]]
          (revision/push-revision!
           {:entity       model
            :id           id
            :user-id      user-id
            :is-creation? true
            :object       {:id id}}))

        (testing "Able to filter by last editor"
          (let [resp (mt/user-http-request :crowberto :get 200 "search" :q search-term :last_edited_by rasta-user-id)]

            (testing "only a subset of models are applicable"
              (is (= #{"dashboard" "dataset" "metric" "card"} (set (:available_models resp)))))

            (testing "results contains only entities with the specified creator"
              (is (= #{[rasta-metric-id "metric"]
                       [rasta-card-id   "card"]
                       [rasta-model-id  "dataset"]
                       [rasta-dash-id   "dashboard"]}
                     (->> (:data resp)
                          (map (juxt :id :model))
                          set))))))

        (testing "Able to filter by multiple last editor"
          (let [resp (mt/user-http-request :crowberto :get 200 "search" :q search-term :last_edited_by rasta-user-id :last_edited_by lucky-user-id)]

            (testing "only a subset of models are applicable"
              (is (= #{"dashboard" "dataset" "metric" "card"} (set (:available_models resp)))))

            (testing "results contains only entities with the specified creator"
              (is (= #{[rasta-metric-id "metric"]
                       [rasta-card-id   "card"]
                       [rasta-model-id  "dataset"]
                       [rasta-dash-id   "dashboard"]
                       [lucky-metric-id "metric"]
                       [lucky-card-id   "card"]
                       [lucky-model-id  "dataset"]
                       [lucky-dash-id   "dashboard"]}
                     (->> (:data resp)
                          (map (juxt :id :model))
                          set))))))

        (testing "error if last_edited_by is not an integer"
          (let [resp (mt/user-http-request :crowberto :get 400 "search" :q search-term :last_edited_by "not-a-valid-user-id")]
            (is (= {:last_edited_by "nullable value must be an integer greater than zero., or sequence of value must be an integer greater than zero."}
                   (:errors resp)))))))))

(deftest verified-filter-test
  (let [search-term "Verified filter"]
    (t2.with-temp/with-temp
      [:model/Card {v-card-id :id}  {:name (format "%s Verified Card" search-term)}
       :model/Card {_card-id :id}   {:name (format "%s Normal Card" search-term)}
       :model/Card {_model-id :id}  {:name (format "%s Normal Model" search-term) :dataset true}
       :model/Card {v-model-id :id} {:name (format "%s Verified Model" search-term) :dataset true}]
      (mt/with-verified-cards [v-card-id v-model-id]
        (premium-features-test/with-premium-features #{:content-verification}
          (testing "Able to filter only verified items"
            (let [resp (mt/user-http-request :crowberto :get 200 "search" :q search-term :verified true)]
              (testing "do not returns duplicated verified cards"
                (is (= 1 (->> resp
                              :data
                              (filter #(= {:model "card" :id v-card-id} (select-keys % [:model :id])))
                              count))))

              (testing "only a subset of models are applicable"
                (is (= #{"card" "dataset"} (set (:available_models resp)))))

              (testing "results contains only verified entities"
                (is (= #{[v-card-id  "card"       "Verified filter Verified Card"]
                         [v-model-id "dataset"    "Verified filter Verified Model"]}

                       (->> (:data resp)
                            (map (juxt :id :model :name))
                            set))))))

          (testing "Returns schema error if attempt to serach for non-verified items"
            (is (= {:verified "nullable true"}
                   (:errors (mt/user-http-request :crowberto :get 400 "search" :q "x" :verified false)))))

          (testing "Works with models filter"
            (testing "return intersections of supported models with provided models"
              (is (= #{"card"}
                     (->> (mt/user-http-request :crowberto :get 200 "search"
                                                :q search-term :verified true :models "card" :models "dashboard" :model "table")
                          :data
                          (map :model)
                          set))))))

        (premium-features-test/with-premium-features #{:content-verification}
          (testing "Returns verified cards and models only if :content-verification is enabled"
            (let [resp (mt/user-http-request :crowberto :get 200 "search" :q search-term :verified true)]

              (testing "only a subset of models are applicable"
                (is (= #{"card" "dataset"} (set (:available_models resp)))))

              (testing "results contains only verified entities"
                (is (= #{[v-card-id  "card"    "Verified filter Verified Card"]
                         [v-model-id "dataset" "Verified filter Verified Model"]}
                       (->> (:data resp)
                            (map (juxt :id :model :name))
                            set)))))))

        (testing "error if doesn't have premium-features"
          (premium-features-test/with-premium-features #{}
            (is (= "Content Management or Official Collections is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                   (mt/user-http-request :crowberto :get 402 "search" :q search-term :verified true)))))))))

(deftest created-at-api-test
  (let [search-term "created-at-filtering"]
    (with-search-items-in-root-collection search-term
      (testing "returns only applicable models"
        (is (= #{"dashboard" "table" "dataset" "collection" "database" "action" "card"}
               (-> (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_at "today")
                   :available_models
                   set))))

      (testing "works with others filter too"
        (is (= #{"dashboard" "table" "dataset" "collection" "database" "action" "card"}
               (-> (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_at "today" :creator_id (mt/user->id :rasta))
                   :available_models
                   set))))

      (testing "error if invalids created_at string"
        (is (= "Failed to parse datetime value: today~"
               (mt/user-http-request :crowberto :get 400 "search" :q search-term :created_at "today~" :creator_id (mt/user->id :rasta))))))))

(deftest filter-by-last-edited-at-test
  (let [search-term "last-edited-at-filtering"]
    (t2.with-temp/with-temp
      [:model/Card       {card-id :id}   {:name search-term}
       :model/Card       {model-id :id}  {:name search-term :dataset true}
       :model/Dashboard  {dash-id :id}   {:name search-term}
       :model/Metric     {metric-id :id} {:name search-term :table_id (mt/id :checkins)}
       :model/Action     {action-id :id} {:name       search-term
                                          :model_id   model-id
                                          :type       :http}]
      (doseq [[model id] [[:model/Card card-id] [:model/Card model-id]
                          [:model/Dashboard dash-id] [:model/Metric metric-id]]]
        (revision/push-revision!
         {:entity       model
          :id           id
          :user-id      (mt/user->id :rasta)
          :is-creation? true
          :object       {:id id}}))
      (testing "returns only applicable models"
        (let [resp (mt/user-http-request :crowberto :get 200 "search" :q search-term :last_edited_at "today")]
          (is (= #{[action-id "action"]
                   [card-id   "card"]
                   [dash-id   "dashboard"]
                   [model-id  "dataset"]
                   [metric-id "metric"]}
                 (->> (:data resp)
                      (map (juxt :id :model))
                      set)))

          (is (= #{"action" "card" "dashboard" "dataset" "metric"}
                 (-> resp
                     :available_models
                     set)))))

      (testing "works with the last_edited_by filter too"
        (doseq [[model id] [[:model/Card card-id] [:model/Card model-id]
                            [:model/Dashboard dash-id] [:model/Metric metric-id]]]
          (revision/push-revision!
           {:entity       model
            :id           id
            :user-id      (mt/user->id :rasta)
            :is-creation? true
            :object       {:id id}}))
        (is (= #{"dashboard" "dataset" "metric" "card"}
               (-> (mt/user-http-request :crowberto :get 200 "search" :q search-term :last_edited_at "today" :last_edited_by (mt/user->id :rasta))
                   :available_models
                   set))))

      (testing "error if invalids last_edited_at string"
        (is (= "Failed to parse datetime value: today~"
               (mt/user-http-request :crowberto :get 400 "search" :q search-term :last_edited_at "today~" :creator_id (mt/user->id :rasta))))))))

(deftest created-at-correctness-test
  (let [search-term "created-at-filtering"
        new          #t "2023-05-04T10:00Z[UTC]"
        two-years-ago (t/minus new (t/years 2))]
    (mt/with-clock new
      (t2.with-temp/with-temp
        [:model/Dashboard  {dashboard-new :id} {:name       search-term
                                                :created_at new}
         :model/Dashboard  {dashboard-old :id} {:name       search-term
                                                :created_at two-years-ago}
         :model/Database   {db-new :id}       {:name       search-term
                                               :created_at new}
         :model/Database   {db-old :id}      {:name       search-term
                                              :created_at two-years-ago}
         :model/Table      {table-new :id}    {:name       search-term
                                               :db_id      db-new
                                               :created_at new}
         :model/Table      {table-old :id}    {:name       search-term
                                               :db_id      db-old
                                               :created_at two-years-ago}
         :model/Collection {coll-new :id}     {:name       search-term
                                               :created_at new}
         :model/Collection {coll-old :id}     {:name       search-term
                                               :created_at two-years-ago}
         :model/Card       {card-new :id}     {:name       search-term
                                               :created_at new}
         :model/Card       {card-old :id}     {:name       search-term
                                               :created_at two-years-ago}
         :model/Card       {model-new :id}    {:name       search-term
                                               :dataset    true
                                               :created_at new}
         :model/Card       {model-old :id}    {:name       search-term
                                               :dataset    true
                                               :created_at two-years-ago}
         :model/Action     {action-new :id}   {:name       search-term
                                               :model_id   model-new
                                               :type       :http
                                               :created_at new}
         :model/Action     {action-old :id}   {:name       search-term
                                               :model_id   model-old
                                               :type       :http
                                               :created_at two-years-ago}
         :model/Segment    {_segment-new :id} {:name       search-term
                                               :created_at new}
         :model/Metric     {_metric-new :id}  {:name       search-term
                                               :created_at new
                                               :table_id (mt/id :checkins)}]
        ;; with clock doesn't work if calling via API, so we call the search function directly
        (let [test-search (fn [created-at expected]
                            (testing (format "searching with created-at = %s" created-at)
                              (mt/with-current-user (mt/user->id :crowberto)
                                (is (= expected
                                       (->> (#'api.search/search (#'api.search/search-context
                                                                  {:search-string search-term
                                                                   :archived      false
                                                                   :models        search.config/all-models
                                                                   :created-at    created-at}))
                                            :data
                                            (map (juxt :model :id))
                                            set))))))
              new-result  #{["action"     action-new]
                            ["card"       card-new]
                            ["collection" coll-new]
                            ["database"   db-new]
                            ["dataset"    model-new]
                            ["dashboard"  dashboard-new]
                            ["table"      table-new]}
              old-result  #{["action"     action-old]
                            ["card"       card-old]
                            ["collection" coll-old]
                            ["database"   db-old]
                            ["dataset"    model-old]
                            ["dashboard"  dashboard-old]
                            ["table"      table-old]}]
          ;; absolute datetime
          (test-search "Q2-2021" old-result)
          (test-search "2023-05-04" new-result)
          (test-search "2021-05-03~" (set/union old-result new-result))
         ;; range is inclusive of the start but exclusive of the end, so this does not contain new-result
          (test-search "2021-05-04~2023-05-03" old-result)
          (test-search "2021-05-05~2023-05-04" new-result)
          (test-search "~2023-05-03" old-result)
          (test-search "2021-05-04T09:00:00~2021-05-04T10:00:10" old-result)

         ;; relative times
          (test-search "thisyear" new-result)
          (test-search "past1years-from-12months" old-result)
          (test-search "today" new-result))))))

(deftest last-edited-at-correctness-test
  (let [search-term   "last-edited-at-filtering"
        new           #t "2023-05-04T10:00Z[UTC]"
        two-years-ago (t/minus new (t/years 2))]
    (mt/with-clock new
      (t2.with-temp/with-temp
        [:model/Dashboard  {dashboard-new :id} {:name       search-term}
         :model/Dashboard  {dashboard-old :id} {:name       search-term}
         :model/Card       {card-new :id}      {:name       search-term}
         :model/Card       {card-old :id}      {:name       search-term}
         :model/Card       {model-new :id}     {:name       search-term
                                                :dataset    true}
         :model/Card       {model-old :id}     {:name       search-term
                                                :dataset    true}
         :model/Metric     {metric-new :id}    {:name       search-term :table_id (mt/id :checkins)}
         :model/Metric     {metric-old :id}    {:name       search-term :table_id (mt/id :checkins)}
         :model/Action     {action-new :id}    {:name       search-term
                                                :model_id   model-new
                                                :type       :http
                                                :updated_at new}
         :model/Action     {action-old :id}    {:name       search-term
                                                :model_id   model-old
                                                :type       :http
                                                :updated_at two-years-ago}]
        (t2/insert! (t2/table-name :model/Revision) (for [[model model-id timestamp]
                                                          [["Dashboard" dashboard-new new]
                                                           ["Dashboard" dashboard-old two-years-ago]
                                                           ["Card" card-new new]
                                                           ["Card" card-old two-years-ago]
                                                           ["Card" model-new new]
                                                           ["Card" model-old two-years-ago]
                                                           ["Metric" metric-new new]
                                                           ["Metric" metric-old two-years-ago]]]
                                                      {:model       model
                                                       :model_id    model-id
                                                       :object      "{}"
                                                       :user_id     (mt/user->id :rasta)
                                                       :timestamp   timestamp
                                                       :most_recent true}))
        ;; with clock doesn't work if calling via API, so we call the search function directly
        (let [test-search (fn [last-edited-at expected]
                            (testing (format "searching with last-edited-at = %s" last-edited-at)
                              (mt/with-current-user (mt/user->id :crowberto)
                                (is (= expected
                                       (->> (#'api.search/search (#'api.search/search-context
                                                                  {:search-string  search-term
                                                                   :archived       false
                                                                   :models         search.config/all-models
                                                                   :last-edited-at last-edited-at}))
                                            :data
                                            (map (juxt :model :id))
                                            set))))))
              new-result  #{["action"    action-new]
                            ["card"      card-new]
                            ["dataset"   model-new]
                            ["dashboard" dashboard-new]
                            ["metric"    metric-new]}
              old-result  #{["action"    action-old]
                            ["card"      card-old]
                            ["dataset"   model-old]
                            ["dashboard" dashboard-old]
                            ["metric"    metric-old]}]
          ;; absolute datetime
          (test-search "Q2-2021" old-result)
          (test-search "2023-05-04" new-result)
          (test-search "2021-05-03~" (set/union old-result new-result))
          ;; range is inclusive of the start but exclusive of the end, so this does not contain new-result
          (test-search "2021-05-04~2023-05-03" old-result)
          (test-search "2021-05-05~2023-05-04" new-result)
          (test-search "~2023-05-03" old-result)
          (test-search "2021-05-04T09:00:00~2021-05-04T10:00:10" old-result)

          ;; relative times
          (test-search "thisyear" new-result)
          (test-search "past1years-from-12months" old-result)
          (test-search "today" new-result))))))

(deftest available-models-should-be-independent-of-models-param-test
  (testing "if a search request includes `models` params, the `available_models` from the response should not be restricted by it"
    (let [search-term "Available models"]
      (with-search-items-in-root-collection search-term
        (testing "GET /api/search"
          (is (= #{"dashboard" "dataset" "segment" "collection" "action" "metric" "card" "table" "database"}
                 (-> (mt/user-http-request :crowberto :get 200 "search" :q search-term :models "card")
                     :available_models
                     set)))

          (is (= #{"dashboard" "dataset" "segment" "collection" "action" "metric" "card" "table" "database"}
                 (-> (mt/user-http-request :crowberto :get 200 "search" :q search-term :models "card" :models "dashboard")
                     :available_models
                     set))))

        (testing "GET /api/search/models"
          (is (= #{"dashboard" "dataset" "segment" "collection" "action" "metric" "card" "table" "database"}
                 (set (mt/user-http-request :crowberto :get 200 "search/models" :q search-term :models "card"))))

          (is (= #{"dashboard" "dataset" "segment" "collection" "action" "metric" "card" "table" "database"}
                 (set (mt/user-http-request :crowberto :get 200 "search/models" :q search-term :models "card" :models "dashboard")))))))))

(deftest search-native-query-test
  (let [search-term "search-native-query"]
    (mt/with-temp
      [:model/Card {mbql-card :id}             {:name search-term}
       :model/Card {native-card-in-name :id}   {:name search-term}
       :model/Card {native-card-in-query :id}  {:dataset_query (mt/native-query {:query (format "select %s" search-term)})}
       :model/Card {mbql-model :id}            {:name search-term :dataset true}
       :model/Card {native-model-in-name :id}  {:name search-term :dataset true}
       :model/Card {native-model-in-query :id} {:dataset_query (mt/native-query {:query (format "select %s" search-term)}) :dataset true}]
      (mt/with-actions
        [_                         {:dataset true :dataset_query (mt/mbql-query venues)}
         {http-action :action-id}  {:type :http :name search-term}
         {query-action :action-id} {:type :query :dataset_query (mt/native-query {:query (format "delete from %s" search-term)})}]
        (testing "by default do not search for native content"
          (is (= #{["card" mbql-card]
                   ["card" native-card-in-name]
                   ["dataset" mbql-model]
                   ["dataset" native-model-in-name]
                   ["action" http-action]}
                 (->> (mt/user-http-request :crowberto :get 200 "search" :q search-term)
                      :data
                      (map (juxt :model :id))
                      set))))

        (testing "if search-native-query is true, search both dataset_query and the name"
          (is (= #{["card" mbql-card]
                   ["card" native-card-in-name]
                   ["dataset" mbql-model]
                   ["dataset" native-model-in-name]
                   ["action" http-action]

                   ["card" native-card-in-query]
                   ["dataset" native-model-in-query]
                   ["action" query-action]}
                 (->> (mt/user-http-request :crowberto :get 200 "search" :q search-term :search_native_query true)
                      :data
                      (map (juxt :model :id))
                      set))))))))

(deftest search-result-with-user-metadata-test
  (let [search-term "with-user-metadata"]
    (mt/with-temp
      [:model/User {user-id-1 :id} {:first_name "Ngoc"
                                    :last_name  "Khuat"}
       :model/User {user-id-2 :id} {:first_name nil
                                    :last_name  nil
                                    :email      "ngoc@metabase.com"}
       :model/Card {card-id-1 :id} {:creator_id user-id-1
                                    :name       search-term}
       :model/Card {card-id-2 :id} {:creator_id user-id-2
                                    :name       search-term}]

      (revision/push-revision!
       {:entity       :model/Card
        :id           card-id-1
        :user-id      user-id-1
        :is-creation? true
        :object       {:id card-id-1}})

      (revision/push-revision!
       {:entity       :model/Card
        :id           card-id-2
        :user-id      user-id-2
        :is-creation? true
        :object       {:id card-id-2}})

      (testing "search result should returns creator_common_name and last_editor_common_name"
        (is (= #{["card" card-id-1 "Ngoc Khuat" "Ngoc Khuat"]
                 ;; for user that doesn't have first_name or last_name, should fall backs to email
                 ["card" card-id-2 "ngoc@metabase.com" "ngoc@metabase.com"]}
               (->> (mt/user-http-request :crowberto :get 200 "search" :q search-term)
                    :data
                    (map (juxt :model :id :creator_common_name :last_editor_common_name))
                    set)))))))

(deftest models-table-db-id-test
  (testing "search/models request includes `table-db-id` param"
    (with-search-items-in-root-collection "Available models"
      (testing "`table-db-id` is invalid"
        (is (=? {:errors {:table-db-id "nullable value must be an integer greater than zero."}}
                (mt/user-http-request :crowberto :get 400 "search/models" :table-db-id -1))))
      (testing "`table-db-id` is for a non-existent database"
        (is (= #{"dashboard" "database" "segment" "collection" "action" "metric"}
               (set (mt/user-http-request :crowberto :get 200 "search/models" :table-db-id Integer/MAX_VALUE)))))
      (testing "`table-db-id` is for an existing database"
        (is (= #{"dashboard" "database" "segment" "collection" "action" "metric" "card" "dataset" "table"}
               (set (mt/user-http-request :crowberto :get 200 "search/models" :table-db-id (mt/id)))))))))

(deftest models-archived-string-test
  (testing "search/models request includes `archived-string` param"
    (with-search-items-in-root-collection "Available models"
      (mt/with-temp [Card        {model-id :id} action-model-params
                     Action      _              (archived {:name     "test action"
                                                           :type     :query
                                                           :model_id model-id})]
        (testing "`archived-string` is 'false'"
          (is (= #{"dashboard" "table" "dataset" "segment" "collection" "database" "action" "metric" "card"}
                 (set (mt/user-http-request :crowberto :get 200 "search/models" :archived "false")))))
        (testing "`archived-string` is 'true'"
          (is (= #{"action"}
                 (set (mt/user-http-request :crowberto :get 200 "search/models" :archived "true")))))))))

(deftest filter-items-in-personal-collection-test
  (let [search-term "filter-items-in-personal-collection"
        rasta-personal-coll-id     (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :rasta))
        crowberto-personal-coll-id (t2/select-one-pk :model/Collection :personal_owner_id (mt/user->id :crowberto))
        search                      (fn [user filter-type]
                                      (->> (mt/user-http-request user :get 200 "search" :q search-term
                                                                 :filter_items_in_personal_collection filter-type)
                                           :data
                                           (map (juxt :model :id))
                                           set))]
    (mt/with-temp
      [:model/Collection {coll-sub-public :id}     {:location "/" :name search-term}
       :model/Dashboard  {dash-public :id}         {:collection_id nil :name search-term}
       :model/Dashboard  {dash-sub-public :id}     {:collection_id coll-sub-public :name search-term}
       :model/Collection {coll-sub-rasta :id}      {:location (format "/%d/" rasta-personal-coll-id) :name search-term}
       :model/Card       {card-rasta :id}          {:collection_id rasta-personal-coll-id :name search-term}
       :model/Card       {card-sub-rasta :id}      {:collection_id coll-sub-rasta :name search-term}
       :model/Collection {coll-sub-crowberto :id}  {:location (format "/%d/" crowberto-personal-coll-id) :name search-term}
       :model/Card       {model-crowberto :id}     {:collection_id crowberto-personal-coll-id :dataset true :name search-term}
       :model/Card       {model-sub-crowberto :id} {:collection_id coll-sub-crowberto :dataset true :name search-term}]

      (testing "admin only"
        (is (= #{["dataset" model-crowberto]
                 ["dataset" model-sub-crowberto]
                 ["card" card-rasta]
                 ["card" card-sub-rasta]
                 ["collection" coll-sub-crowberto]
                 ["collection" coll-sub-rasta]}
               (search :crowberto "only"))))

      (testing "non-admin only"
        (is (= #{["card" card-rasta]
                 ["card" card-sub-rasta]
                 ["collection" coll-sub-rasta]}
               (search :rasta "only"))))

      (testing "admin exclude"
        (is (= #{["dashboard" dash-public]
                 ["dashboard" dash-sub-public]
                 ["collection" coll-sub-public]}
               (search :rasta "exclude"))))

      (testing "non-admin exclude"
        (is (= #{["dashboard" dash-public]
                 ["dashboard" dash-sub-public]
                 ["collection" coll-sub-public]}
               (search :rasta "exclude"))))

      (testing "getting models should return only models that are applied"
        (is (= #{"dashboard" "collection"}
               (set (mt/user-http-request :crowberto :get 200 "search/models" :q search-term
                                          :filter_items_in_personal_collection "exclude"))))))))

(deftest archived-search-results-with-no-write-perms-test
  (testing "Results which the searching user has no write permissions for are filtered out. #33602"
    (mt/with-temp [Collection  {collection-id :id} (archived {:name "collection test collection"})
                   Card        _ (archived {:name "card test card is returned"})
                   Card        _ (archived {:name "card test card"
                                            :collection_id collection-id})
                   Card        _ (archived {:name "dataset test dataset" :dataset true
                                            :collection_id collection-id})
                   Dashboard   _ (archived {:name          "dashboard test dashboard"
                                            :collection_id collection-id})]
      ;; remove read/write access and add back read access to the collection
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection-id)
      (is (= ["card test card is returned"]
             (->> (mt/user-http-request :lucky :get 200 "search" :archived true :q "test")
                  :data
                  (map :name)))))))
