(ns metabase.mcp.derive-test
  "The iframe changes what it shows only by asking the server to derive a new handle from a stored one, so every query
  it runs is one the server built."
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.mcp.callback-api :as mcp.callback-api]
   [metabase.mcp.session :as mcp.session]
   [metabase.mcp.ui-test-util :as ui.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))

(defn- checkins-by-month
  "Count of checkins broken out by month of DATE."
  []
  (let [mp    (mt/metadata-provider)
        query (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :checkins))) (lib/count))
        date  (some #(when (= "DATE" (:name %)) %) (lib/breakoutable-columns query))]
    (lib/breakout query (lib/with-temporal-bucket date :month))))

(defn- venues []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn- derive!
  "Store `query` under a handle owned by `username`, POST `body` to its derive route with a credential holding
  `scopes`, and return the full response."
  ([query body]
   (derive! :rasta ui.tu/query-scopes query body))
  ([username scopes query body]
   (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! username scopes)
         handle (ui.tu/store-query-handle! session-id user-id query)]
     (ui.tu/ui-request! auth :post nil (str "embed-mcp/queries/" handle "/derive") body))))

(defn- stored-query
  "The query stored under `handle` for `username`, as a lib query."
  [username handle]
  (let [{:keys [encoded_query]} (mcp.session/resolve-query-handle nil (mt/user->id username) handle)]
    (lib/query (mt/metadata-provider) (ui.tu/decode-query encoded_query))))

(defn- derived-query!
  "Derive from `query` with `operations` as rasta, assert a new handle owned by rasta came back, and return the query
  stored under it."
  [query operations]
  (let [{:keys [status body]} (derive! query {:operations operations})]
    (is (= 200 status))
    (is (parse-uuid (str (:handle body))))
    (is (= (ui.tu/decode-query (:query body))
           (ui.tu/decode-query (:encoded_query (mcp.session/resolve-query-handle
                                                nil (mt/user->id :rasta) (:handle body)))))
        "the response carries exactly the query stored under the new handle")
    (stored-query :rasta (:handle body))))

(defn- breakout-unit [query]
  (:unit (lib/temporal-bucket (first (lib/breakouts query)))))

(deftest temporal-bucket-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (testing "a temporal-bucket operation rebuckets the temporal breakout"
      (is (= :year (breakout-unit (derived-query! (checkins-by-month)
                                                  [{:type "temporal-bucket/set" :unit "year"}])))))
    (testing "a nil unit removes the bucket, the granularity control's \"All time\""
      (is (nil? (breakout-unit (derived-query! (checkins-by-month)
                                               [{:type "temporal-bucket/set" :unit nil}])))))
    (testing "a unit the breakout cannot take is a 400"
      (is (= 400 (:status (derive! (checkins-by-month) {:operations [{:type "temporal-bucket/set"
                                                                      :unit "hour"}]})))))
    (testing "a query with no temporal breakout is a 400"
      (is (= 400 (:status (derive! (venues) {:operations [{:type "temporal-bucket/set" :unit "year"}]})))))))

(deftest date-filter-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [relative {:type "date-filter/set" :value {:type "relative" :unit "day" :value -30}}
          specific {:type  "date-filter/set"
                    :value {:type "specific" :operator "between" :values ["2014-01-01" "2014-06-30"]
                            :hasTime false}}
          exclude  {:type  "date-filter/set"
                    :value {:type "exclude" :operator "!=" :unit "day-of-week" :values [1 7]}}]
      (testing "set adds a date filter on the temporal breakout's column"
        (let [query   (derived-query! (checkins-by-month) [relative])
              filters (lib/filters query)]
          (is (=? [[:time-interval {} [:field {} (mt/id :checkins :date)] -30 :day]] filters))
          (testing "and set again replaces it rather than adding a second one"
            (is (=? [[:between {} [:field {} (mt/id :checkins :date)] "2014-01-01" "2014-06-30"]]
                    (lib/filters (derived-query! query [specific])))))
          (testing "clear removes it"
            (is (empty? (lib/filters (derived-query! query [{:type "date-filter/clear"}])))))))
      (testing "an exclude filter"
        (is (=? [[:not-in {} [:get-day-of-week {} [:field {} (mt/id :checkins :date)] :iso] 1 7]]
                (lib/filters (derived-query! (checkins-by-month) [exclude])))))
      (testing "operations apply in order"
        (let [query (derived-query! (checkins-by-month) [relative {:type "temporal-bucket/set" :unit "week"}])]
          (is (= 1 (count (lib/filters query))))
          (is (= :week (breakout-unit query))))))))

(deftest drill-thru-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (let [point {:column "count" :value 8 :dimensions [{:column "DATE" :value "2013-01-01T00:00:00Z"}]}]
      (testing "a stay drill: zoom-in.timeseries narrows to the clicked month and buckets by week"
        (let [query (derived-query! (checkins-by-month) [{:type "drill-thru" :drill "zoom-in.timeseries"
                                                          :context point}])]
          (is (=? [[:= {} [:field {:temporal-unit :month} (mt/id :checkins :date)] "2013-01-01T00:00:00Z"]]
                  (lib/filters query)))
          (is (= :week (breakout-unit query)))))
      (testing "sort takes its direction"
        (is (=? [[:desc {} [:field {} (mt/id :venues :price)]]]
                (lib/order-bys (derived-query! (venues) [{:type      "drill-thru" :drill "sort"
                                                          :context   {:column "PRICE"}
                                                          :direction "desc"}])))))
      (testing "quick-filter takes one of the drill's operators"
        (is (=? [[:< {} [:field {} "count"] 8]]
                (lib/filters (derived-query! (checkins-by-month) [{:type     "drill-thru" :drill "quick-filter"
                                                                   :context  point
                                                                   :operator "<"}]) -1))))
      (testing "summarize-column takes its aggregation"
        (is (=? [[:sum {} [:field {} (mt/id :venues :price)]]]
                (lib/aggregations (derived-query! (venues) [{:type        "drill-thru" :drill "summarize-column"
                                                             :context     {:column "PRICE"}
                                                             :aggregation "sum"}])))))
      (testing "underlying-records drops the aggregation and filters to the clicked month"
        (let [query (derived-query! (checkins-by-month) [{:type "drill-thru" :drill "underlying-records"
                                                          :context point}])]
          (is (empty? (lib/aggregations query)))
          (is (= 1 (count (lib/filters query))))))
      (testing "a drill the click does not offer is a 400"
        (is (= 400 (:status (derive! (venues) {:operations [{:type    "drill-thru" :drill "zoom-in.timeseries"
                                                             :context {:column "PRICE"}}]})))))
      (testing "an operator the quick-filter drill does not offer is a 400"
        (is (= 400 (:status (derive! (checkins-by-month) {:operations [{:type     "drill-thru"
                                                                        :drill    "quick-filter"
                                                                        :context  point
                                                                        :operator "contains"}]})))))
      (testing "a column the query does not return is a 400"
        (is (= 400 (:status (derive! (venues) {:operations [{:type      "drill-thru" :drill "sort"
                                                             :context   {:column "NOT_A_COLUMN"}
                                                             :direction "asc"}]}))))))))

(deftest closed-schema-test
  (testing "the body names a closed set of operations, so anything else is a 400 before any query is touched"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (doseq [[label body] {"an unknown operation"         {:operations [{:type "query/replace"}]}
                            "an extra key on an operation" {:operations [{:type "date-filter/clear"
                                                                          :query {:database 1}}]}
                            "an extra key on the body"     {:operations [{:type "date-filter/clear"}]
                                                            :query      {:database 1}}
                            "a drill outside the set"      {:operations [{:type    "drill-thru"
                                                                          :drill   "column-filter"
                                                                          :context {:column "PRICE"}}]}
                            "a sort without a direction"   {:operations [{:type    "drill-thru" :drill "sort"
                                                                          :context {:column "PRICE"}}]}
                            "no operations"                {:operations []}}]
        (testing label
          (is (= 400 (:status (derive! (venues) body)))))))))

(deftest native-handles-cannot-be-derived-test
  (testing "date and bucket operations apply only to MBQL, so a native handle is a 400"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [native (lib/native-query (mt/metadata-provider) "SELECT * FROM CHECKINS")]
        (doseq [operation [{:type "temporal-bucket/set" :unit "year"}
                           {:type "date-filter/clear"}
                           {:type "date-filter/set" :value {:type "relative" :unit "day" :value -30}}]]
          (testing (:type operation)
            (let [response (derive! :rasta #{"agent:query:run" "agent:sql:run"} native {:operations [operation]})]
              (is (= 400 (:status response)))
              (is (re-find #"(?i)native" (str (:body response)))))))))))

(deftest derive-gates-test
  (mt/with-model-cleanup [:model/McpQueryHandle]
    (testing "Gate 1: derive costs agent:query:run"
      (is (= 403 (:status (derive! :rasta #{"agent:search"} (checkins-by-month)
                                   {:operations [{:type "temporal-bucket/set" :unit "year"}]})))))
    (testing "a handle another user stored does not resolve"
      (let [owner-id (mt/user->id :crowberto)
            handle   (ui.tu/store-query-handle! (mcp.session/create! owner-id) owner-id (checkins-by-month))]
        (is (= 404 (:status (ui.tu/ui-request! (ui.tu/ui-auth! :rasta) :post nil
                                               (str "embed-mcp/queries/" handle "/derive")
                                               {:operations [{:type "temporal-bucket/set" :unit "year"}]}))))))
    (testing "Gate 2: a derived handle runs only when its user may query the table"
      (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :rasta)
            handle  (ui.tu/store-query-handle! session-id user-id (checkins-by-month))
            derived (-> (ui.tu/ui-request! auth :post 200 (str "embed-mcp/queries/" handle "/derive")
                                           {:operations [{:type "temporal-bucket/set" :unit "year"}]})
                        (get-in [:body :handle]))
            run!    #(ui.tu/ui-request! auth :post nil (str "embed-mcp/queries/" derived "/run") {})]
        (mt/with-no-data-perms-for-all-users!
          (is (= 403 (:status (run!)))))
        (testing "control: with permission the derived handle runs"
          (mt/with-full-data-perms-for-all-users!
            (let [response (run!)]
              (is (= 202 (:status response)))
              (is (seq (get-in response [:body :data :rows]))))))))))

(deftest group-policy-gates-every-derived-handle-test
  (testing "derive and the drills route both consult the group-policy check before they store a new handle"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-dynamic-fn-redefs [mcp.callback-api/group-policy-permits-derive? (constantly false)]
        (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :rasta)
              handle (ui.tu/store-query-handle! session-id user-id (checkins-by-month))]
          (is (= 403 (:status (ui.tu/ui-request! auth :post nil (str "embed-mcp/queries/" handle "/derive")
                                                 {:operations [{:type "temporal-bucket/set" :unit "year"}]}))))
          (is (= 403 (:status (ui.tu/ui-request! auth :post nil "embed-mcp/drills"
                                                 {:handle    handle
                                                  :operation {:type    "drill-thru" :drill "underlying-records"
                                                              :context {:column     "count" :value 8
                                                                        :dimensions [{:column "DATE"
                                                                                      :value  "2013-01-01T00:00:00Z"}]}}}))))
          (is (= 1 (count (t2/select :model/McpQueryHandle :mcp_session_id session-id)))
              "only the base handle was stored"))))))

(deftest drills-route-derives-on-the-server-test
  (testing "The drills route takes a handle and a drill, not a query, and stores the drilled query the server built"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :rasta)
            handle (ui.tu/store-query-handle! session-id user-id (checkins-by-month))
            drill  {:type    "drill-thru" :drill "underlying-records"
                    :context {:column "count" :value 8 :dimensions [{:column "DATE" :value "2013-01-01T00:00:00Z"}]}}
            {:keys [status body]} (ui.tu/ui-request! auth :post nil "embed-mcp/drills"
                                                     {:handle handle :operation drill})]
        (is (= 200 status))
        (is (empty? (lib/aggregations (stored-query :rasta (:handle body)))))
        (testing "a client-encoded query is no longer accepted"
          (is (= 400 (:status (ui.tu/ui-request! auth :post nil "embed-mcp/drills"
                                                 {:encodedQuery "ZW5jb2RlZA=="})))))
        (testing "only a drill can go to the agent this way"
          (is (= 400 (:status (ui.tu/ui-request! auth :post nil "embed-mcp/drills"
                                                 {:handle    handle
                                                  :operation {:type "temporal-bucket/set" :unit "year"}})))))))))
