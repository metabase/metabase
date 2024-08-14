(ns ^:mb/once metabase.api.search-test
  "There are more tests around search in [[metabase.search.impl-test]]. TODO: we should move more of the tests
  below into that namespace."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.models
    :refer [Action Card CardBookmark Collection Dashboard DashboardBookmark
            DashboardCard Database PermissionsGroup PermissionsGroupMembership
            Pulse PulseCard QueryAction Segment Table]]
   [metabase.models.collection :as collection]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.database :as database]
   [metabase.models.interface :as mi]
   [metabase.models.model-index :as model-index]
   [metabase.models.moderation-review :as moderation-review]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.models.revision :as revision]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.search.config :as search.config]
   [metabase.search.scoring :as scoring]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(def ^:private default-collection {:id false :name nil :authority_level nil :type nil})

(def ^:private default-search-row
  {:archived                   false
   :effective_location         nil
   :location                   nil
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
   :database_name              nil
   :dataset_query              nil
   :description                nil
   :display                    nil
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
  "Segments come back with information about their Tables as of 0.33.0. The `model-defaults` for Segment
  put them in the `:checkins` Table."
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
                                            :effective_location "/"
                                            :location "/"
                                            :updated_at false
                                            :type nil
                                            :can_write true))

(def ^:private action-model-params {:name "ActionModel", :type :model})

(defn- default-search-results []
  (sorted-results
   [(make-result "dashboard test dashboard", :model "dashboard", :bookmark false :creator_id true :creator_common_name "Rasta Toucan" :can_write true)
    test-collection
    (make-result "card test card", :model "card", :bookmark false, :dashboardcard_count 0 :creator_id true :creator_common_name "Rasta Toucan" :dataset_query nil :display "table" :can_write true)
    (make-result "dataset test dataset", :model "dataset", :bookmark false, :dashboardcard_count 0 :creator_id true :creator_common_name "Rasta Toucan" :dataset_query nil :display "table" :can_write true)
    (make-result "action test action", :model "action", :model_name (:name action-model-params), :model_id true,
                 :database_id true :creator_id true :creator_common_name "Rasta Toucan" :dataset_query (update (mt/query venues) :type name))
    (make-result "metric test metric", :model "metric", :bookmark false, :dashboardcard_count 0 :creator_id true :creator_common_name "Rasta Toucan" :dataset_query nil :display "table" :can_write true)
    (merge
     (make-result "segment test segment", :model "segment", :description "Lookin' for a blueberry" :creator_id true :creator_common_name "Rasta Toucan")
     (table-search-results))]))

(defn- default-segment-results []
  (filter #(contains? #{"segment"} (:model %)) (default-search-results)))

(defn- default-archived-results []
  (for [result (default-search-results)
        :when (false? (:archived result))]
    (cond-> result
      true (assoc :archived true)
      (= (:model result) "collection") (assoc :location (collection/trash-path)
                                              :effective_location (collection/trash-path)
                                              :collection (assoc default-collection :id true :name true :type "trash")))))

(defn- on-search-types [model-set f coll]
  (for [search-item coll]
    (if (contains? model-set (:model search-item))
      (f search-item)
      search-item)))

(defn- default-results-with-collection []
  (on-search-types #{"dashboard" "pulse" "card" "dataset" "metric" "action"}
                   #(assoc % :collection {:id true,
                                          :name (if (= (:model %) "action") nil true)
                                          :authority_level nil
                                          :type nil})
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
                                                     :type :model)
                   Dashboard   dashboard      (coll-data-map "dashboard %s dashboard" coll)
                   Card        metric         (assoc (coll-data-map "metric %s metric" coll)
                                                     :type :metric)
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

(deftest basic-test
  (testing "Basic search, should find 1 of each entity type, all items in the root collection"
    (with-search-items-in-root-collection "test"
      (is (= (default-search-results)
             (search-request-data :crowberto :q "test"))))))

(deftest basic-test-2
  (testing "Basic search should only return substring matches"
    (with-search-items-in-root-collection "test"
      (with-search-items-in-root-collection "something different"
        (is (= (default-search-results)
               (search-request-data :crowberto :q "test")))))))

(deftest basic-test-3
  (testing "It prioritizes exact matches"
    (with-search-items-in-root-collection "test"
      (with-redefs [search.config/*db-max-results* 1]
        (is (= [test-collection]
               (search-request-data :crowberto :q "test collection")))))))

(deftest basic-test-4
  (testing "It limits matches properly"
    (with-search-items-in-root-collection "test"
      (is (>= 2 (count (search-request-data :crowberto :q "test" :limit "2" :offset "0")))))))

(deftest basic-test-5
  (testing "It offsets matches properly"
    (with-search-items-in-root-collection "test"
      (is (<= 4 (count (search-request-data :crowberto :q "test" :limit "100" :offset "2")))))))

(deftest basic-test-6
  (testing "It offsets without limit properly"
    (with-search-items-in-root-collection "test"
      (is (<= 5 (count (search-request-data :crowberto :q "test" :offset "2")))))))

(deftest basic-test-7
  (testing "It limits without offset properly"
    (with-search-items-in-root-collection "test"
      (is (>= 2 (count (search-request-data :crowberto :q "test" :limit "2")))))))

(deftest basic-test-8
  (testing "It subsets matches for model"
    (with-search-items-in-root-collection "test"
      (is (= 0 (count (search-request-data :crowberto :q "test" :models "database"))))
      (is (= 1 (count (search-request-data :crowberto :q "test" :models "database" :models "card")))))))

(deftest basic-test-9
  (testing "It distinguishes datasets from cards"
    (with-search-items-in-root-collection "test"
      (let [results (search-request-data :crowberto :q "test" :models "dataset")]
        (is (= 1 (count results)))
        (is (= "dataset" (-> results first :model))))
      (let [results (search-request-data :crowberto :q "test" :models "card")]
        (is (= 1 (count results)))
        (is (= "card" (-> results first :model)))))))

(deftest basic-test-10
  (testing "It returns limit and offset params in return result"
    (with-search-items-in-root-collection "test"
      (is (= 2 (:limit (search-request :crowberto :q "test" :limit "2" :offset "3"))))
      (is (= 3 (:offset (search-request :crowberto :q "test" :limit "2" :offset "3")))))))

(deftest archived-models-test
  (testing "It returns some stuff when you get results"
    (with-search-items-in-root-collection "test"
      ;; sometimes there is a "table" in these responses. might be do to garbage in CI
      (is (set/subset? #{"dashboard" "dataset" "segment" "collection" "database" "metric" "card"}
                       (-> (mt/user-http-request :crowberto :get 200 "search" :q "test")
                           :available_models
                           set)))))
  (testing "It returns nothing if there are no results"
    (with-search-items-in-root-collection "test"
      (is (= [] (:available_models (mt/user-http-request :crowberto :get 200 "search" :q "noresults")))))))

(deftest query-model-set-test
  (let [search-term "query-model-set"]
    (with-search-items-in-root-collection search-term
      (testing "should returns a list of models that search result will return"
        (is (= #{"dashboard" "table" "dataset" "segment" "collection" "database" "action" "metric" "card"}
               (set (mt/user-http-request :crowberto :get 200 "search/models" :q search-term)))))
      (testing "return a subset of model for created-by filter"
        (is (= #{"dashboard" "dataset" "card" "metric" "action"}
               (set (mt/user-http-request :crowberto :get 200 "search/models"
                                          :q search-term
                                          :created_by (mt/user->id :rasta))))))
      (testing "return a subset of model for verified filter"
        (t2.with-temp/with-temp
          [:model/Card       {v-card-id :id}   {:name (format "%s Verified Card" search-term)}
           :model/Card       {v-model-id :id}  {:name (format "%s Verified Model" search-term) :type :model}
           :model/Card       {v-metric-id :id} {:name (format "%s Verified Metric" search-term) :type :metric}
           :model/Collection {_v-coll-id :id}  {:name (format "%s Verified Collection" search-term) :authority_level "official"}]
          (testing "when has both :content-verification features"
            (mt/with-premium-features #{:content-verification}
              (mt/with-verified-cards! [v-card-id v-model-id v-metric-id]
                (is (= #{"card" "dataset" "metric"}
                       (set (mt/user-http-request :crowberto :get 200 "search/models"
                                                  :q search-term
                                                  :verified true)))))))
          (testing "when has :content-verification feature only"
            (mt/with-premium-features #{:content-verification}
              (mt/with-verified-cards! [v-card-id]
                (is (= #{"card"}
                       (set (mt/user-http-request :crowberto :get 200 "search/models"
                                                  :q search-term
                                                  :verified true)))))))))
      (testing "return a subset of model for created_at filter"
        (is (= #{"dashboard" "table" "dataset" "collection" "database" "action" "card" "metric"}
               (set (mt/user-http-request :crowberto :get 200 "search/models"
                                          :q search-term
                                          :created_at "today")))))

      (testing "return a subset of model for search_native_query filter"
        (is (= #{"dataset" "action" "card" "metric"}
               (set (mt/user-http-request :crowberto :get 200 "search/models"
                                          :q search-term
                                          :search_native_query true))))))))

(def ^:private dashboard-count-results
  (letfn [(make-card [dashboard-count]
            (make-result (str "dashboard-count " dashboard-count) :dashboardcard_count dashboard-count,
                         :model "card", :bookmark false :creator_id true :creator_common_name "Rasta Toucan"
                         :dataset_query nil :display "table" :can_write true))]
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
      (is (=? (sort-by :dashboardcard_count dashboard-count-results)
              (sort-by :dashboardcard_count (unsorted-search-request-data :rasta :q "dashboard-count")))))))

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

(deftest archived-permissions-test
  (testing "Users without perms for a collection can't see search results that were trashed from that collection"
    (let [search-name (random-uuid)
          named       #(str search-name "-" %)]
      (mt/with-temp [:model/Collection {parent-id :id} {}
                     :model/Dashboard {dash :id} {:collection_id parent-id :name (named "dashboard")}
                     :model/Card {card :id} {:collection_id parent-id :name (named "card")}
                     :model/Card {model :id} {:collection_id parent-id :type :model :name (named "model")}]
        (mt/with-full-data-perms-for-all-users!
          (perms/revoke-collection-permissions! (perms-group/all-users) parent-id)
          (testing "sanity check: before archiving, we can't see these items"
            (is (= [] (:data (mt/user-http-request :rasta :get 200 "/search"
                                                   :archived true :q search-name)))))
          (mt/user-http-request :crowberto :put 200 (str "dashboard/" (u/the-id dash)) {:archived true})
          (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id card)) {:archived true})
          (mt/user-http-request :crowberto :put 200 (str "card/" (u/the-id model)) {:archived true})
          (testing "after archiving, we still can't see these items"
            (is (= [] (:data (mt/user-http-request :rasta :get 200 "/search"
                                                   :archived true :q search-name)))))
          (testing "an admin can see the items"
            (is (= #{dash card model}
                   (set (map :id (:data (mt/user-http-request :crowberto :get 200 "/search"
                                                              :archived true :q search-name)))))))
          (testing "the collection ID is correct - the Trash ID"
            (is (= #{(collection/trash-collection-id)}
                   (set (map (comp :id :collection) (:data (mt/user-http-request :crowberto :get 200 "/search"
                                                                                 :archived true :q search-name)))))))
          (testing "if we are granted permissions on the original collection, we can see the trashed items"
            (perms/grant-collection-readwrite-permissions! (perms-group/all-users) parent-id)
            (is (= #{dash card model}
                   (set (map :id (:data (mt/user-http-request :rasta :get 200 "/search"
                                                              :archived true :q search-name))))))))))))

(deftest permissions-test
  (testing (str "Ensure that users without perms for the root collection don't get results NOTE: Segments "
                "don't have collections, so they'll be returned")
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-root-collection "test"
        (mt/with-full-data-perms-for-all-users!
          (is (= (default-segment-results)
                 (search-request-data :rasta :q "test"))))))))

(deftest permissions-test-2
  (testing "Users that have root collection permissions should get root collection search results"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-root-collection "test"
        (mt/with-full-data-perms-for-all-users!
          (mt/with-temp [PermissionsGroup           group {}
                         PermissionsGroupMembership _ {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
            (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
            (is (mt/ordered-subset? (->> (default-search-results)
                                         (remove (comp #{"collection"} :model))
                                         (map #(cond-> %
                                                 (contains? #{"dashboard" "card" "dataset" "metric"} (:model %))
                                                 (assoc :can_write false))))
                                    (search-request-data :rasta :q "test")))))))))

(deftest permissions-test-3
  (testing "Users without root collection permissions should still see other collections they have access to"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {:keys [collection]} "test"
        (with-search-items-in-root-collection "test2"
          (mt/with-temp [PermissionsGroup           group {}
                         PermissionsGroupMembership _ {:user_id (mt/user->id :rasta), :group_id (u/the-id group)}]
            (mt/with-full-data-perms-for-all-users!
              (perms/grant-collection-read-permissions! group (u/the-id collection))
              (is (=? (->> (default-results-with-collection)
                           (map #(cond-> %
                                   (contains? #{"collection" "dashboard" "card" "dataset" "metric"} (:model %))
                                   (assoc :can_write false)))
                           (concat (map #(merge default-search-row % (table-search-results))
                                        [{:name "segment test2 segment", :description "Lookin' for a blueberry",
                                          :model "segment" :creator_id true :creator_common_name "Rasta Toucan"}]))
                           ;; This reverse is hokey; it's because the test2 results happen to come first in the API response
                           reverse
                           sorted-results)
                      (search-request-data :rasta :q "test"))))))))))

(deftest permissions-test-4
  (testing (str "Users with root collection permissions should be able to search root collection data long with "
                "collections they have access to")
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {:keys [collection]} "test"
        (with-search-items-in-root-collection "test2"
          (mt/with-temp [PermissionsGroup           group {}
                         PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id (u/the-id group)}]
            (mt/with-full-data-perms-for-all-users!
              (perms/grant-permissions! group (perms/collection-read-path {:metabase.models.collection.root/is-root? true}))
              (perms/grant-collection-read-permissions! group collection)
              (is (mt/ordered-subset? (->> (default-results-with-collection)
                                           (concat (->> (default-search-results)
                                                        (remove #(= "collection" (:model %)))
                                                        (map #(update % :name str/replace "test" "test2"))))
                                           (map #(cond-> %
                                                   (contains? #{"collection" "dashboard" "card" "dataset" "metric"} (:model %))
                                                   (assoc :can_write false)))
                                           reverse
                                           sorted-results)
                                      (search-request-data :rasta :q "test"))))))))))

(deftest permissions-test-5
  (testing "Users with access to multiple collections should see results from all collections they have access to"
    (with-search-items-in-collection {coll-1 :collection} "test"
      (with-search-items-in-collection {coll-2 :collection} "test2"
        (mt/with-temp [PermissionsGroup           group {}
                       PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id (u/the-id group)}]
          (mt/with-full-data-perms-for-all-users!
            (perms/grant-collection-read-permissions! group (u/the-id coll-1))
            (perms/grant-collection-read-permissions! group (u/the-id coll-2))
            (is (mt/ordered-subset? (sorted-results
                                     (reverse
                                      (into
                                       (default-results-with-collection)
                                       (map (fn [row] (update row :name #(str/replace % "test" "test2")))
                                            (default-results-with-collection)))))
                                    (search-request-data :rasta :q "test")))))))))

(deftest permissions-test-6
  (testing "User should only see results in the collection they have access to"
    (mt/with-non-admin-groups-no-root-collection-perms
      (with-search-items-in-collection {coll-1 :collection} "test"
        (with-search-items-in-collection _ "test2"
          (mt/with-full-data-perms-for-all-users!
            (mt/with-temp [PermissionsGroup           group {}
                           PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id (u/the-id group)}]
              (perms/grant-collection-read-permissions! group (u/the-id coll-1))
              (is (= (->> (default-results-with-collection)
                          (concat (map #(merge default-search-row % (table-search-results))
                                       [{:name "segment test2 segment" :description "Lookin' for a blueberry" :model "segment"
                                         :creator_id true :creator_common_name "Rasta Toucan"}]))
                          (map #(cond-> %
                                  (contains? #{"collection" "dashboard" "card" "dataset" "metric"} (:model %))
                                  (assoc :can_write false)))
                          reverse
                          sorted-results)
                     (search-request-data :rasta :q "test"))))))))))

(deftest permissions-test-7
  (testing "Segments on tables for which the user does not have access to should not show up in results"
    (mt/with-temp [Database {db-id :id} {}
                   Table    {table-id :id} {:db_id  db-id
                                            :schema nil}
                   Segment  _ {:table_id table-id
                               :name     "test segment"}]
      (mt/with-no-data-perms-for-all-users!
        (is (= []
               (search-request-data :rasta :q "test")))))))

(deftest permissions-test-8
  (testing "Databases for which the user does not have access to should not show up in results"
    (mt/with-temp [Database _db-1  {:name "db-1"}
                   Database _db-2 {:name "db-2"}]
      (is (set/subset? #{"db-2" "db-1"}
                       (->> (search-request-data-with sorted-results :rasta :q "db")
                            (map :name)
                            set)))
      (mt/with-no-data-perms-for-all-users!
        (is (nil? ((->> (search-request-data-with sorted-results :rasta :q "db")
                        (map :name)
                        set)
                   "db-1")))))))

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
    (mt/with-temp [Database _ {:name "aviaries"}
                   Database _ {:name "user_favorite_places" :description "Join table between users and their favorite places, which could include aviaries"}
                   Database _ {:name "users" :description "As it sounds"}]
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
        (mt/with-temp [Card model {:type          :model
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

(deftest indexed-entity-perms-test
  (mt/dataset airports
    (let [query (mt/mbql-query municipality)]
      (mt/with-temp [Collection collection           {:name     "test"
                                                      :location "/"}
                     Card       root-model           {:type         :model
                                                      :dataset_query query
                                                      :collection_id nil}
                     Card       sub-collection-model {:type          :model
                                                      :dataset_query query
                                                      :collection_id (u/id collection)}]
        (let [model-index-1 (model-index/create
                             (mt/$ids {:model-id   (:id root-model)
                                       :pk-ref     $municipality.id
                                       :value-ref  $municipality.name
                                       :creator-id (mt/user->id :rasta)}))
              model-index-2 (model-index/create
                             (mt/$ids {:model-id   (:id sub-collection-model)
                                       :pk-ref     $municipality.id
                                       :value-ref  $municipality.name
                                       :creator-id (mt/user->id :rasta)}))
              relevant-1    (comp (filter (comp #{(:id root-model)} :model_id))
                                  (filter (comp #{"indexed-entity"} :model)))
              relevant-2    (comp (filter (comp #{(:id sub-collection-model)} :model_id))
                                  (filter (comp #{"indexed-entity"} :model)))
              search!       (fn search!
                              ([search-term] (search! search-term :crowberto))
                              ([search-term user] (:data (make-search-request user [:q search-term]))))
              normalize     (fn [x] (-> x (update :pk_ref mbql.normalize/normalize)))]
          (model-index/add-values! model-index-1)
          (model-index/add-values! model-index-2)

          (testing "Indexed entities returned if a non-admin user has full data perms and collection access"
            (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :unrestricted
                                                           :create-queries :query-builder-and-native}}
              (is (=? {"Rome"   {:pk_ref         (mt/$ids $municipality.id)
                                 :name           "Rome"
                                 :model_id       (:id root-model)
                                 :model_name     (:name root-model)
                                 :model_index_id (mt/malli=? :int)}
                       "Tromsø" {:pk_ref         (mt/$ids $municipality.id)
                                 :name           "Tromsø"
                                 :model_id       (:id root-model)
                                 :model_name     (:name root-model)
                                 :model_index_id (mt/malli=? :int)}}
                      (into {} (comp relevant-1 (map (juxt :name normalize)))
                            (search! "rom" :rasta))))))

          (testing "Indexed entities are not returned if a user doesn't have full data perms for the DB"
            (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :unrestricted
                                                           :create-queries :no}}
              (is (= #{}
                     (into #{} (comp relevant-1 (map (juxt :name normalize)))
                           (search! "rom" :rasta)))))

            (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :unrestricted
                                                           :create-queries :query-builder}}
              (is (= #{}
                     (into #{} (comp relevant-1 (map (juxt :name normalize)))
                           (search! "rom" :rasta)))))

            (let [[id-1 id-2 id-3 id-4] (map u/the-id (database/tables (mt/db)))]
              (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :unrestricted
                                                             :create-queries {"PUBLIC" {id-1 :query-builder
                                                                                        id-2 :query-builder
                                                                                        id-3 :query-builder
                                                                                        id-4 :no}}}}
                (is (= #{}
                       (into #{} (comp relevant-1 (map (juxt :name normalize)))
                             (search! "rom" :rasta))))))

            (mt/with-additional-premium-features #{:advanced-permissions}
              (mt/with-all-users-data-perms-graph! {(mt/id) {:view-data :blocked
                                                             :create-queries :no}}
                (is (= #{}
                       (into #{} (comp relevant-1 (map (juxt :name normalize)))
                             (search! "rom" :rasta)))))))

          (testing "Indexed entities are not returned if a user doesn't have root collection access"
            (mt/with-non-admin-groups-no-root-collection-perms
              (is (= #{}
                     (into #{} (comp relevant-1 (map (juxt :name normalize)))
                           (search! "rom" :rasta)))))

            (mt/with-non-admin-groups-no-collection-perms collection
              (is (= #{}
                     (into #{} (comp relevant-2 (map (juxt :name normalize)))
                           (search! "rom" :rasta))))))

          (testing "Sandboxed users do not see indexed entities in search"
            (with-redefs [premium-features/sandboxed-or-impersonated-user? (constantly true)]
              (is (= #{}
                     (into #{} (comp relevant-1 (map :name)) (search! "fort")))))))))))

(defn- archived-collection [m]
  (assoc m
         :archived true
         :archived_directly true
         :archive_operation_id (str (random-uuid))))

(defn- archived-with-trashed-from-id [m]
  (assoc m
         :archived true
         :archived_directly true
         :collection_id (:collection_id m)))

(deftest archived-results-test
  (testing "Should return unarchived results by default"
    (with-search-items-in-root-collection "test"
      (mt/with-temp [Card        action-model {:type :model}
                     Action      {action-id :id} (archived {:name     "action test action 2"
                                                            :type     :query
                                                            :model_id (u/the-id action-model)})
                     QueryAction _ (query-action action-id)
                     Card        _ (archived {:name "card test card 2"})
                     Card        _ (archived {:name "dataset test dataset" :type :model})
                     Dashboard   _ (archived {:name "dashboard test dashboard 2"})
                     Collection  _ (archived-collection {:name "collection test collection 2"})
                     Card        _ (archived {:name "metric test metric 2" :type :metric})
                     Segment     _ (archived {:name "segment test segment 2"})]
        (is (= (default-search-results)
               (search-request-data :crowberto :q "test")))))))

(deftest archived-results-test-2
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
                     Card        _ (archived {:name "dataset test dataset" :type :model})
                     Dashboard   _ (archived {:name "dashboard test dashboard"})
                     Collection  _ (archived-collection {:name "collection test collection"})
                     Card        _ (archived {:name "metric test metric" :type :metric})
                     Segment     _ (archived {:name "segment test segment"})]
        (is (= (default-archived-results)
               (search-request-data :crowberto :q "test", :archived "true")))))))

(deftest archived-results-test-3
  (testing "Should return archived results when specified without a search query"
    (with-search-items-in-root-collection "test2"
      (mt/with-temp [Card        action-model action-model-params
                     Action      {action-id :id} (archived {:name     "action test action"
                                                            :type     :query
                                                            :model_id (u/the-id action-model)})
                     QueryAction _ (query-action action-id)
                     Card        _ (archived {:name "card test card"})
                     Card        _ (archived {:name "dataset test dataset" :type :model})
                     Dashboard   _ (archived {:name "dashboard test dashboard"})
                     Collection  _ (archived-collection {:name "collection test collection"})
                     Card        _ (archived {:name "metric test metric" :type :metric})
                     Segment     _ (archived {:name "segment test segment"})]
        (is (mt/ordered-subset? (default-archived-results)
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
    :database_name       "test-data (h2)"
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
                            (search-request-data user :q "RoundTable")))))))

(deftest table-test-2
  (testing "You should not see hidden tables"
    (mt/with-temp [Table _normal {:name "Foo Visible"}
                   Table _hidden {:name "Foo Hidden", :visibility_type "hidden"}]
      (do-test-users [user [:crowberto :rasta]]
                     (is (= [(default-table-search-row "Foo Visible")]
                            (search-request-data user :q "Foo")))))))

(deftest table-test-3
  (testing "You should be able to search by their display name"
    (let [lancelot "Lancelot's Favorite Furniture"]
      (mt/with-temp [Table _ {:name "RoundTable" :display_name lancelot}]
        (do-test-users [user [:crowberto :rasta]]
                       (is (= [(assoc (default-table-search-row "RoundTable") :name lancelot)]
                              (search-request-data user :q "Lancelot"))))))))

(deftest table-test-4
  (testing "You should be able to search by their description"
    (let [lancelot "Lancelot's Favorite Furniture"]
      (mt/with-temp [Table _ {:name "RoundTable" :description lancelot}]
        (do-test-users [user [:crowberto :rasta]]
                       (is (= [(assoc (default-table-search-row "RoundTable") :description lancelot :table_description lancelot)]
                              (search-request-data user :q "Lancelot"))))))))

(deftest table-test-5
  (testing "When searching with ?archived=true, normal Tables should not show up in the results"
    (let [table-name (mt/random-name)]
      (mt/with-temp [Table _ {:name table-name}]
        (do-test-users [user [:crowberto :rasta]]
                       (is (= []
                              (search-request-data user :q table-name :archived true))))))))

(deftest table-test-6
  (testing "*archived* tables should not appear in search results"
    (let [table-name (mt/random-name)]
      (mt/with-temp [Table _ {:name table-name, :active false}]
        (do-test-users [user [:crowberto :rasta]]
                       (is (= []
                              (search-request-data user :q table-name))))))))

(deftest table-test-7
  (testing "you should not be able to see a Table if the current user doesn't have permissions for that Table"
    (mt/with-temp [Database {db-id :id} {}
                   Table    table {:db_id db-id}]
      (mt/with-no-data-perms-for-all-users!
        (is (= []
               (binding [*search-request-results-database-id* db-id]
                 (search-request-data :rasta :q (:name table)))))))))

(deftest all-users-no-perms-table-test
  (testing (str "If the All Users group doesn't have perms to view a Table, but the current User is in a group that "
                "does have perms, they should still be able to see it (#12332)")
    (mt/with-temp [Database                   {db-id :id} {:name "test-data (h2)"}
                   Table                      table {:name "RoundTable" :db_id db-id}
                   PermissionsGroup           {group-id :id} {}
                   PermissionsGroupMembership _ {:group_id group-id :user_id (mt/user->id :rasta)}]
      (mt/with-no-data-perms-for-all-users!
        (data-perms/set-database-permission! group-id db-id :perms/view-data :unrestricted)
        (data-perms/set-table-permission! group-id table :perms/create-queries :query-builder)
        (do-test-users [user [:crowberto :rasta]]
                       (is (= [(default-table-search-row "RoundTable")]
                              (binding [*search-request-results-database-id* db-id]
                                (search-request-data user :q "RoundTable")))))))))

(deftest all-users-no-data-perms-table-test
  (testing "If the All Users group doesn't have perms to view a Table they sholdn't see it (#16855)"
    (mt/with-temp [Database                   {db-id :id} {}
                   Table                      table {:name "RoundTable", :db_id db-id}]
      (mt/with-restored-data-perms-for-group! (:id (perms-group/all-users))
        (data-perms/set-table-permission! (perms-group/all-users) table :perms/create-queries :no)
        (is (= []
               (filter #(= (:name %) "RoundTable")
                       (binding [*search-request-results-database-id* db-id]
                         (search-request-data :rasta :q "RoundTable")))))))))

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
         :model/Card      {model-id :id}     {:name (format "%s Dataset 1" search-term) :type :model :creator_id user-id}
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
            (is (= {:created_by "nullable vector of value must be an integer greater than zero."}
                   (:errors resp)))))))))

(deftest filter-by-last-edited-by-test
  (let [search-term "last-edited-by"]
    (mt/with-temp
      [:model/Card       {rasta-card-id :id}   {:name search-term}
       :model/Card       {lucky-card-id :id}   {:name search-term}
       :model/Card       {rasta-model-id :id}  {:name search-term :type :model}
       :model/Card       {lucky-model-id :id}  {:name search-term :type :model}
       :model/Dashboard  {rasta-dash-id :id}   {:name search-term}
       :model/Dashboard  {lucky-dash-id :id}   {:name search-term}
       :model/Card       {rasta-metric-id :id} {:name search-term :type :metric}
       :model/Card       {lucky-metric-id :id} {:name search-term :type :metric}]
      (let [rasta-user-id (mt/user->id :rasta)
            lucky-user-id (mt/user->id :lucky)]
        (doseq [[model id user-id] [[:model/Card rasta-card-id rasta-user-id] [:model/Card rasta-model-id rasta-user-id]
                                    [:model/Dashboard rasta-dash-id rasta-user-id] [:model/Card rasta-metric-id rasta-user-id]
                                    [:model/Card lucky-card-id lucky-user-id] [:model/Card lucky-model-id lucky-user-id]
                                    [:model/Dashboard lucky-dash-id lucky-user-id] [:model/Card lucky-metric-id lucky-user-id]]]
          (revision/push-revision!
           {:entity       model
            :id           id
            :user-id      user-id
            :is-creation? true
            :object       (merge {:id id}
                                 (when (= model :model/Card)
                                   {:type "question"}))}))

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
            (is (= {:last_edited_by "nullable vector of value must be an integer greater than zero."}
                   (:errors resp)))))))))

(deftest verified-filter-test
  (let [search-term "Verified filter"]
    (t2.with-temp/with-temp
      [:model/Card {v-card-id :id}  {:name (format "%s Verified Card" search-term)}
       :model/Card {_card-id :id}   {:name (format "%s Normal Card" search-term)}
       :model/Card {_model-id :id}  {:name (format "%s Normal Model" search-term) :type :model}
       :model/Card {v-model-id :id} {:name (format "%s Verified Model" search-term) :type :model}]
      (mt/with-verified-cards! [v-card-id v-model-id]
        (mt/with-premium-features #{:content-verification}
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

        (mt/with-premium-features #{:content-verification}
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
          (mt/with-premium-features #{}
            (is (= "Content Management or Official Collections is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                   (mt/user-http-request :crowberto :get 402 "search" :q search-term :verified true)))))))))

(deftest created-at-api-test
  (let [search-term "created-at-filtering"]
    (with-search-items-in-root-collection search-term
      (testing "returns only applicable models"
        (is (=? {:available_models #(= #{"dashboard" "table" "dataset" "collection" "database" "action" "card" "metric"}
                                       (set %))}
                (mt/user-http-request :crowberto :get 200 "search" :q search-term :created_at "today"))))

      (testing "works with others filter too"
        (is (= #{"dashboard" "table" "dataset" "collection" "database" "action" "card" "metric"}
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
       :model/Card       {model-id :id}  {:name search-term :type :model}
       :model/Dashboard  {dash-id :id}   {:name search-term}
       :model/Card       {metric-id :id} {:name search-term :type :metric}
       :model/Action     {action-id :id} {:name       search-term
                                          :model_id   model-id
                                          :type       :http}]
      (doseq [[model id] [[:model/Card card-id] [:model/Card model-id]
                          [:model/Dashboard dash-id] [:model/Card metric-id]]]
        (revision/push-revision!
         {:entity       model
          :id           id
          :user-id      (mt/user->id :rasta)
          :is-creation? true
          :object       (merge {:id id}
                               (when (= model :model/Card)
                                 {:type "question"}))}))
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
                            [:model/Dashboard dash-id] [:model/Card metric-id]]]
          (revision/push-revision!
           {:entity       model
            :id           id
            :user-id      (mt/user->id :rasta)
            :is-creation? true
            :object       (merge {:id id}
                                 (when (= model :model/Card)
                                   {:type "question"}))}))
        (is (= #{"dashboard" "dataset" "metric" "card"}
               (-> (mt/user-http-request :crowberto :get 200 "search" :q search-term :last_edited_at "today" :last_edited_by (mt/user->id :rasta))
                   :available_models
                   set))))

      (testing "error if invalids last_edited_at string"
        (is (= "Failed to parse datetime value: today~"
               (mt/user-http-request :crowberto :get 400 "search" :q search-term :last_edited_at "today~" :creator_id (mt/user->id :rasta))))))))

(deftest filter-by-ids-test
  (let [ids #(->> % :data (map :id) set)]
    (mt/with-temp [:model/Card {c1 :id} {:name "a"}
                   :model/Card {c2 :id} {:name "b"}]
      (testing "returns exactly the instances we need"
        (is (= #{c1}
               (ids (mt/user-http-request :crowberto :get 200 "search" :models "card" :ids c1))))
        (is (= #{c1 c2}
               (ids (mt/user-http-request :crowberto :get 200 "search" :models "card" :ids c1 :ids c2)))))
      (testing "requires single model type to be supplied"
        (is (= "Filtering by ids work only when you ask for a single model"
               (mt/user-http-request :crowberto :get 400 "search" :models "card" :models "dashboard" :ids c1)))
        (is (= "Filtering by ids work only when you ask for a single model"
               (mt/user-http-request :crowberto :get 400 "search" :ids c1)))))))

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
       :model/Card {mbql-model :id}            {:name search-term :type :model}
       :model/Card {native-model-in-name :id}  {:name search-term :type :model}
       :model/Card {native-model-in-query :id} {:dataset_query (mt/native-query {:query (format "select %s" search-term)}) :type :model}]
      (mt/with-actions
        [_                         {:type :model :dataset_query (mt/mbql-query venues)}
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
        :object       {:id card-id-1 :type "question"}})

      (revision/push-revision!
       {:entity       :model/Card
        :id           card-id-2
        :user-id      user-id-2
        :is-creation? true
        :object       {:id card-id-2 :type "question"}})

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
        (is (= #{"dashboard" "database" "segment" "collection" "action"}
               (set (mt/user-http-request :crowberto :get 200 "search/models" :table-db-id Integer/MAX_VALUE)))))
      (testing "`table-db-id` is for an existing database"
        (is (= #{"dashboard" "database" "segment" "collection" "action" "metric" "card" "dataset" "table"}
               (set (mt/user-http-request :crowberto :get 200 "search/models" :table-db-id (mt/id)))))))))

(deftest models-archived-string-test
  (testing "search/models request includes `archived-string` param"
    (with-search-items-in-root-collection "Available models"
      (mt/with-temp [Card   {model-id :id} action-model-params
                     Action _              (archived {:name     "test action"
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
       :model/Card       {model-crowberto :id}     {:collection_id crowberto-personal-coll-id :type :model :name search-term}
       :model/Card       {model-sub-crowberto :id} {:collection_id coll-sub-crowberto :type :model :name search-term}]
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

(deftest collection-effective-parent-test
  (mt/with-temp [:model/Collection coll-1  {:name "Collection 1"}
                 :model/Collection coll-2  {:name "Collection 2", :location (collection/location-path coll-1)}
                 :model/Collection _coll-3 {:name "Collection 3", :location (collection/location-path coll-1 coll-2)}]
    (testing "Collection search results are properly hydrated with their effective parent in the :collection field"
      (let [result (mt/user-http-request :rasta :get 200 "search" :q "Collection 3" :models ["collection"])]
        (is (= {:id              (u/the-id coll-2)
                :name            "Collection 2"
                :authority_level nil
                :type            nil}
               (-> result :data first :collection))))

      (perms/revoke-collection-permissions! (perms-group/all-users) coll-2)
      (let [result (mt/user-http-request :rasta :get 200 "search" :q "Collection 3" :models ["collection"])]
        (is (= {:id              (u/the-id coll-1)
                :name            "Collection 1"
                :authority_level nil
                :type            nil}
               (-> result :data first :collection))))

      (perms/revoke-collection-permissions! (perms-group/all-users) coll-1)
      (let [result (mt/user-http-request :rasta :get 200 "search" :q "Collection 3" :models ["collection"])]
        (is (= {:id              "root"
                :name            "Our analytics"
                :authority_level nil
                :type            nil}
               (-> result :data first :collection)))))))

(deftest archived-search-results-with-no-write-perms-test
  (testing "Results which the searching user has no write permissions for are filtered out. (#24018, #33602)"
    ;; note that the collection does not start out archived, so that we can revoke/grant permissions on it
    (mt/with-temp [Collection  {collection-id :id} {:name "collection test collection"}
                   Card        {card-1-id :id} (archived-with-trashed-from-id {:name "card test card is returned"})
                   Card        {card-2-id :id} (archived-with-trashed-from-id {:name "card test card"
                                                                               :collection_id collection-id})
                   Card        {card-3-id :id} (archived-with-trashed-from-id {:name "dataset test dataset"
                                                                               :type :model
                                                                               :collection_id collection-id})
                   Dashboard   _ (archived-with-trashed-from-id {:name          "dashboard test dashboard"
                                                                 :collection_id collection-id})]
      ;; remove read/write access and add back read access to the collection
      (perms/revoke-collection-permissions! (perms-group/all-users) collection-id)
      (perms/grant-collection-read-permissions! (perms-group/all-users) collection-id)
      (mt/with-current-user (mt/user->id :crowberto)
        (collection/archive-or-unarchive-collection! (t2/select-one :model/Collection :id collection-id)
                                                     {:archived true}))
      (testing "Sanity check: Lucky should not be able to write our test Collection"
        (mt/with-test-user :lucky
          (is (not (mi/can-write? :model/Collection collection-id)))))
      (is (= ["card test card is returned"]
             (->> (mt/user-http-request :lucky :get 200 "search" :archived true :q "test" :models ["card"])
                  :data
                  (filter #(#{card-1-id card-2-id card-3-id} (:id %)))
                  (map :name)))))))

(deftest model-ancestors-gets-ancestor-collections
  (testing "Collection names are correct"
    (mt/with-temp [Collection {top-col-id :id} {:name "top level col" :location "/"}
                   Collection {mid-col-id :id} {:name "middle level col" :location (str "/" top-col-id "/")}
                   Card {leaf-card-id :id} {:type :model :collection_id mid-col-id :name "leaf model"}
                   Card {top-card-id :id} {:type :model :collection_id top-col-id :name "top model"}]
      (is (= #{[leaf-card-id [{:name "top level col" :type nil :id top-col-id}]]
               [top-card-id []]}
             (->> (mt/user-http-request :rasta :get 200 "search" :model_ancestors true :q "model" :models ["dataset"])
                  :data
                  (map (juxt :id #(get-in % [:collection :effective_ancestors])))
                  (into #{})))))))

(deftest model-ancestors-gets-ancestor-collections-2
  (testing "Collection names are correct"
    (mt/with-temp [Collection {top-col-id :id} {:name "top level col" :location "/"}
                   Collection {mid-col-id :id} {:name "middle level col" :location (str "/" top-col-id "/")}
                   Card {leaf-card-id :id} {:type :model :collection_id mid-col-id :name "leaf model"}
                   Card {top-card-id :id} {:type :model :collection_id top-col-id :name "top model"}]
      (is (= #{[leaf-card-id [{:name "top level col" :type nil :id top-col-id}]]
               [top-card-id []]}
             (->> (mt/user-http-request :rasta :get 200 "search" :model_ancestors true :q "model" :models ["dataset"])
                  :data
                  (map (juxt :id #(get-in % [:collection :effective_ancestors])))
                  (into #{})))))))

(deftest model-ancestors-gets-ancestor-collections-3
  (testing "Non-models don't get collection_ancestors"
    (mt/with-temp [Card _ {:name "question"
                           :collection_id nil}]
      (is (not (contains? (->> (mt/user-http-request :rasta :get 200 "search" :model_ancestors true :q "question" :models ["dataset" "card"])
                               :data
                               (filter #(= (:name %) "question"))
                               first
                               :collection)
                          :effective_ancestors))))))

(deftest model-ancestors-gets-ancestor-collections-4
  (testing "If `model_parents` is not passed, it doesn't get populated"
    (mt/with-temp [Collection {top-col-id :id} {:name "top level col" :location "/"}
                   Collection {mid-col-id :id} {:name "middle level col" :location (str "/" top-col-id "/")}
                   Card _ {:type :model :collection_id mid-col-id :name "leaf model"}
                   Card _ {:type :model :collection_id top-col-id :name "top model"}]
      (is (= [nil nil]
             (->> (mt/user-http-request :rasta :get 200 "search" :model_ancestors false :q "model" :models ["dataset"])
                  :data
                  (map #(get-in % [:collection :effective_ancestors]))))))))

(deftest collection-type-is-returned
  (testing "Users without perms for a collection can't see search results that were trashed from that collection"
    (let [search-name (random-uuid)
          named       #(str search-name "-" %)]
      (mt/with-temp [:model/Collection {parent-id :id :as parent} {}
                     :model/Collection _ {:location (collection/children-location parent)
                                                   :name (named "collection")
                                                   :type "meow mix"}
                     :model/Dashboard _ {:collection_id parent-id :name (named "dashboard")}
                     :model/Card _ {:collection_id parent-id :name (named "card")}
                     :model/Card _ {:collection_id parent-id :type :model :name (named "model")}]
        (testing "the collection data includes the type under `item.type` for collections"
          (is (every? #(contains? % :type)
                      (->> (mt/user-http-request :crowberto :get 200 "/search" :q search-name)
                           :data
                           (filter #(= (:model %) "collection")))))
          (is (not-any? #(contains? % :type)
                        (->> (mt/user-http-request :crowberto :get 200 "/search" :q search-name)
                             :data
                             (remove #(= (:model %) "collection"))))))
        (testing "`item.type` is correct for collections"
          (is (= #{"meow mix"} (->> (mt/user-http-request :crowberto :get 200 "/search" :q search-name)
                                 :data
                                 (keep :type)
                                 set)))))
      (testing "Type is on both `item.collection.type` and `item.collection.effective_ancestors`"
          (mt/with-temp [Collection {top-col-id :id} {:name "top level col" :location "/" :type "foo"}
                         Collection {mid-col-id :id} {:name "middle level col" :type "bar" :location (str "/" top-col-id "/")}
                         Card {leaf-card-id :id} {:type :model :collection_id mid-col-id :name "leaf model"}]
            (let [leaf-card-response (->> (mt/user-http-request :rasta :get 200 "search" :model_ancestors true :q "model" :models ["dataset"])
                                          :data
                                          (filter #(= (:id %) leaf-card-id))
                                          first)]
              (is (= {:id mid-col-id
                      :name "middle level col"
                      :type "bar"
                      :authority_level nil
                      :effective_ancestors [{:id top-col-id
                                             :name "top level col"
                                             :type "foo"}]}
                     (:collection leaf-card-response)))))))))
