(ns metabase.product-analytics.api-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(def ^:private event-settings
  {"columns.timestamp" "CREATED_AT"
   "columns.person"    "USER_ID"
   "columns.session"   "PRODUCT_ID"})

(defmacro ^:private with-event-table
  [& body]
  `(mt/with-temp-vals-in-db :model/Table (mt/id :orders) {:event_settings event-settings}
     ~@body))

(defn- input
  ([] (input {}))
  ([settings]
   {:table_id (mt/id :orders), :kind "habit", :settings settings}))

(defn- compiled
  ([] (compiled {}))
  ([settings]
   (mt/user-http-request :crowberto :post 200 "product-analytics/compile" (input settings))))

(defn- table-query
  [table-key]
  (let [metadata-provider (mt/metadata-provider)]
    (lib/query metadata-provider (lib.metadata/table metadata-provider (mt/id table-key)))))

(defn- created-card!
  [query]
  (mt/user-http-request :crowberto :post 200 "card" {:name                   "Habit"
                                                     :display                "bar"
                                                     :visualization_settings {}
                                                     :dataset_query          query}))

(defn- stored
  [card-id]
  (t2/select-one :model/Card :id card-id))

(defn- card-url
  [card-id]
  (format "card/%d" card-id))

(defn- do-with-saved-analysis!
  [query f]
  (let [card-id (:id (created-card! query))]
    (try
      (f card-id)
      (finally
        (t2/delete! :model/Card :id card-id)))))

(deftest compile-test
  (with-event-table
    (testing "it builds a query the dataset API runs"
      (let [query (compiled)]
        (is (= "person" (get-in query [:analysis :settings :grain])))
        (is (=? {:status "completed"}
                (mt/user-http-request :crowberto :post 202 "dataset" query)))))
    (testing "settings out of range are refused"
      (mt/user-http-request :crowberto :post 400 "product-analytics/compile" (input {:grain "a fortnight"})))
    (testing "people who can't read the table can't compile against it"
      (mt/with-no-data-perms-for-all-users!
        (mt/user-http-request :rasta :post 403 "product-analytics/compile" (input))))))

(deftest save-test
  (with-event-table
    (do-with-saved-analysis! (compiled) (fn [card-id]
                                          (let [{:keys [dataset_query table_id]} (stored card-id)]
                                            (testing "the card's query holds the stages and every setting"
                                              (is (= (mt/id :orders) table_id))
                                              (is (= 2 (count (:stages dataset_query))))
                                              (is (= {:timestamp "CREATED_AT", :person "USER_ID", :session "PRODUCT_ID"}
                                                     (get-in dataset_query [:analysis :columns])))
                                              (is (= "day" (get-in dataset_query [:analysis :settings :sub_period]))))
                                            (testing "it runs as any card does"
                                              (is (=? {:status "completed"}
                                                      (mt/user-http-request :crowberto :post 202 (format "card/%d/query" card-id)))))
                                            (testing "saving a new setting saves its query"
                                              (mt/user-http-request :crowberto :put 200 (card-url card-id) {:dataset_query (compiled {:sub_period "week"})})
                                              (is (= "week" (get-in (stored card-id) [:dataset_query :analysis :settings :sub_period])))))))))

(deftest save-checks-permissions-test
  (testing "saving checks the stages, as for any query"
    (with-event-table
      (let [query (compiled)]
        (mt/with-non-admin-groups-no-root-collection-perms
          (mt/with-no-data-perms-for-all-users!
            (mt/user-http-request :rasta :post 403 "card" {:name                   "Habit"
                                                           :display                "bar"
                                                           :visualization_settings {}
                                                           :dataset_query          query})))))))

(deftest roles-are-permanent-test
  (testing "changing the table's roles leaves a saved analysis alone"
    (with-event-table
      (do-with-saved-analysis! (compiled) (fn [card-id]
                                            (let [query (:dataset_query (stored card-id))]
                                              (t2/update! :model/Table :id (mt/id :orders)
                                                          {:event_settings (assoc event-settings "columns.person" "PRODUCT_ID")})
                                              (is (= query (:dataset_query (stored card-id))))
                                              (testing "and editing it keeps the columns it was made with"
                                                (let [analysis (:analysis query)
                                                      edited   (mt/user-http-request :crowberto :post 200 "product-analytics/compile"
                                                                                     (assoc (input {:sub_period "week"}) :columns (:columns analysis)))]
                                                  (is (= "USER_ID" (get-in edited [:analysis :columns :person])))))))))))

(deftest detach-test
  (with-event-table
    (do-with-saved-analysis! (compiled) (fn [card-id]
                                          (testing "renaming it leaves the analysis alone"
                                            (mt/user-http-request :crowberto :put 200 (card-url card-id) {:name "Renamed"})
                                            (is (contains? (:dataset_query (stored card-id)) :analysis)))
                                          (testing "sending the same query back leaves the analysis alone"
                                            (mt/user-http-request :crowberto :put 200 (card-url card-id)
                                                                  {:dataset_query (:dataset_query (mt/user-http-request :crowberto :get 200 (card-url card-id)))})
                                            (is (contains? (:dataset_query (stored card-id)) :analysis)))
                                          (testing "editing the stages makes it an ordinary question"
                                            (let [edited (-> (lib/query (mt/metadata-provider) (:dataset_query (stored card-id)))
                                                             (lib/limit 5)
                                                             (dissoc :lib/metadata))]
                                              (mt/user-http-request :crowberto :put 200 (card-url card-id) {:dataset_query edited})
                                              (is (not (contains? (:dataset_query (stored card-id)) :analysis)))
                                              (is (= 5 (lib/current-limit (:dataset_query (stored card-id)))))))))
    (testing "a new card whose stages aren't its analysis's is an ordinary question"
      (do-with-saved-analysis! (assoc (dissoc (table-query :orders) :lib/metadata) :analysis (:analysis (compiled))) (fn [card-id]
                                                                                                                       (is (not (contains? (:dataset_query (stored card-id)) :analysis))))))))

(deftest travels-with-the-query-test
  (with-event-table
    (do-with-saved-analysis! (compiled) (fn [card-id]
                                          (testing "a copy of an analysis is an analysis"
                                            (let [{copy-id :id} (mt/user-http-request :crowberto :post 200 (format "card/%d/copy" card-id))]
                                              (try
                                                (is (= (get-in (stored card-id) [:dataset_query :analysis])
                                                       (get-in (stored copy-id) [:dataset_query :analysis])))
                                                (finally
                                                  (t2/delete! :model/Card :id copy-id)))))
                                          (testing "reverting restores the stages and the form together"
                                            (let [before (stored card-id)]
                                              (mt/user-http-request :crowberto :put 200 (card-url card-id) {:dataset_query (compiled {:sub_period "week"})})
                                              (let [revision-id (t2/select-one-pk :model/Revision {:where    [:and [:= :model "Card"] [:= :model_id card-id]]
                                                                                                   :order-by [[:id :asc]]})]
                                                (mt/user-http-request :crowberto :post 200 "revision/revert"
                                                                      {:entity "card", :id card-id, :revision_id revision-id}))
                                              (is (= (get-in before [:dataset_query :analysis])
                                                     (get-in (stored card-id) [:dataset_query :analysis])))
                                              (is (= (:stages (:dataset_query before))
                                                     (:stages (:dataset_query (stored card-id)))))))
                                          (testing "a question built on an analysis doesn't inherit its form"
                                            (let [metadata-provider (mt/metadata-provider)
                                                  nested            (lib/query metadata-provider (lib.metadata/card metadata-provider card-id))]
                                              (is (not (contains? nested :analysis)))
                                              (is (=? {:status "completed"}
                                                      (mt/user-http-request :crowberto :post 202 "dataset" (dissoc nested :lib/metadata))))))))))

(deftest dashboard-filter-test
  (testing "a date filter on the first stage narrows the events a habit analysis reads"
    (with-event-table
      (let [query (compiled {:date_range {:type "absolute", :start "2000-01-01", :end "2030-01-01"}})
            rows  (fn [query] (mt/rows (mt/user-http-request :crowberto :post 202 "dataset" query)))
            field ["field" (mt/id :orders :created_at) nil]]
        (is (< (reduce + (map second (rows (assoc query :parameters
                                                  [{:id     "d"
                                                    :type   "date/range"
                                                    :value  "2018-01-01~2018-02-01"
                                                    :target ["dimension" field {:stage-number 0}]}]))))
               (reduce + (map second (rows query)))))))))

(deftest serialization-test
  (testing "the field ids in an analysis's filters leave as portable references, and come back"
    (with-event-table
      (let [clause [">" {:lib/uuid (str (random-uuid))}
                    ["field" {:lib/uuid (str (random-uuid))} (mt/id :orders :quantity)]
                    5]]
        (do-with-saved-analysis! (compiled {:filters [clause]}) (fn [card-id]
                                                                  (let [exported        (serdes/extract-one "Card" {} (stored card-id))
                                                                        exported-filter (first (get-in exported [:dataset_query :analysis :settings :filters]))]
                                                                    (is (= ["test-data (h2)" "PUBLIC" "ORDERS" "QUANTITY"] (last (nth exported-filter 2))))
                                                                    (testing "loading it brings the ids back"
                                                                      (serdes/load-one! exported (stored card-id))
                                                                      (is (=? [[:> {} [:field {} (mt/id :orders :quantity)] 5]]
                                                                              (get-in (stored card-id) [:dataset_query :analysis :settings :filters])))))))))))
