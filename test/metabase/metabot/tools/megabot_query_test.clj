(ns metabase.metabot.tools.megabot-query-test
  "Megabot's structured warehouse queries: `run_warehouse_query` in the numeric-id MBQL 5 dialect the always-on
  megabot-query skill teaches, and what `show_result` renders from it."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.profiles :as profiles]
   [metabase.metabot.capabilities :as capabilities]
   [metabase.metabot.megabot-context :as megabot-context]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.megabot :as megabot]
   [metabase.metabot.tools.shared :as shared]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.query-processor.core :as qp]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(defn- query
  "An MBQL 5 query in the numeric-id dialect, keyword-keyed the way tool arguments arrive."
  [& stages]
  {:lib/type "mbql/query"
   :stages   (mapv #(merge {:lib/type "mbql.stage/mbql"} %) stages)})

(defn- run
  ([q] (run q nil))
  ([q row-limit]
   (megabot/run-warehouse-query-tool (cond-> {:query q} row-limit (assoc :row_limit row-limit)))))

(defn- ran?
  "Whether `result` is a successful run: it registered a query id rather than returning an error."
  [{:keys [structured-output]}]
  (some? (:query-id structured-output)))

(defn- rows-of
  "All rows of the query a successful `result` registered — what show_result renders, not the capped preview."
  [result]
  (mt/rows (qp/process-query (get-in result [:structured-output :query]))))

(defn- resolves-to-question-url?
  [memory uri]
  (str/starts-with? (links/resolve-links (str "[x](" uri ")")
                                         (get-in @memory [:state :queries])
                                         (get-in @memory [:state :charts])
                                         (atom {}))
                    "[x](/question#"))

(defn- card-query
  "The query in the `generated_entity` card a tool result renders — what the frontend runs and opens."
  [result]
  (get-in result [:data-parts 0 :data :query :query]))

;;; Expected results are built with Lib, independently of the dialect under test.

(defn- orders-query []
  (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :orders))))

(defn- field [table column]
  (lib.metadata/field (mt/metadata-provider) (mt/id table column)))

(defn- revenue-query
  "Sum of order totals; with `min-total`, of orders over it only."
  ([]
   (lib/aggregate (orders-query) (lib/sum (field :orders :total))))
  ([min-total]
   (lib/filter (revenue-query) (lib/> (field :orders :total) min-total))))

(defn- by-year [q]
  (lib/breakout q (lib/with-temporal-bucket (field :orders :created_at) :year)))

(deftest run-warehouse-query-returns-rows-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (let [memory     (atom {:state {}})
            {:keys [output structured-output]}
            (binding [shared/*memory-atom* memory]
              (run (query {:source-table (mt/id :orders) :aggregation [["count" {}]]})))
            query-id   (:query-id structured-output)
            registered (get-in @memory [:state :queries query-id])]
        (testing "the model reads the actual rows"
          (is (str/includes? output "18760"))
          (is (str/includes? output "complete result"))
          (is (= 1 (:row-count structured-output))))
        (testing "the resolved MBQL 5 query is registered under a fresh query id, without the preview's row cap"
          (is (not (str/blank? query-id)))
          (is (str/includes? output (str "Query ID: " query-id)))
          (is (= :mbql/query (:lib/type registered)))
          (is (= registered (:query structured-output)))
          (is (= (mt/id) (:database structured-output)))
          (is (not (contains? registered :constraints)))
          (is (resolves-to-question-url? memory (str "metabase://query/" query-id))))))))

(deftest run-warehouse-query-row-limit-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (testing "row_limit caps the preview, not the query"
        (let [result (run (query {:source-table (mt/id :orders)}) 3)]
          (is (str/includes? (:output result) (#'megabot/limit-reached-note 3)))
          (is (= 3 (get-in result [:structured-output :row-count])))
          (is (true? (get-in result [:structured-output :more-rows?])))
          (is (= 18760 (count (rows-of result))))))
      (testing "a stage limit is part of the query"
        (let [result (run (query {:source-table (mt/id :orders) :limit 2}))]
          (is (str/includes? (:output result) "complete result"))
          (is (= 2 (count (rows-of result)))))))))

(deftest structured-query-guidance-test
  (testing "every construct the megabot-query skill and the operators skill teach runs as written"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (let [orders      (mt/id :orders)
              products    (mt/id :products)
              created     ["field" {} (mt/id :orders :created_at)]
              total       ["field" {} (mt/id :orders :total)]
              tax         ["field" {} (mt/id :orders :tax)]
              discount    ["field" {} (mt/id :orders :discount)]
              user-id     ["field" {} (mt/id :orders :user_id)]
              product-id  (mt/id :orders :product_id)
              category-id (mt/id :products :category)
              category    ["field" {} category-id]
              title       ["field" {} (mt/id :products :title)]
              vendor      ["field" {} (mt/id :products :vendor)]
              by          (fn [unit] ["field" {:temporal-unit unit} (mt/id :orders :created_at)])
              cases
              {"temporal grouping"          (query {:source-table orders
                                                    :aggregation  [["count" {}]]
                                                    :breakout     [(by "month")]})
               "extracted time unit"        (query {:source-table orders
                                                    :aggregation  [["count" {}]]
                                                    :breakout     [(by "day-of-week")]})
               "combined filters"           (query {:source-table orders
                                                    :filters      [[">" {} total 100]
                                                                   ["in" {} category "Gadget" "Widget"]]
                                                    :aggregation  [["count" {}]]})
               "case-insensitive contains"  (query {:source-table products
                                                    :filters      [["contains" {:case-sensitive false} title "WALLET"]]
                                                    :aggregation  [["count" {}]]})
               "or"                         (query {:source-table orders
                                                    :filters      [["or" {} ["<" {} total 10] [">" {} total 150]]]
                                                    :aggregation  [["count" {}]]})
               "last 30 days"               (query {:source-table orders
                                                    :filters      [["time-interval" {} created -30 "day"]]
                                                    :aggregation  [["count" {}]]})
               "last 30 days with today"    (query {:source-table orders
                                                    :filters      [["time-interval" {:include-current true} created -30 "day"]]
                                                    :aggregation  [["count" {}]]})
               "this month"                 (query {:source-table orders
                                                    :filters      [["time-interval" {} created "current" "month"]]
                                                    :aggregation  [["count" {}]]})
               "last quarter"               (query {:source-table orders
                                                    :filters      [["time-interval" {} created "last" "quarter"]]
                                                    :aggregation  [["count" {}]]})
               "absolute range"             (query {:source-table orders
                                                    :filters      [["between" {} created "2018-01-01" "2018-12-31"]]
                                                    :aggregation  [["count" {}]]})
               "during a month"             (query {:source-table orders
                                                    :filters      [["during" {} created "2018-03-01" "month"]]
                                                    :aggregation  [["count" {}]]})
               "missing values"             (query {:source-table orders
                                                    :filters      [["is-null" {} discount]]
                                                    :aggregation  [["count" {}]]})
               "empty text"                 (query {:source-table products
                                                    :filters      [["not-empty" {} vendor]]
                                                    :aggregation  [["count" {}]]})
               "aggregation catalog"        (query {:source-table orders
                                                    :aggregation  [["sum" {} total] ["avg" {} total] ["min" {} total]
                                                                   ["max" {} total] ["distinct" {} user-id]
                                                                   ["count-where" {} [">" {} total 100]]
                                                                   ["share" {} [">" {} total 100]]]})
               "ratio of aggregations"      (query {:source-table orders
                                                    :aggregation  [["/" {} ["count-where" {} [">" {} total 100]] ["count" {}]]]
                                                    :breakout     [(by "year")]})
               "running total"              (query {:source-table orders
                                                    :aggregation  [["cum-sum" {} total]]
                                                    :breakout     [(by "year")]})
               "binning"                    (query {:source-table orders
                                                    :aggregation  [["count" {}]]
                                                    :breakout     [["field" {:binning {:strategy "num-bins" :num-bins 10}}
                                                                    (mt/id :orders :total)]]})
               "top N"                      (query {:source-table orders
                                                    :aggregation  [["sum" {} total]]
                                                    :breakout     [category]
                                                    :order-by     [["desc" {} ["aggregation" {} 0]]]
                                                    :limit        3})
               "implicit join"              (query {:source-table orders
                                                    :aggregation  [["sum" {} total]]
                                                    :breakout     [category]})
               "chosen foreign key"         (query {:source-table orders
                                                    :aggregation  [["count" {}]]
                                                    :breakout     [["field" {:source-field product-id} category-id]]})
               "explicit join"              (query {:source-table orders
                                                    :joins        [{:alias      "Products"
                                                                    :strategy   "left-join"
                                                                    :stages     [{:lib/type "mbql.stage/mbql" :source-table products}]
                                                                    :conditions [["=" {}
                                                                                  ["field" {} product-id]
                                                                                  ["field" {:join-alias "Products"} (mt/id :products :id)]]]}]
                                                    :aggregation  [["count" {}]]
                                                    :breakout     [["field" {:join-alias "Products"} category-id]]})
               "custom column"              (query {:source-table orders
                                                    :expressions  {"Net" ["-" {} total tax]}
                                                    :aggregation  [["sum" {} ["expression" {} "Net"]]]})
               "filter on an aggregation"   (query {:source-table orders
                                                    :aggregation  [["count" {}]]
                                                    :breakout     [user-id]}
                                                   {:filters [[">" {} ["field" {} "count"] 5]]})
               "named aggregation"          (query {:source-table orders
                                                    :aggregation  [["sum" {:name "revenue"} total]]
                                                    :breakout     [category]}
                                                   {:filters [[">" {} ["field" {} "revenue"] 100]]})
               "period over period"         (query {:source-table orders
                                                    :aggregation  [["sum" {} total]
                                                                   ["offset" {:name "previous"} ["sum" {} total] -1]]
                                                    :breakout     [(by "year")]})
               "date difference"            (query {:source-table orders
                                                    :expressions  {"Age" ["datetime-diff" {} created ["now" {}] "day"]}
                                                    :aggregation  [["avg" {} ["expression" {} "Age"]]]})}]
          (doseq [[case-name q] cases]
            (testing case-name
              (let [result (run q)]
                (is (ran? result) (:output result))))))))))

(deftest top-n-returns-exactly-n-rows-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (let [result (run (query {:source-table (mt/id :orders)
                                :aggregation  [["sum" {} ["field" {} (mt/id :orders :total)]]]
                                :breakout     [["field" {} (mt/id :products :category)]]
                                :order-by     [["desc" {} ["aggregation" {} 0]]]
                                :limit        3}))
            rows   (rows-of result)]
        (is (= 3 (count rows)))
        (is (= (sort-by second > rows) rows))))))

(deftest run-warehouse-query-metric-test
  (testing "a metric used by id gives its saved definition's answer, filters included, not a re-implementation"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card metric {:type          :metric
                                           :name          "Big order revenue"
                                           :database_id   (mt/id)
                                           :dataset_query (revenue-query 100)}]
          (let [created  (mt/id :orders :created_at)
                result   (run (query {:source-table (mt/id :orders)
                                      :aggregation  [["metric" {} (:id metric)]]
                                      :breakout     [["field" {:temporal-unit "year"} created]]}))
                expected (mt/rows (qp/process-query (by-year (revenue-query 100))))
                naive    (mt/rows (qp/process-query (by-year (revenue-query))))]
            (is (ran? result) (:output result))
            (is (= expected (rows-of result)))
            (is (not= naive (rows-of result)) "the metric's own filter applies")
            (testing "the query keeps the metric reference, so the rendered question shows the metric"
              (is (some #{[:metric (:id metric)]}
                        (get-in (links/->legacy-mbql (get-in result [:structured-output :query]))
                                [:query :aggregation]))))
            (testing "filtered and grouped through a foreign key, like any aggregation"
              (is (ran? (run (query {:source-table (mt/id :orders)
                                     :aggregation  [["metric" {} (:id metric)]]
                                     :filters      [["time-interval" {} ["field" {} created] -30 "year"]]
                                     :breakout     [["field" {} (mt/id :products :category)]]})))))))))))

(deftest run-warehouse-query-model-metric-test
  (testing "a metric built on a model works on its model, the source-card the snapshot lists for it"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (mt/with-temp [:model/Card model  (mt/card-with-metadata {:type          :model
                                                                  :name          "Orders model"
                                                                  :database_id   (mt/id)
                                                                  :dataset_query (orders-query)})
                       :model/Card metric {:type          :metric
                                           :name          "Order count"
                                           :database_id   (mt/id)
                                           :dataset_query (-> (lib/query (mt/metadata-provider)
                                                                         (lib.metadata/card (mt/metadata-provider) (:id model)))
                                                              (lib/aggregate (lib/count)))}]
          (let [result (run (query {:source-card  (:id model)
                                    :aggregation  [["metric" {} (:id metric)]]
                                    :breakout     [["field" {:temporal-unit "year"} "CREATED_AT"]]}))]
            (is (ran? result) (:output result))
            (is (= 18760 (reduce + (map second (rows-of result)))))))))))

(deftest run-warehouse-query-model-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card model (mt/card-with-metadata {:type          :model
                                                               :name          "Orders model"
                                                               :database_id   (mt/id)
                                                               :dataset_query (orders-query)})]
        (testing "a model is filtered and grouped by its column names"
          (let [result (run (query {:source-card (:id model)
                                    :filters     [[">" {} ["field" {} "TOTAL"] 100]]
                                    :aggregation [["count" {}]]
                                    :breakout    [["field" {:temporal-unit "year"} "CREATED_AT"]]}))]
            (is (ran? result) (:output result))
            (is (= (mt/rows (qp/process-query (-> (orders-query)
                                                  (lib/filter (lib/> (field :orders :total) 100))
                                                  (lib/aggregate (lib/count))
                                                  by-year)))
                   (rows-of result)))))
        (testing "running a model with row_limit 1 shows its column names"
          (let [{:keys [output]} (run (query {:source-card (:id model)}) 1)]
            (is (str/starts-with? output "ID | USER_ID | PRODUCT_ID"))))
        (testing "a related table's column, through an explicit join on the model's foreign key by field id"
          (let [join   (fn [model-fk]
                         {:alias      "Products"
                          :stages     [{:lib/type "mbql.stage/mbql" :source-table (mt/id :products)}]
                          :conditions [["=" {} model-fk ["field" {:join-alias "Products"} (mt/id :products :id)]]]})
                by-cat (fn [model-fk]
                         (query {:source-card (:id model)
                                 :joins       [(join model-fk)]
                                 :aggregation [["count" {}]]
                                 :breakout    [["field" {:join-alias "Products"} (mt/id :products :category)]]}))
                result (run (by-cat ["field" {} (mt/id :orders :product_id)]))]
            (is (ran? result) (:output result))
            (is (= 4 (count (rows-of result))))
            (testing "and a name in the condition, which the pipeline can't resolve, says to use the field id"
              (is (str/includes? (:output (run (by-cat ["field" {} "PRODUCT_ID"])))
                                 "Reference both sides of a join condition by field id")))))
        (testing "a legacy `card__<id>` source is repaired to source-card"
          (is (ran? (run (query {:source-table (str "card__" (:id model)) :aggregation [["count" {}]]})))))))))

(defn- rejected
  "Run `q` and return its output, asserting it was rejected with a recovery step and registered nothing."
  [q]
  (let [{:keys [output structured-output]} (run q)]
    (is (nil? structured-output) output)
    (is (str/includes? output "To recover:") output)
    output))

(deftest run-warehouse-query-rejection-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (let [orders (mt/id :orders)]
        (testing "legacy MBQL is rejected with how to rewrite it"
          (let [output (rejected {:database (mt/id)
                                  :type     "query"
                                  :query    {:source-table orders :aggregation [["count"]]}})]
            (is (str/includes? output "legacy MBQL"))
            (is (str/includes? output "\"lib/type\": \"mbql/query\""))))
        (testing "a native query is pointed at SQL, with the rule for when SQL is right"
          (let [output (rejected {:database (mt/id) :type "native" :native {:query "select 1"}})]
            (is (str/includes? output "run_warehouse_sql"))
            (is (str/includes? output "Querying the warehouse"))))
        (testing "an unknown field id says where field ids are"
          (let [output (rejected (query {:source-table orders
                                         :aggregation  [["count" {}]]
                                         :breakout     [["field" {} Integer/MAX_VALUE]]}))]
            (is (str/includes? output "No field found"))
            (is (str/includes? output "metabase_field"))))
        (testing "an unknown table id says where table ids are"
          (let [output (rejected (query {:source-table Integer/MAX_VALUE :aggregation [["count" {}]]}))]
            (is (str/includes? output "No table found"))
            (is (str/includes? output "This instance"))))
        (testing "an unknown stage key lists the valid ones"
          (is (str/includes? (rejected (query {:source-table orders :aggregations [["count" {}]]}))
                             "Valid stage keys")))
        (testing "ordering by a same-stage aggregation's name says to use its index"
          (is (str/includes? (rejected (query {:source-table orders
                                               :aggregation  [["count" {}]]
                                               :breakout     [["field" {} (mt/id :products :category)]]
                                               :order-by     [["desc" {} ["field" {} "count"]]]}))
                             "[\"aggregation\", {}, <index>]")))
        (testing "an unknown operator points at the operator catalog"
          (is (str/includes? (rejected (query {:source-table orders :aggregation [["countt" {}]]}))
                             "megabot-query-operators")))))))

(deftest run-warehouse-query-execution-failure-test
  (mt/test-drivers #{:h2}
    (mt/with-current-user (mt/user->id :crowberto)
      (mt/with-temp [:model/Card metric {:type          :metric
                                         :name          "Revenue"
                                         :database_id   (mt/id)
                                         :dataset_query (revenue-query)}
                     :model/Card model  (mt/card-with-metadata {:type          :model
                                                                :name          "Orders model"
                                                                :database_id   (mt/id)
                                                                :dataset_query (orders-query)})]
        (testing "a metric on another source says to use the metric's own source"
          (is (str/includes? (rejected (query {:source-table (mt/id :products)
                                               :aggregation  [["metric" {} (:id metric)]]}))
                             "only works on its own source")))
        (testing "following a foreign key from a model, which fails in the warehouse, says to join explicitly"
          (is (str/includes? (rejected (query {:source-card (:id model)
                                               :aggregation [["count" {}]]
                                               :breakout    [["field" {} (mt/id :products :category)]]}))
                             "add an explicit `joins` entry")))
        (testing "an unknown model column is rejected with the model's column names"
          (let [output (rejected (query {:source-card (:id model)
                                         :filters     [[">" {} ["field" {} "TOTALS"] 100]]}))]
            (is (str/includes? output "TOTALS"))
            (is (str/includes? output "SUBTOTAL, TAX, TOTAL"))))))))

(deftest show-result-renders-a-notebook-question-test
  (testing "show_result renders a structured query as the same card construct_notebook_query produces, so the user
            gets the same drill-through and open-in-the-query-builder"
    (mt/test-drivers #{:h2}
      (mt/with-current-user (mt/user->id :crowberto)
        (let [memory      (atom {:state {}})
              query-id    (-> (binding [shared/*memory-atom* memory]
                                (run (query {:source-table (mt/id :orders)
                                             :aggregation  [["count" {}]]
                                             :breakout     [["field" {:temporal-unit "month"}
                                                             (mt/id :orders :created_at)]]})))
                              :structured-output :query-id)
              shown       (binding [shared/*memory-atom* memory]
                            (megabot/show-result-tool {:query_id query-id :display "line" :title "Orders per month"}))
              db-name     (:name (mt/db))
              constructed (construct/construct-notebook-query-tool
                           {:query         {:lib/type "mbql/query"
                                            :stages   [{:lib/type     "mbql.stage/mbql"
                                                        :source-table [db-name "PUBLIC" "ORDERS"]
                                                        :aggregation  [["count" {}]]
                                                        :breakout     [["field" {:temporal-unit "month"}
                                                                        [db-name "PUBLIC" "ORDERS" "CREATED_AT"]]]}]}
                            :title         "Orders per month"
                            :description   "Orders per month."
                            :visualization {:chart_type "line"}})]
          (is (= :query (:type (card-query shown))) "a notebook question, not a native one")
          (is (= (card-query constructed) (card-query shown)))
          (is (resolves-to-question-url? memory (str "metabase://chart/"
                                                     (get-in shown [:structured-output :chart-id])))))))))

(deftest structured-queries-without-sql-permission-test
  (testing "a user who can't write SQL gets warehouse answers and charts through structured queries"
    (mt/test-drivers #{:h2}
      (mt/with-no-data-perms-for-all-users!
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
        (perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
        (mt/with-current-user (mt/user->id :rasta)
          (testing "the SQL tool isn't offered, the structured one is"
            (let [caps (capabilities/enforce-permissions #{"permission:save_questions" "permission:write_sql_queries"})]
              (binding [scope/*current-user-scope* api-scope/unrestricted]
                (let [tools (profiles/get-tools-for-profile :megabot caps)]
                  (is (contains? tools "run_warehouse_query"))
                  (is (not (contains? tools "run_warehouse_sql")))))))
          (testing "the instance snapshot says SQL is unavailable"
            (is (str/includes? (megabot-context/instance-snapshot)
                               "You can't write SQL on any of these databases")))
          (testing "a structured query answers, and its show_result chart runs for the user"
            (let [memory (atom {:state {}})
                  result (binding [shared/*memory-atom* memory]
                           (run (query {:source-table (mt/id :orders)
                                        :aggregation  [["count" {}]]
                                        :breakout     [["field" {} (mt/id :products :category)]]})))
                  shown  (binding [shared/*memory-atom* memory]
                           (megabot/show-result-tool {:query_id (get-in result [:structured-output :query-id])
                                                      :display  "bar"
                                                      :title    "Orders by category"}))]
              (is (ran? result) (:output result))
              (is (str/includes? (:output result) "Widget"))
              (testing "the frontend runs the rendered card through /api/dataset as the user"
                (let [response (mt/user-http-request :rasta :post 202 "dataset" (card-query shown))]
                  (is (= "completed" (:status response)))
                  (is (= 4 (count (get-in response [:data :rows]))))))))
          (testing "SQL attempted anyway is refused with a pointer to run_warehouse_query"
            (let [{:keys [output]} (megabot/run-warehouse-sql-tool {:database_id (mt/id) :sql "SELECT 1"})]
              (is (str/includes? output "run_warehouse_query")))))))))
