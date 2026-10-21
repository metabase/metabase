(ns metabase.metabot.tools.charts-test
  "Tests that the chart tools always emit a `generated_entity` card data part, and what the model reads when a call
   fails. The inline-vs-navigate decision now lives on the frontend, so the backend no longer branches on a
   capability."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.charts.edit :as edit-chart-tools]
   [metabase.metabot.tools.charts.fit :as fit]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.run-query :as run-query]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(def ^:private count-by-category
  (-> (lib/query meta/metadata-provider (meta/table-metadata :products))
      (lib/aggregate (lib/count))
      (lib/breakout (meta/field-metadata :products :category))))

(defn- run-create-chart
  ([]
   (run-create-chart "bar"))
  ([chart-type]
   (let [memory (atom {:state {:queries {"q-1" count-by-category}}})]
     (binding [shared/*memory-atom* memory]
       (test-util/call-tool charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                                      :viz_settings {:chart_type chart-type}
                                                      :title        "Orders by month"
                                                      :description  "Monthly count of orders."})))))

(deftest create-chart-generated-entity-test
  (testing "emits a single generated_entity card part"
    (let [result (run-create-chart)
          parts  (:data-parts result)
          entity (:data (first parts))]
      (is (= 1 (count parts)))
      (is (= "generated_entity" (:data-type (first parts))))
      (is (= "card" (:type entity)))
      (is (string? (:id entity)))
      (is (= "Orders by month" (:title entity)))
      (is (= "Monthly count of orders." (:description entity)))
      (is (= "bar" (:display entity)))
      (testing "embeds the query so the FE can run it"
        (is (= "q-1" (get-in entity [:query :id])))
        (is (some? (get-in entity [:query :query]))))
      (testing "keeps the query in structured-output so chart memory stores it for later edits"
        (is (= count-by-category (get-in result [:structured-output :query])))))))

(deftest create-chart-keeps-mbql5-temporal-filter-test
  (testing "the generated_entity part carries a during filter through JSON intact (BOT-1972)"
    (let [date   (meta/field-metadata :checkins :date)
          query  (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                     (lib/filter [:during {:lib/uuid (str (random-uuid))} (lib/ref date) "2026-07-01" :month]))
          memory (atom {:state {:queries {"q-1" query}}})
          result (binding [shared/*memory-atom* memory]
                   (test-util/call-tool charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                                                  :viz_settings {:chart_type "table"}
                                                                  :title        "Check-ins in July"
                                                                  :description  "Check-ins during July 2026."}))
          sent   (-> result (get-in [:data-parts 0 :data :query :query]) json/encode (json/decode true))]
      (is (= "mbql/query" (:lib/type sent)))
      (is (= (lib/filters query)
             (-> sent lib/normalize :stages first :filters))))))

(deftest create-chart-new-chart-types-test
  (testing "the tool schema accepts newly added chart types"
    (doseq [chart-type ["treemap" "boxplot"]]
      (let [result (run-create-chart chart-type)]
        (is (= (keyword chart-type) (get-in result [:structured-output :chart-type])))
        (is (= chart-type (get-in result [:data-parts 0 :data :display])))))))

(deftest edit-chart-query-fallback-test
  (testing "edit_chart resolves the query from queries-state when chart memory has no query"
    (let [memory (atom {:state   {:queries {"q-1" count-by-category}
                                  :charts  {"c-1" {:chart_id "c-1"
                                                   :query_id "q-1"
                                                   :queries  [nil]
                                                   :visualization_settings {:chart_type :bar}}}}
                        :context {}})
          result (binding [shared/*memory-atom* memory]
                   (test-util/call-tool charts/edit-chart-tool {:chart_id         "c-1"
                                                                :new_viz_settings {:chart_type "pie"}
                                                                :title            "Orders by month"
                                                                :description      "Monthly count of orders."}))
          parts  (:data-parts result)
          entity (:data (first parts))]
      (is (= 1 (count parts)))
      (is (= "generated_entity" (:data-type (first parts))))
      (is (= (links/->frontend-query count-by-category) (get-in entity [:query :query])))
      (is (= "pie" (:display entity)))
      (testing "structured-output also carries the resolved query, not just data-parts"
        ;; Regression: edit-chart-tool's :query var (used for data-parts above) came
        ;; from queries-state, but edit-chart's :result — which becomes
        ;; structured-output and is what extract-charts stores into :charts state —
        ;; only looked at the chart's own (here empty) :queries, landing on nil.
        (is (= {:query-id "q-1" :query count-by-category}
               (select-keys (:structured-output result) [:query-id :query])))))))

(defn- invoke
  "Call the tool `tool-name` with `args` the way the agent loop does, in a conversation whose state is `state`. The
  profile offers both chart tools and `construct_notebook_query`, which the recovery steps name. Returns the result,
  or `{:output <the text the model reads> :error {:class :code}}` when the call fails."
  [tool-name args state]
  (let [entries (binding [scope/*current-user-scope* api-scope/unrestricted]
                  (metabot.tools/->entries [#'metabot.tools/create-chart-tool
                                            #'metabot.tools/edit-chart-tool
                                            #'metabot.tools/construct-notebook-query-tool]
                                           (atom {:state state})
                                           nil
                                           :internal))]
    ((:fn (get entries tool-name)) args)))

(def ^:private chart-args
  {:title "Orders by month" :description "Monthly count of orders."})

(deftest create-chart-unknown-query-id-test
  (testing "a query ID that the conversation doesn't hold fails, and the model reads the query IDs that it does hold"
    (is (= {:output "No query with ID q-9. Known query IDs: [q-1]."
            :error  {:class :recoverable :code ::run-query/unknown-query-id}}
           (invoke "create_chart"
                   (assoc chart-args :data_source {:query_id "q-9"} :viz_settings {:chart_type "bar"})
                   {:queries {"q-1" count-by-category}})))))

(deftest edit-chart-unknown-chart-id-test
  (let [chart (fn [chart-id] {:chart_id chart-id :query_id "q-1" :queries [count-by-category]})
        args  (assoc chart-args :chart_id "c-9" :new_viz_settings {:chart_type "pie"})
        steps ["To make a new chart, call `construct_notebook_query` and use the chart ID that it returns."
               "To chart a query from this conversation, call `create_chart` with its query ID."]]
    (testing "a chart ID that the conversation doesn't hold fails, and the model reads the chart IDs that it does hold"
      (is (= {:output (str/join "\n" (cons (str "No chart with ID \"c-9\" exists in this conversation."
                                                " The available chart IDs are c-1, c-2.")
                                           steps))
              :error  {:class :recoverable :code ::recoverable.common/unknown-chart-id}}
             (invoke "edit_chart" args {:charts {"c-2" (chart "c-2") "c-1" (chart "c-1")}}))))
    (testing "in a conversation without charts, the model reads how to make one"
      (is (= {:output (str/join "\n" (cons (str "No chart with ID \"c-9\" exists in this conversation."
                                                " No charts have been created in this conversation yet.")
                                           steps))
              :error  {:class :recoverable :code ::recoverable.common/unknown-chart-id}}
             (invoke "edit_chart" args {}))))))

(deftest edit-chart-unknown-chart-id-keeps-recovery-steps-test
  (let [steps    (str "To make a new chart, call `construct_notebook_query` and use the chart ID that it returns.\n"
                      "To chart a query from this conversation, call `create_chart` with its query ID.")
        charts   (fn [ids]
                   {:charts (into {}
                                  (map (fn [id] [id {:chart_id id :query_id "q-1" :queries [count-by-category]}]))
                                  ids)})
        uuids    (map #(format "%08d-0000-4000-8000-000000000000" %) (range 120))
        long-id  (apply str (repeat 4100 "x"))
        output   (fn [chart-id state]
                   (:output (invoke "edit_chart"
                                    (assoc chart-args :chart_id chart-id :new_viz_settings {:chart_type "pie"})
                                    state)))]
    (testing "with more than 30 charts, the error lists the first 30 and counts the rest"
      (is (= (str "No chart with ID \"c-9\" exists in this conversation. The available chart IDs are "
                  (str/join ", " (take 30 uuids)) " and 90 more.\n"
                  steps)
             (output "c-9" (charts uuids)))))
    (testing "a long chart ID is cut to its first 100 characters"
      (is (= (str "No chart with ID \"" (subs long-id 0 100) "\" exists in this conversation."
                  " No charts have been created in this conversation yet.\n"
                  steps)
             (output long-id {}))))
    (testing "the recovery steps still fit when every chart ID is long"
      (is (str/ends-with? (output long-id (charts (map #(str % long-id) (range 120))))
                          (str " and 90 more.\n" steps))))))

(deftest construct-notebook-query-unknown-chart-type-test
  (testing "construct_notebook_query takes any chart type, and one that Metabot can't create fails with the ones it can"
    (mt/with-dynamic-fn-redefs [construct/execute-representations-query
                                (fn [_ & _]
                                  {:structured-output {:query-id "q-1" :query count-by-category :result-columns []}})]
      (is (= {:output (str "Chart type \"histogram\" is not supported. Supported chart types: "
                           (str/join ", " shared/chart-types) ".")
              :error  {:class :recoverable :code ::create-chart-tools/unknown-chart-type}}
             (invoke "construct_notebook_query"
                     (assoc chart-args
                            :query         {:lib/type "mbql/query" :stages []}
                            :visualization {:chart_type "histogram"})
                     {}))))))

(deftest chart-tools-incompatible-chart-type-test
  (let [orders-count (lib/aggregate (lib/query meta/metadata-provider (meta/table-metadata :orders)) (lib/count))
        failure      (fn [& message]
                       {:output (str (apply str message)
                                     "\nTo keep this chart type, call `construct_notebook_query` with a query that "
                                     "returns the columns it needs.")
                        :error  {:class :recoverable :code ::fit/incompatible-chart-type}})]
    (testing "create_chart fails on a chart type that can't show the query's columns, and names the ones that can"
      (is (= (failure "Chart type \"line\" can't show this query's columns. It needs 1 or 2 columns to group by and "
                      "at least 1 number to measure. The query returns 1 column: 0 to group by and 1 number to "
                      "measure. Chart types that fit these columns: table, scalar, gauge, progress, object.")
             (invoke "create_chart"
                     (assoc chart-args :data_source {:query_id "q-1"} :viz_settings {:chart_type "line"})
                     {:queries {"q-1" orders-count}}))))
    (testing "edit_chart checks the new chart type against the query of the chart that it edits"
      (is (= (failure "Chart type \"scalar\" can't show this query's columns. It needs exactly 1 column. The query "
                      "returns 2 columns: 1 to group by and 1 number to measure. Chart types that fit these columns: "
                      "table, bar, line, pie, sunburst, treemap, boxplot, area, combo, row, pivot, scatter, waterfall, "
                      "progress, funnel, object.")
             (invoke "edit_chart"
                     (assoc chart-args :chart_id "c-1" :new_viz_settings {:chart_type "scalar"})
                     {:charts {"c-1" {:chart_id "c-1" :query_id "q-1" :queries [count-by-category]}}}))))
    (testing "construct_notebook_query checks its chart type against the query that it builds"
      (mt/with-dynamic-fn-redefs [construct/execute-representations-query
                                  (fn [_ & _]
                                    {:structured-output {:query-id "q-1" :query orders-count :result-columns []}})]
        (is (= (failure "Chart type \"pie\" can't show this query's columns. It needs 1 to 3 columns to group by "
                        "and at least 1 number to measure. The query returns 1 column: 0 to group by and 1 number "
                        "to measure. Chart types that fit these columns: table, scalar, gauge, progress, object.")
               (invoke "construct_notebook_query"
                       (assoc chart-args
                              :query         {:lib/type "mbql/query" :stages []}
                              :visualization {:chart_type "pie"})
                       {})))))))

(deftest chart-tools-undeclared-failure-test
  (testing "a failure that no error declares ends the turn instead of reaching the model"
    (mt/with-dynamic-fn-redefs [create-chart-tools/create-chart (fn [_] (throw (ex-info "boom" {})))
                                edit-chart-tools/edit-chart     (fn [_] (throw (ex-info "boom" {})))]
      (is (=? {:error {:class :unrecoverable :code :internal}}
              (invoke "create_chart"
                      (assoc chart-args :data_source {:query_id "q-1"} :viz_settings {:chart_type "bar"})
                      {:queries {"q-1" count-by-category}})))
      (is (=? {:error {:class :unrecoverable :code :internal}}
              (invoke "edit_chart"
                      (assoc chart-args :chart_id "c-1" :new_viz_settings {:chart_type "pie"})
                      {}))))))
