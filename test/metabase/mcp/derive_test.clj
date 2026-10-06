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

(defn- result-column-names
  "The `:name`s the QP returns for `query`'s columns: what the iframe sends back as a click's column."
  [query]
  (mapv :name (mt/with-test-user :rasta (mt/cols (mt/process-query query)))))

(defn- orders-count-by-product-category []
  (let [mp       (mt/metadata-provider)
        query    (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))
        category (some #(when (= "CATEGORY" (:name %)) %) (lib/breakoutable-columns query))]
    (lib/breakout query category)))

(deftest drill-on-implicitly-joined-column-test
  (testing "a click names a column by its result-column name, which differs from its alias for an implicit join"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [query (orders-count-by-product-category)]
        (is (= ["CATEGORY" "count"] (result-column-names query))
            "the iframe sends this name back as the click's column")
        (testing "sort on the joined column"
          (is (=? {:status 200 :body {:handle string?}}
                  (derive! query {:operations [{:type      "drill-thru" :drill "sort"
                                                :context   {:column "CATEGORY"}
                                                :direction "desc"}]}))))
        (testing "a quick filter whose dimension is the joined column"
          (is (=? [[:< {} [:field {} "count"] 10]]
                  (lib/filters (derived-query! query
                                               [{:type       "drill-thru" :drill "quick-filter" :operator "<"
                                                 :context    {:column     "count" :value 10
                                                              :dimensions [{:column "CATEGORY" :value "Gizmo"}]}}])
                               -1))))
        (testing "underlying records on a point whose dimension is the joined column"
          (let [derived (derived-query! query [{:type    "drill-thru" :drill "underlying-records"
                                                :context {:column     "count" :value 10
                                                          :dimensions [{:column "CATEGORY" :value "Gizmo"}]}}])]
            (is (empty? (lib/aggregations derived)))
            (is (=? [[:= {} [:field {:source-field (mt/id :orders :product_id)} (mt/id :products :category)]
                      "Gizmo"]]
                    (lib/filters derived)))))))))

(deftest drill-on-two-joined-columns-with-the-same-name-test
  (testing "two joined columns with the same name come back under distinct result names, and each resolves"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [mp       (mt/metadata-provider)
            base     (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))
            by-name  (fn [query table-id]
                       (some #(when (and (= "CREATED_AT" (:name %)) (= table-id (:table-id %))) %)
                             (lib/breakoutable-columns query)))
            query    (-> base
                         (lib/breakout (lib/with-temporal-bucket (by-name base (mt/id :products)) :year))
                         (as-> q (lib/breakout q (lib/with-temporal-bucket (by-name q (mt/id :people)) :year))))
            names    (result-column-names query)]
        (is (= 3 (count (set names))) "the QP deduplicates the two CREATED_AT names")
        (doseq [column-name (butlast names)]
          (testing column-name
            (is (=? {:status 200}
                    (derive! query {:operations [{:type      "drill-thru" :drill "sort"
                                                  :context   {:column column-name}
                                                  :direction "asc"}]})))))))))

(deftest drill-on-explicitly-joined-column-test
  (testing "a click on a column of an explicit join resolves by its result-column name"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [mp       (mt/metadata-provider)
            products (lib.metadata/table mp (mt/id :products))
            base     (lib/query mp (lib.metadata/table mp (mt/id :orders)))
            query    (-> base
                         (lib/join (lib/join-clause products
                                                    [(lib/= (lib.metadata/field mp (mt/id :orders :product_id))
                                                            (lib.metadata/field mp (mt/id :products :id)))]))
                         (lib/limit 1))
            joined   (last (result-column-names query))]
        (is (not= joined (:lib/desired-column-alias (last (lib/returned-columns query))))
            "the result name differs from the alias, or this proves nothing")
        (is (=? {:status 200}
                (derive! query {:operations [{:type      "drill-thru" :drill "sort"
                                              :context   {:column joined}
                                              :direction "asc"}]})))))))

(deftest drill-on-row-with-remapped-column-test
  (testing "a clicked row carries the display column an FK remapping adds, which the query itself does not return"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-column-remappings [venues.category_id categories.name]
        (let [query  (lib/limit (venues) 1)
              result (mt/with-test-user :rasta (mt/process-query query))
              row    (map (fn [col v] {:column (:name col) :value v}) (mt/cols result) (first (mt/rows result)))
              op     (fn [context] {:operations [{:type    "drill-thru" :drill "quick-filter" :operator "<"
                                                  :context context}]})]
          (is (some #{"NAME_2"} (map :column row)) "the iframe sends the remapped column as a row cell")
          (is (=? {:status 200}
                  (derive! query (op {:column "PRICE" :value 3 :row row}))))
          (testing "a clicked column or a dimension the query does not return is still refused"
            (is (= 400 (:status (derive! query (op {:column "NAME_2" :value "x" :row row})))))
            (is (= 400 (:status (derive! query (op {:column     "PRICE" :value 3 :row row
                                                    :dimensions [{:column "NAME_2" :value "x"}]})))))))))))

(deftest drill-on-row-with-a-null-cell-test
  (testing "a clicked row that holds a SQL NULL in another cell still drills"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [mp    (mt/metadata-provider)
            query (lib/limit (lib/query mp (lib.metadata/table mp (mt/id :orders))) 1)
            row   [{:column "ID" :value 1} {:column "QUANTITY" :value 2} {:column "DISCOUNT" :value nil}]]
        (is (=? {:status 200}
                (derive! query {:operations [{:type    "drill-thru" :drill "quick-filter" :operator "<"
                                              :context {:column "QUANTITY" :value 2 :row row}}]})))))))

(deftest drill-on-point-with-a-null-dimension-test
  (testing "a chart point whose breakout value is NULL still drills"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [mp    (mt/metadata-provider)
            base  (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count))
            query (lib/breakout base (some #(when (= "DISCOUNT" (:name %)) %) (lib/breakoutable-columns base)))]
        (is (=? {:status 200}
                (derive! query {:operations [{:type    "drill-thru" :drill "underlying-records"
                                              :context {:column     "count" :value 10
                                                        :dimensions [{:column "DISCOUNT" :value nil}]}}]})))))))

(def ^:private point-in-january
  {:type    "drill-thru" :drill "underlying-records"
   :context {:column "count" :value 8 :dimensions [{:column "DATE" :value "2013-01-01T00:00:00Z"}]}})

(deftest drill-with-a-context-lib-rejects-test
  (testing "Lib refusing a click as invalid input is a 400 with a short plain-text body, not a 500"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-dynamic-fn-redefs [lib/available-drill-thrus
                                  (fn [& _] (throw (ex-info "Invalid input: {:value [\"should be nil\"]}"
                                                            {:type :metabase.util.malli.fn/invalid-input})))]
        (let [response (derive! (checkins-by-month) {:operations [point-in-january]})]
          (is (= 400 (:status response)))
          (is (re-find #"(?i)^text/plain" (str (get-in response [:headers "Content-Type"]))))
          (is (= "This change does not apply to this query." (:body response))))))))

(deftest derive-bug-is-a-500-test
  (testing "an exception that is not Lib refusing the input is a server bug: a 500, not a 400 that hides it"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (mt/with-dynamic-fn-redefs [lib/available-drill-thrus (fn [& _] (throw (NullPointerException. "boom")))]
        (is (= 500 (:status (derive! (checkins-by-month) {:operations [point-in-january]}))))))))

(deftest exclude-date-filter-needs-a-unit-test
  (testing "an exclude filter on values names the unit they are in, or it is refused"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (is (= 400 (:status (derive! (checkins-by-month)
                                   {:operations [{:type  "date-filter/set"
                                                  :value {:type "exclude" :operator "!=" :values [1]}}]})))))))

(defn- orders-count-binned-by
  "Count of orders broken out by each of `column-names`, binned."
  [& column-names]
  (let [mp  (mt/metadata-provider)
        bin (fn [q column-name]
              (let [col (some #(when (= column-name (:name %)) %) (lib/breakoutable-columns q))]
                (lib/breakout q (lib/with-binning col (first (lib/available-binning-strategies q col))))))]
    (reduce bin (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :orders))) (lib/count)) column-names)))

(def ^:private two-bin-point
  {:column "count" :value 5 :dimensions [{:column "SUBTOTAL" :value 20.0} {:column "TOTAL" :value 40.0}]})

(defn- zoom-filters!
  "The filters of the query derived from `query` by a zoom-in.binning drill with `extra` keys and `context`."
  [query context extra]
  (let [{:keys [status body]} (derive! query {:operations [(merge {:type "drill-thru" :drill "zoom-in.binning"
                                                                   :context context}
                                                                  extra)]})]
    (is (= 200 status))
    (some->> (:handle body) (stored-query :rasta) lib/filters)))

(deftest zoom-in-binning-zooms-the-dimension-clicked-test
  (testing "a point with two binned dimensions offers one zoom per dimension; the operation names which one to apply"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [query (orders-count-binned-by "SUBTOTAL" "TOTAL")]
        (is (=? [[:>= {} [:field {} (mt/id :orders :total)] 40.0] [:< {} [:field {} (mt/id :orders :total)] number?]]
                (zoom-filters! query two-bin-point {:dimension "TOTAL"})))
        (is (=? [[:>= {} [:field {} (mt/id :orders :subtotal)] 20.0]
                 [:< {} [:field {} (mt/id :orders :subtotal)] number?]]
                (zoom-filters! query two-bin-point {:dimension "SUBTOTAL"})))
        (testing "without a dimension the click is ambiguous, so it is refused rather than guessed"
          (is (= 400 (:status (derive! query {:operations [{:type    "drill-thru" :drill "zoom-in.binning"
                                                            :context two-bin-point}]})))))
        (testing "a dimension the click does not offer is refused"
          (is (= 400 (:status (derive! query {:operations [{:type      "drill-thru" :drill "zoom-in.binning"
                                                            :dimension "TAX"
                                                            :context   two-bin-point}]})))))))
    (testing "a click with a single binned dimension needs no dimension"
      (mt/with-model-cleanup [:model/McpQueryHandle]
        (is (=? [[:>= {} [:field {} (mt/id :orders :total)] 40.0] [:< {} [:field {} (mt/id :orders :total)] number?]]
                (zoom-filters! (orders-count-binned-by "TOTAL")
                               {:column "count" :value 5 :dimensions [{:column "TOTAL" :value 40.0}]}
                               {})))))))

(deftest zoom-in-geographic-zooms-the-dimension-clicked-test
  (testing "a point with a state and a city dimension offers one geographic zoom per dimension"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [mp    (mt/metadata-provider)
            base  (lib/aggregate (lib/query mp (lib.metadata/table mp (mt/id :people))) (lib/count))
            by    (fn [q n] (lib/breakout q (some #(when (= n (:name %)) %) (lib/breakoutable-columns q))))
            query (-> base (by "STATE") (by "CITY"))
            point {:column "count" :value 3 :dimensions [{:column "STATE" :value "TX"} {:column "CITY" :value "Austin"}]}
            zoom  (fn [dimension]
                    (let [{:keys [status body]} (derive! query {:operations [{:type      "drill-thru"
                                                                              :drill     "zoom-in.geographic"
                                                                              :dimension dimension
                                                                              :context   point}]})]
                      (is (= 200 status))
                      (some->> (:handle body) (stored-query :rasta) lib/filters)))]
        (is (=? [[:= {} [:field {} (mt/id :people :state)] "TX"]] (zoom "STATE")))
        (is (=? [[:= {} [:field {} (mt/id :people :city)] "Austin"]] (zoom "CITY")))))))

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

(deftest derive-rechecks-data-permissions-test
  (testing "Derive and drills re-check the user's permission on the stored query, and refuse with a 403 before
            reading any column, so whether a column exists cannot be learned without access to the data"
    (mt/with-model-cleanup [:model/McpQueryHandle]
      (let [{:keys [user-id session-id] :as auth} (ui.tu/ui-auth! :rasta)
            handle  (ui.tu/store-query-handle! session-id user-id (venues))
            sort-on (fn [column-name]
                      {:type "drill-thru" :drill "sort" :direction "asc" :context {:column column-name}})
            derive  (fn [column-name]
                      (:status (ui.tu/ui-request! auth :post nil (str "embed-mcp/queries/" handle "/derive")
                                                  {:operations [(sort-on column-name)]})))
            drill   (fn [column-name]
                      (:status (ui.tu/ui-request! auth :post nil "embed-mcp/drills"
                                                  {:handle handle :operation (sort-on column-name)})))]
        (mt/with-no-data-perms-for-all-users!
          (doseq [column-name ["PRICE" "NOT_A_COLUMN"]]
            (testing column-name
              (is (= 403 (derive column-name)))
              (is (= 403 (drill column-name))))))
        (testing "control: with permission, derive and drills work"
          (mt/with-full-data-perms-for-all-users!
            (is (= 200 (derive "PRICE")))
            (is (= 200 (drill "PRICE")))))))))

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
