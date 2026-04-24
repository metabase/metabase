(ns metabase.metabot.tools.charts.edit-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.tools.charts :as tools.charts]
   [metabase.metabot.tools.charts.edit :as edit-chart]
   [metabase.metabot.tools.construct :as tools.construct]
   [metabase.metabot.tools.resources :as tools.resources]
   [metabase.metabot.tools.shared :as tools.shared]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.util :as u]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2]))

(deftest edit-chart-test
  (testing "edits a chart's visualization type"
    (let [mp (mt/metadata-provider)
          charts-state {"chart-abc" {:chart-id "chart-abc"
                                     :queries [(lib/native-query mp "SELECT * FROM orders")]
                                     :chart-type :bar}}
          {:keys [result]} (edit-chart/edit-chart
                            {:chart-id "chart-abc"
                             :new-chart-type :line
                             :charts-state charts-state})]
      (is (contains? result :chart-id))
      (is (string? (:chart-id result)))
      ;; New chart should have a different ID
      (is (not= "chart-abc" (:chart-id result)))
      (is (= :line (:chart-type result)))
      (is (str/includes? (:chart-content result) "<chart"))
      (is (str/includes? (:chart-content result) "line"))
      (is (str/starts-with? (:chart-link result) "metabase://chart/"))
      (is (contains? result :instructions))))

  (testing "edits chart to various types"
    (let [mp (mt/metadata-provider)
          charts-state {"chart-456" {:chart-id "chart-456"
                                     :queries [(lib/native-query mp "SELECT * FROM orders")]}}]
      (doseq [new-type [:pie :table :scatter :area :sunburst]]
        (let [{:keys [result]} (edit-chart/edit-chart
                                {:chart-id "chart-456"
                                 :new-chart-type new-type
                                 :charts-state charts-state})]
          (is (= new-type (:chart-type result))
              (str "New chart type " new-type " should be set correctly"))))))

  (testing "throws error for invalid chart type"
    (let [charts-state {"chart-789" {:chart-id "chart-789"}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid chart type"
           (edit-chart/edit-chart
            {:chart-id "chart-789"
             :new-chart-type :invalid-type
             :charts-state charts-state})))))

  (testing "throws error when chart not found"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"issues accessing the chart data"
         (edit-chart/edit-chart
          {:chart-id "nonexistent"
           :new-chart-type :bar
           :charts-state {}})))))

(deftest edit-chart-of-constructed-query-test
  (mt/with-current-user (test.users/user->id :crowberto)
    (let [table-fields-uri (str "metabase://table/" (mt/id :products) "/fields")

          {[{{table :structured-output} :content}] :resources}
          (tools.resources/read-resource-tool {:uris [table-fields-uri]})

          ;; Representations-format query: LLM-facing code should prefer the portable_fk path
          ;; over numeric field ids. Take them straight from the entity_details response.
          table-fk (:portable_fk table)
          category-field-fk (some (fn [{:keys [display_name portable_fk]}]
                                    (when (= "Category" display_name)
                                      portable_fk))
                                  (:fields table))
          ;; (1) construct a query via the YAML representations format. Build the YAML from
          ;; a Clojure data structure and let `yaml/generate-string` handle quoting, flow
          ;; sequences, and `nil`-as-`null` so we don't have to do any manual JSON escaping.
          query-data {"lib/type" "mbql/query"
                      "database" (first table-fk)
                      "stages"   [{"lib/type"     "mbql.stage/mbql"
                                   "source-table" table-fk
                                   "aggregation"  [["count" {}]]
                                   "breakout"     [["field" {} category-field-fk]]}]}
          query-yaml (yaml/generate-string query-data)
          construct-result (tools.construct/construct-notebook-query-tool
                            {:query         query-yaml
                             :visualization {:chart_type "bar"}})
          query-id (get-in construct-result [:structured-output :query-id])
          query (get-in construct-result [:structured-output :query])
          chart-id (get-in construct-result [:structured-output :chart-id])]
      (binding [tools.shared/*memory-atom* (atom nil)]
        ;; (2) fetch the construction result into memory _as done in agent/loop-step_
        (swap! tools.shared/*memory-atom* #'agent/update-memory [{:type :tool-output
                                                                  :result construct-result}])
        (is (contains? (tools.shared/current-charts-state) chart-id))
        (is (contains? (tools.shared/current-queries-state) query-id))
        (testing "Edit chart can handle charts created using construct-notebook-query-tool"
          ;; (3) call the edit-chart-tool which uses the shared memory
          (let [edit-result (tools.charts/edit-chart-tool {:chart_id chart-id
                                                           :new_viz_settings {:chart_type "pie"}})
                new-chart-id (get-in edit-result [:structured-output :chart-id])
                new-chart-in-memory (get (tools.shared/current-charts-state) new-chart-id)]
            (is (= :pie
                   (get-in new-chart-in-memory [:visualization_settings :chart_type])))
            (is (= query
                   (get-in new-chart-in-memory [:queries 0])))))))))

(deftest construct-notebook-query-llm-orders-by-inline-aggregation-end-to-end-test
  (testing (str "End-to-end regression for the inline-aggregation-in-order-by failure: the\n"
                "LLM writes `order-by: [[desc, {}, [sum, {}, [field, {}, FK]]]]` re-stating\n"
                "the aggregation expression. Repair must rewrite this into an aggregation\n"
                "reference so the legacy round-trip on the resulting query succeeds.")
    (mt/with-current-user (test.users/user->id :crowberto)
      ;; Use the *canonical* DB name (per `repr-plan.md` step 13: `database:` is now strict).
      ;; The prompt's `Sample` example would fail at the database lookup before we even get
      ;; to exercise the order-by repair pass we're testing here.
      (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))
            query-data {"lib/type" "mbql/query"
                        "database" db-name
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" [db-name "PUBLIC" "ORDERS"]
                                     "aggregation"  [["sum" {}
                                                      ["field" {}
                                                       [db-name "PUBLIC" "ORDERS" "TOTAL"]]]]
                                     "breakout"     [["field" {}
                                                      [db-name "PUBLIC" "PRODUCTS" "CATEGORY"]]]
                                     "order-by"     [["desc" {}
                                                      ["sum" {}
                                                       ["field" {}
                                                        [db-name "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
            query-yaml (yaml/generate-string query-data)
            result (tools.construct/construct-notebook-query-tool
                    {:query         query-yaml
                     :visualization {:chart_type "bar"}})
            query (get-in result [:structured-output :query])]
        (testing "order-by inner clause is now an aggregation reference, not :sum"
          (let [first-ord (first (get-in query [:stages 0 :order-by]))
                inner     (when (and (vector? first-ord) (>= (count first-ord) 3))
                            (nth first-ord 2))]
            (is (= :aggregation (first inner)))))
        (testing "query compiles AND executes against the real sample DB"
          ;; The original bug surfaced when the chart was re-loaded and the QP round-tripped
          ;; through legacy MBQL. `qp/process-query` exercises the same path.
          (let [qp-result (qp/process-query query)
                rows      (mt/rows qp-result)]
            (is (seq rows) "expected at least one row from the grouped+ordered query")
            ;; Each row is [category, sum]. Sums should be in descending order.
            (let [sums (mapv second rows)]
              (is (= sums (vec (reverse (sort sums))))
                  "sums should be in descending order"))))))))

(deftest construct-notebook-query-llm-uses-prompt-db-name-end-to-end-test
  (testing (str "End-to-end regression: the LLM writes `database: Sample` (the prompt\n"
                "example name) against the real `Sample Database` app DB. Per\n"
                "`repr-plan.md` step 13 the YAML's `database:` is now strict \u2014 the lookup\n"
                "fails fast with a clear `:agent-error?` message that nudges the LLM to\n"
                "use the canonical name from `entity_details`.")
    (mt/with-current-user (test.users/user->id :crowberto)
      ;; Verbatim the YAML the LLM produced in the bug report. Note: every portable FK uses
      ;; `Sample` (the prompt name), not `Sample Database` (the real one).
      (let [query-data {"lib/type" "mbql/query"
                        "database" "Sample"
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" ["Sample" "PUBLIC" "ORDERS"]
                                     "aggregation"  [["sum" {}
                                                      ["field" {}
                                                       ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]
                                     "breakout"     [["field" {}
                                                      ["Sample" "PUBLIC" "PRODUCTS" "CATEGORY"]]]
                                     "order-by"     [["desc" {}
                                                      ["sum" {}
                                                       ["field" {}
                                                        ["Sample" "PUBLIC" "ORDERS" "TOTAL"]]]]]}]}
            query-yaml (yaml/generate-string query-data)
            result (tools.construct/construct-notebook-query-tool
                    {:query         query-yaml
                     :visualization {:chart_type "bar"}})]
        (testing "tool returns a clear, agent-targeted error rather than producing a chart"
          ;; The outer `construct-notebook-query-tool` catches the ex-info and returns
          ;; `{:output <message>}` (no `:structured-output`). That's the LLM-visible signal.
          (is (nil? (:structured-output result))
              (str "expected no structured-output, got: " (pr-str result)))
          (is (string? (:output result)))
          (is (re-find #"Sample" (:output result))
              (str "error message should mention the offending DB name; got: "
                   (:output result)))
          (is (re-find #"entity_details|Unknown database" (:output result))
              (str "error message should hint at the recovery path; got: "
                   (:output result))))))))

(deftest construct-notebook-query-llm-uses-canonical-db-name-end-to-end-test
  (testing (str "Symmetric to the previous test: the LLM writes `database: Sample Database`\n"
                "(the canonical name reported by `entity_details`) and the chart constructs\n"
                "cleanly. This is the post-step-13 happy path the LLM should follow.")
    (mt/with-current-user (test.users/user->id :crowberto)
      (let [db-name (t2/select-one-fn :name :model/Database :id (mt/id))
            query-data {"lib/type" "mbql/query"
                        "database" db-name
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" [db-name "PUBLIC" "ORDERS"]
                                     "aggregation"  [["sum" {}
                                                      ["field" {}
                                                       [db-name "PUBLIC" "ORDERS" "TOTAL"]]]]
                                     "breakout"     [["field" {}
                                                      [db-name "PUBLIC" "PRODUCTS" "CATEGORY"]]]}]}
            query-yaml (yaml/generate-string query-data)
            result (tools.construct/construct-notebook-query-tool
                    {:query         query-yaml
                     :visualization {:chart_type "bar"}})
            query (get-in result [:structured-output :query])
            breakout-field (get-in query [:stages 0 :breakout 0])]
        (testing "the chart was constructed successfully"
          (is (some? (:structured-output result)) (pr-str result))
          (is (= :mbql/query (:lib/type query)))
          (is (= (mt/id) (:database query)))
          (is (= (mt/id :orders) (get-in query [:stages 0 :source-table]))))
        (testing "breakout was resolved to PRODUCTS.CATEGORY with auto-wired source-field"
          (is (= (mt/id :products :category) (nth breakout-field 2)))
          (is (= (mt/id :orders :product_id) (:source-field (second breakout-field)))))
        (testing "query compiles to runnable SQL"
          (let [{:keys [query]} (qp.compile/compile query)]
            (is (string? query))
            (is (str/includes? (u/upper-case-en query) "PRODUCTS"))))))))

(deftest construct-notebook-query-implicit-join-end-to-end-test
  (testing (str "End-to-end: YAML with source-table=ORDERS referencing PRODUCTS.CATEGORY "
                "gets source-field auto-wired, produces a query that compiles to SQL with "
                "a JOIN and executes successfully against the app DB.")
    (mt/with-current-user (test.users/user->id :crowberto)
      (let [;; Discover portable FKs the same way the LLM does: via entity_details / fields.
            {[{{orders-details :structured-output} :content}] :resources}
            (tools.resources/read-resource-tool
             {:uris [(str "metabase://table/" (mt/id :orders) "/fields")]})

            {[{{products-details :structured-output} :content}] :resources}
            (tools.resources/read-resource-tool
             {:uris [(str "metabase://table/" (mt/id :products) "/fields")]})

            orders-fk           (:portable_fk orders-details)
            product-id-field    (some (fn [{:keys [display_name] :as f}]
                                        (when (= "Product ID" display_name) f))
                                      (:fields orders-details))
            ;; The LLM learns PRODUCT_ID points at PRODUCTS via `:fk_target_portable_fk`
            ;; and then fetches the target table's fields to pick CATEGORY.
            products-target-fk  (:fk_target_portable_fk product-id-field)
            category-field-fk   (some (fn [{:keys [display_name portable_fk]}]
                                        (when (= "Category" display_name) portable_fk))
                                      (:fields products-details))

            ;; Build the YAML via data structures — no string concatenation. The parser
            ;; expects string keys; clj-yaml's generate-string round-trips cleanly through
            ;; `repr/parse-yaml`.
            query-data {"lib/type" "mbql/query"
                        "database" (first orders-fk)
                        "stages"   [{"lib/type"     "mbql.stage/mbql"
                                     "source-table" orders-fk
                                     "aggregation"  [["count" {}]]
                                     "breakout"     [["field" {} category-field-fk]]}]}
            query-yaml (yaml/generate-string query-data)

            construct-result (tools.construct/construct-notebook-query-tool
                              {:query         query-yaml
                               :visualization {:chart_type "bar"}})
            query (get-in construct-result [:structured-output :query])
            breakout-field (get-in query [:stages 0 :breakout 0])
            field-opts (second breakout-field)]

        (testing "entity_details surfaced the FK target — sanity-check the inputs we fed in"
          (is (= ["Product ID" "PRODUCTS"]
                 [(:display_name product-id-field)
                  (nth products-target-fk 2)])
              "Product ID's fk_target_portable_fk should point at PRODUCTS"))

        (testing "repair resolved the portable breakout to PRODUCTS.CATEGORY"
          (is (= (mt/id :products :category) (nth breakout-field 2))))

        (testing "repair auto-wired :source-field to ORDERS.PRODUCT_ID"
          (is (= (mt/id :orders :product_id) (:source-field field-opts))))

        (testing "query compiles to SQL that joins ORDERS and PRODUCTS"
          (let [{:keys [query]} (qp.compile/compile query)]
            (is (string? query))
            (is (str/includes? query "JOIN"))
            (is (str/includes? (u/upper-case-en query) "PRODUCTS"))
            (is (str/includes? (u/upper-case-en query) "ORDERS"))))

        (testing "query executes and returns grouped rows (categories + counts)"
          (let [qp-result (qp/process-query query)
                rows      (mt/rows qp-result)]
            (is (seq rows) "expected at least one row from the joined query")
            (is (every? (fn [row] (and (vector? row) (= 2 (count row)))) rows)
                "each row should be [category, count]")
            (is (every? string? (map first rows))
                "first column should be category names (strings)")
            (is (every? (every-pred number? pos?) (map second rows))
                "second column should be positive counts")))))))
