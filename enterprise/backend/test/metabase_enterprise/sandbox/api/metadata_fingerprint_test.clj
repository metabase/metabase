(ns metabase-enterprise.sandbox.api.metadata-fingerprint-test
  "A Field's fingerprint is computed by sync over every row of its table, and a Card's `result_metadata` over every row
  its query returned to whoever ran it. Neither describes the rows a sandboxed user may see, so the metadata endpoints
  must not hand them out to one."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase-enterprise.sandbox.api.metadata-fingerprint-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as mt.tu]
   [metabase-enterprise.test :as met]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.permissions.test-util :as perms.tu]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- fingerprints
  "Every non-nil `:fingerprint` anywhere in `response`."
  [response]
  (into []
        (comp (filter map?) (keep :fingerprint))
        (tree-seq coll? seq response)))

(defn- row-sandbox []
  {:gtaps      {:venues   {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}
                :checkins {:remappings {:user [:variable [:field (mt/id :checkins :user_id) nil]]}}}
   :attributes {:cat 50, :user 1}})

(defn- column-sandbox []
  {:gtaps      {:venues {:query      (mt.tu/restricted-column-query (mt/id))
                         :remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
   :attributes {:cat 50}})

(defn- check-endpoint
  "The admin gets fingerprints from `GET url` and the sandboxed user gets none, in and out of malli enforcement."
  [url & params]
  (testing (str "GET " url)
    (testing "positive control: an admin gets the fingerprints"
      (is (seq (fingerprints (apply mt/user-http-request :crowberto :get 200 url params)))))
    (testing "a sandboxed user gets no fingerprint"
      (is (= [] (fingerprints (apply mt/user-http-request :rasta :get 200 url params))))
      (mu/disable-enforcement
        (is (= [] (fingerprints (apply mt/user-http-request :rasta :get 200 url params))))))))

(deftest field-and-table-metadata-omit-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (check-endpoint (str "field/" (mt/id :venues :price)))
    (check-endpoint (str "field/" (mt/id :venues :category_id)))
    (check-endpoint (format "table/%d/query_metadata" (mt/id :venues)))
    (check-endpoint (format "table/%d/fks" (mt/id :venues)))
    (check-endpoint (format "database/%d/metadata" (mt/id)))
    (check-endpoint (format "database/%d" (mt/id)) :include "tables.fields")
    (check-endpoint (format "field/%d/related" (mt/id :venues :price)))))

(deftest unsandboxed-table-keeps-fingerprints-test
  (testing "Only the tables the user is row-restricted on lose their fingerprints"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {:cat 50}}
      (perms.tu/with-perms-for-group-and-tables! &group {(mt/id :categories) {:perms/view-data      :unrestricted
                                                                              :perms/create-queries :query-builder}}
        (is (seq (fingerprints (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :categories :name))))))
        (is (= [] (fingerprints (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :name))))))))))

(deftest field-hidden-by-column-sandbox-test
  (met/with-gtaps! (column-sandbox)
    (testing "positive control: a column the sandbox exposes is returned, without its fingerprint"
      (is (=? {:id (mt/id :venues :name)} (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :name)))))
      (is (= [] (fingerprints (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :name)))))))
    (testing "a column the sandbox hides is refused"
      (mt/user-http-request :rasta :get 403 (str "field/" (mt/id :venues :price)))
      (mt/user-http-request :rasta :get 403 (format "field/%d/related" (mt/id :venues :price))))
    (testing "an admin still gets it"
      (is (seq (fingerprints (mt/user-http-request :crowberto :get 200 (str "field/" (mt/id :venues :price)))))))))

(defn- card-with-metadata
  "A Card over `query` (venues by default) whose `result_metadata` an admin's run computed, fingerprints included."
  ([]
   (card-with-metadata (mt/mbql-query venues)))
  ([query]
   {:dataset_query   query
    :result_metadata (mt/with-test-user :crowberto
                       (-> (mt/user-http-request :crowberto :post 202 "dataset" query)
                           :data :results_metadata :columns))}))

(deftest card-metadata-omits-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (mt/with-temp [:model/Collection    collection {}
                   :model/Card          card       (assoc (card-with-metadata) :collection_id (u/the-id collection))
                   :model/Card          model      (assoc (card-with-metadata) :collection_id (u/the-id collection)
                                                          :type :model)
                   :model/Dashboard     dashboard  {:collection_id (u/the-id collection)}
                   :model/DashboardCard _          {:dashboard_id (u/the-id dashboard) :card_id (u/the-id card)}]
      (is (seq (fingerprints (:result_metadata card))) "the stored metadata carries fingerprints")
      (doseq [card-id [(u/the-id card) (u/the-id model)]]
        (check-endpoint (str "card/" card-id))
        (check-endpoint (format "card/%d/query_metadata" card-id))
        (check-endpoint (format "table/card__%d/query_metadata" card-id)))
      (check-endpoint "card" :f :database :model_id (mt/id))
      (check-endpoint (str "dashboard/" (u/the-id dashboard)))
      (check-endpoint (format "dashboard/%d/query_metadata" (u/the-id dashboard)))
      (check-endpoint "search" :q (:name card) :include_metadata true :search_engine "in-place")
      (check-endpoint (format "database/%d/metadata" lib.schema.id/saved-questions-virtual-database-id)))))

(deftest card-metadata-judged-by-the-tables-it-reads-test
  (testing "On a Card's own endpoints, an MBQL Card loses its fingerprints only when it reads a row-restricted table; a
            native one whenever its database has one"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {:cat 50}}
      (perms.tu/with-perms-for-group-and-tables! &group {(mt/id :categories) {:perms/view-data      :unrestricted
                                                                              :perms/create-queries :query-builder}
                                                         (mt/id :checkins)   {:perms/view-data      :unrestricted
                                                                              :perms/create-queries :query-builder}}
        (mt/with-temp [:model/Card categories   (card-with-metadata (mt/mbql-query categories))
                       :model/Card checkins     (card-with-metadata (mt/mbql-query checkins))
                       :model/Card implicit     (card-with-metadata (mt/mbql-query checkins
                                                                      {:aggregation [[:count]]
                                                                       :breakout    [$venue_id->venues.price]}))
                       :model/Card joined       (card-with-metadata (mt/mbql-query checkins
                                                                      {:joins  [{:source-table $$venues
                                                                                 :alias        "v"
                                                                                 :condition    [:= $venue_id &v.venues.id]
                                                                                 :fields       :all}]
                                                                       :limit 10}))
                       :model/Card venues       (card-with-metadata (mt/mbql-query venues))
                       :model/Card on-venues    (card-with-metadata (mt/mbql-query nil {:source-table (str "card__" (u/the-id venues))}))
                       :model/Card native       (card-with-metadata (mt/native-query {:query "SELECT * FROM CATEGORIES"}))
                       :model/Card on-native    (card-with-metadata (mt/mbql-query nil {:source-table (str "card__" (u/the-id native))}))
                       :model/Card on-categories (card-with-metadata (mt/mbql-query nil {:source-table (str "card__" (u/the-id categories))}))
                       :model/Card on-on-venues (card-with-metadata (mt/mbql-query nil {:source-table (str "card__" (u/the-id on-venues))}))]
          (let [fps               (fn [user card] (fingerprints (mt/user-http-request user :get 200 (str "card/" (u/the-id card)))))
                ;; `card`'s virtual table, from `table/card__N/query_metadata` and from the query_metadata of `on-card`,
                ;; a Card over it; the other tables they return are judged as tables
                virtual-table-fps (fn [card on-card]
                                    (let [table-id (str "card__" (u/the-id card))]
                                      [(fingerprints (mt/user-http-request :rasta :get 200 (format "table/%s/query_metadata" table-id)))
                                       (->> (mt/user-http-request :rasta :get 200 (format "card/%d/query_metadata" (u/the-id on-card)))
                                            :tables
                                            (filter (comp #{table-id} :id))
                                            fingerprints)]))]
            (doseq [card [categories checkins implicit joined venues on-venues native on-native]]
              (is (seq (fps :crowberto card)) "positive control"))
            (testing "keeps them when it reads only open tables"
              (is (seq (fps :rasta categories)))
              (is (seq (fps :rasta checkins)))
              (is (every? seq (virtual-table-fps categories on-categories))))
            (testing "removes them from its virtual table when it reads a sandboxed table"
              (is (= [[] []] (virtual-table-fps on-venues on-on-venues))))
            (testing "removes them when it reads a sandboxed table"
              (doseq [[label card] {"implicit join" implicit, "explicit join" joined, "source table" venues
                                    "source card" on-venues}]
                (testing label
                  (is (= [] (fps :rasta card))))))
            (testing "removes them when a native query is involved"
              (is (= [] (fps :rasta native)))
              (is (= [] (fps :rasta on-native))))
            (testing "list endpoints, which do not use them, judge by the database without preprocessing each Card"
              (let [preprocessed (atom 0)
                    preprocess   (mt/original-fn #'qp.preprocess/preprocess)]
                (mt/with-dynamic-fn-redefs [qp.preprocess/preprocess (fn [query]
                                                                       (swap! preprocessed inc)
                                                                       (preprocess query))]
                  (let [by-id (into {} (map (juxt :id identity))
                                    (mt/user-http-request :rasta :get 200 "card" :f :database :model_id (mt/id)))]
                    (is (= [] (fingerprints (by-id (u/the-id categories)))))
                    (is (= [] (fingerprints (by-id (u/the-id implicit)))))
                    (is (zero? @preprocessed))))))))))))

(deftest related-endpoints-omit-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (mt/with-temp [:model/Card      metric  (assoc (card-with-metadata (mt/mbql-query venues {:aggregation [[:count]]}))
                                                   :type :metric :table_id (mt/id :venues))
                   :model/Segment   segment {:table_id   (mt/id :venues)
                                             :definition (:query (mt/mbql-query venues {:filter [:> $price 1]}))}
                   :model/Card      card    (card-with-metadata)
                   :model/Dashboard dash    {}
                   :model/DashboardCard _   {:dashboard_id (u/the-id dash) :card_id (u/the-id card)}]
      (is (seq (fingerprints (:result_metadata metric))) "the stored metadata carries fingerprints")
      (check-endpoint (format "table/%d/related" (mt/id :venues)))
      (check-endpoint (format "segment/%d/related" (u/the-id segment)))
      (check-endpoint (format "field/%d/related" (mt/id :venues :price))))))

(deftest card-series-omits-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (let [query (mt/native-query {:query "SELECT PRICE, COUNT(*) AS C FROM VENUES GROUP BY PRICE"})]
      (mt/with-temp [:model/Card card   (assoc (card-with-metadata query) :display :line)
                     :model/Card _other (assoc (card-with-metadata query) :display :line)]
        (check-endpoint (format "card/%d/series" (u/the-id card)))))))

(deftest virtual-database-metrics-omit-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (mt/with-temp [:model/Collection coll   {}
                   :model/Card       model  (assoc (card-with-metadata) :collection_id (u/the-id coll) :type :model)
                   :model/Card       _      (assoc (card-with-metadata (mt/mbql-query nil {:source-table (str "card__" (u/the-id model))
                                                                                           :aggregation  [[:count]]}))
                                                   :collection_id (u/the-id coll) :type :metric)]
      (check-endpoint (format "database/%d/datasets/%s" lib.schema.id/saved-questions-virtual-database-id (:name coll))))))

(deftest pk-fields-omit-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    ;; sync does not fingerprint the test data's PKs, so give one a fingerprint for the positive control
    (mt/with-temp-vals-in-db :model/Field (mt/id :venues :id) {:fingerprint {:global {:distinct-count 100}
                                                                             :type   {:type/Number {:min 1.0 :max 100.0}}}}
      (check-endpoint (format "database/%d/idfields" (mt/id))))))

(deftest data-model-editor-sees-columns-a-column-sandbox-hides-test
  (testing "A column sandbox limits what its user can query, not the columns a data model editor may edit"
    (met/with-gtaps! (column-sandbox)
      (perms.tu/with-perms-for-group-and-tables! &group {(mt/id :venues) {:perms/manage-table-metadata :yes}}
        (is (=? {:id (mt/id :venues :price)}
                (mt/user-http-request :rasta :get 200 (str "field/" (mt/id :venues :price))
                                      :include_editable_data_model true)))
        (testing "without the data model flag the column stays hidden"
          (mt/user-http-request :rasta :get 403 (str "field/" (mt/id :venues :price))))))))

(deftest saving-a-card-keeps-its-stored-fingerprints-test
  (testing "A row-restricted user gets a Card without fingerprints; sending it back unchanged must not erase them"
    (met/with-gtaps! (row-sandbox)
      (mt/with-temp [:model/Collection coll {}
                     :model/Card       card (assoc (card-with-metadata) :collection_id (u/the-id coll) :type :model)]
        ;; a new Collection inherits All Users' write access to the root Collection
        (let [served (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card)))]
          (is (= [] (fingerprints served)) "precondition: the user was served no fingerprints")
          (mt/user-http-request :rasta :put 200 (str "card/" (u/the-id card))
                                (-> (select-keys served [:dataset_query :result_metadata :display])
                                    (assoc :description "edited")))
          (is (= "edited" (t2/select-one-fn :description :model/Card (u/the-id card))))
          (is (= (fingerprints (:result_metadata card))
                 (fingerprints (t2/select-one-fn :result_metadata :model/Card (u/the-id card))))))))))

(deftest reading-a-card-runs-no-sandbox-query-test
  (testing "Telling whether a Card is row-restricted does not run a native sandbox's query or save its metadata"
    (met/with-gtaps! {:gtaps {:venues {:query (mt/native-query {:query "SELECT * FROM VENUES WHERE CATEGORY_ID = 50"})}}}
      (let [sandbox-card-id (t2/select-one-fn :card_id :model/Sandbox :table_id (mt/id :venues) :group_id (u/the-id &group))]
        (t2/update! :model/Card sandbox-card-id {:result_metadata nil})
        (mt/with-temp [:model/Card card (card-with-metadata)]
          (is (= [] (fingerprints (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card))))))
          (is (nil? (t2/select-one-fn :result_metadata :model/Card sandbox-card-id))))))))

(deftest recents-omit-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (mt/with-temp [:model/Card card (assoc (card-with-metadata) :type :model)]
      (doseq [user [:crowberto :rasta]]
        (activity-feed/update-users-recent-views! (mt/user->id user) :model/Card (u/the-id card) :view))
      (check-endpoint "activity/recents" :context "views" :include_metadata true))))

(deftest dependency-graph-omits-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (mt/with-premium-features #{:dependencies :sandboxes}
      (mt/with-temp [:model/Card card (card-with-metadata)]
        (check-endpoint "ee/dependencies/graph" :id (u/the-id card) :type "card")
        (check-endpoint "ee/dependencies/graph" :id (mt/id :venues) :type "table")))))

(deftest dashboard-query-metadata-judges-cards-by-database-test
  (testing "A dashboard's query_metadata is a list of Cards, so a Card over open tables loses its fingerprints in a
            database with a sandboxed table, as in the other lists"
    (met/with-gtaps! {:gtaps      {:venues {:remappings {:cat [:variable [:field (mt/id :venues :category_id) nil]]}}}
                      :attributes {:cat 50}}
      (perms.tu/with-perms-for-group-and-tables! &group {(mt/id :categories) {:perms/view-data      :unrestricted
                                                                              :perms/create-queries :query-builder}}
        (mt/with-temp [:model/Card          categories (card-with-metadata (mt/mbql-query categories))
                       :model/Card          on-cats    (card-with-metadata (mt/mbql-query nil {:source-table (str "card__" (u/the-id categories))}))
                       :model/Dashboard     dash       {}
                       :model/DashboardCard _          {:dashboard_id (u/the-id dash) :card_id (u/the-id on-cats)}]
          (let [virtual-table-fps (fn [url]
                                    (->> (mt/user-http-request :rasta :get 200 url)
                                         :tables
                                         (filter (comp #{(str "card__" (u/the-id categories))} :id))
                                         fingerprints))]
            (is (seq (virtual-table-fps (format "card/%d/query_metadata" (u/the-id on-cats))))
                "positive control: the Card's own query_metadata judges it by its tables")
            (is (= [] (virtual-table-fps (format "dashboard/%d/query_metadata" (u/the-id dash)))))))))))

(deftest stored-card-metadata-keeps-fingerprints-test
  (testing "Reading a Card as a sandboxed user leaves the fingerprints stored on it alone"
    (met/with-gtaps! (row-sandbox)
      (mt/with-temp [:model/Card card (card-with-metadata)]
        (mt/user-http-request :rasta :get 200 (str "card/" (u/the-id card)))
        (is (seq (fingerprints (t2/select-one-fn :result_metadata :model/Card (u/the-id card)))))))))

(deftest binned-query-omits-whole-table-range-test
  (testing "binning_info of a sandboxed user's binned column carries no bounds taken from the whole table"
    (met/with-gtaps! (row-sandbox)
      (let [query  (mt/mbql-query venues {:aggregation [[:count]]
                                          :breakout    [[:field %latitude {:binning {:strategy :num-bins
                                                                                     :num-bins 10}}]]})
            bounds (fn [user]
                     (-> (mt/user-http-request user :post 202 "dataset" query)
                         :data :cols first :binning_info
                         (select-keys [:min_value :max_value])))]
        (is (seq (bounds :crowberto)) "positive control")
        (is (= {} (bounds :rasta)))))))

(deftest pivot-results-metadata-omits-fingerprints-test
  (testing "POST /api/dataset/pivot results_metadata matches POST /api/dataset: no fingerprint for a sandboxed user"
    (met/with-gtaps! (row-sandbox)
      (let [query (merge (mt/mbql-query venues {:aggregation [[:count]]
                                                :breakout    [$price $category_id]})
                         {:pivot_rows [0] :pivot_cols [1]})
            fps   (fn [user]
                    (fingerprints (-> (mt/user-http-request user :post 202 "dataset/pivot" query)
                                      :data :results_metadata)))]
        (is (seq (fps :crowberto)) "positive control")
        (is (= [] (fps :rasta)))))))

(deftest field-summary-counts-only-visible-rows-test
  (met/with-gtaps! (row-sandbox)
    (let [field-count (fn [user]
                        (-> (mt/user-http-request user :get 200 (format "field/%d/summary" (mt/id :venues :price)))
                            first second))]
      (is (= 100 (field-count :crowberto)) "positive control")
      (is (= 10 (field-count :rasta))))))

(deftest xray-omits-fingerprints-test
  (met/with-gtaps! (row-sandbox)
    (testing "an X-ray of a Field of a sandboxed table carries no fingerprint"
      (is (= [] (fingerprints (mt/user-http-request :rasta :get 200
                                                    (str "automagic-dashboards/field/" (mt/id :venues :price)))))))))
