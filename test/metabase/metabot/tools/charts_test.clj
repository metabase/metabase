(ns metabase.metabot.tools.charts-test
  "Tests that the chart tools always emit a `generated_entity` card data part, and what the model reads when a call
   fails. The inline-vs-navigate decision now lives on the frontend, so the backend no longer branches on a
   capability."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.test-util :as test-util]
   [metabase.metabot.tools :as metabot.tools]
   [metabase.metabot.tools.charts :as charts]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.charts.edit :as edit-chart-tools]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.recoverable.common :as recoverable.common]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

;; create-chart only needs the query present in queries-state; the link builder
;; json-encodes it and `->frontend-query` passes a non-MBQL 5 value through unchanged,
;; so a stub query is enough to exercise the emission branch without a database.
(def ^:private stub-query
  {:database 1 :type "query" :query {:source-table 1}})

(defn- run-create-chart
  ([]
   (run-create-chart "bar"))
  ([chart-type]
   (let [memory (atom {:state {:queries {"q-1" stub-query}}})]
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
        (is (= stub-query (get-in result [:structured-output :query])))))))

(deftest chart-tools-keep-mbql5-temporal-filter-test
  (testing "the generated_entity part carries a during filter through JSON intact (BOT-1972)"
    (let [date  (meta/field-metadata :checkins :date)
          query (-> (lib/query meta/metadata-provider (meta/table-metadata :checkins))
                    (lib/filter [:during {:lib/uuid (str (random-uuid))} (lib/ref date) "2026-07-01" :month]))
          state {:queries {"q-1" query}
                 :charts  {"c-1" {:chart_id               "c-1"
                                  :query_id               "q-1"
                                  :queries                [query]
                                  :visualization_settings {:chart_type :bar}}}}]
      (doseq [[tool-name run-tool] [["create_chart"
                                     #(test-util/call-tool charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                                                                     :viz_settings {:chart_type "bar"}
                                                                                     :title        "Check-ins in July"
                                                                                     :description  "Check-ins during July 2026."})]
                                    ["edit_chart"
                                     #(test-util/call-tool charts/edit-chart-tool {:chart_id         "c-1"
                                                                                   :new_viz_settings {:chart_type "line"}
                                                                                   :title            "Check-ins in July"
                                                                                   :description      "Check-ins during July 2026."})]]]
        (testing tool-name
          (let [result (binding [shared/*memory-atom* (atom {:state state})]
                         (run-tool))
                sent   (-> result (get-in [:data-parts 0 :data :query :query]) json/encode (json/decode true))]
            (is (= "mbql/query" (:lib/type sent)))
            (is (= (lib/filters query)
                   (-> sent lib/normalize :stages first :filters)))))))))

(deftest create-chart-new-chart-types-test
  (testing "the tool schema accepts newly added chart types"
    (doseq [chart-type ["treemap" "boxplot"]]
      (let [result (run-create-chart chart-type)]
        (is (= (keyword chart-type) (get-in result [:structured-output :chart-type])))
        (is (= chart-type (get-in result [:data-parts 0 :data :display])))))))

(deftest create-chart-query-keeps-date-filter-through-dataset-api-test
  (testing "POST /api/dataset, where the chart in the conversation sends its query, applies its date filter (BOT-1972)"
    (let [mp   (mt/metadata-provider)
          date (lib.metadata/field mp (mt/id :checkins :date))]
      (doseq [[filter-desc filter-clause]
              {"during"
               [:during {:lib/uuid (str (random-uuid))} (lib/ref date) "2014-07-01" :month]
               "between with absolute-datetime bounds"
               (lib/between date (lib/absolute-datetime "2014-07-01" :day) (lib/absolute-datetime "2014-07-31" :day))}]
        (testing filter-desc
          (let [query  (-> (lib/query mp (lib.metadata/table mp (mt/id :checkins)))
                           (lib/filter filter-clause)
                           (lib/aggregate (lib/count)))
                result (binding [shared/*memory-atom* (atom {:state {:queries {"q-1" query}}})]
                         (test-util/call-tool charts/create-chart-tool {:data_source  {:query_id "q-1"}
                                                                        :viz_settings {:chart_type "scalar"}
                                                                        :title        "Check-ins in July 2014"
                                                                        :description  "Check-ins during July 2014."}))
                body   (-> result (get-in [:data-parts 0 :data :query :query]) json/encode json/decode)]
            (is (= (mt/first-row (mt/process-query query))
                   (mt/first-row (mt/user-http-request :crowberto :post 202 "dataset" body))))))))))

(deftest edit-chart-query-fallback-test
  (testing "edit_chart resolves the query from queries-state when chart memory has no query"
    (let [memory (atom {:state   {:queries {"q-1" stub-query}
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
      (is (= stub-query (get-in entity [:query :query])))
      (is (= "pie" (:display entity)))
      (testing "structured-output also carries the resolved query, not just data-parts"
        ;; Regression: edit-chart-tool's :query var (used for data-parts above) came
        ;; from queries-state, but edit-chart's :result — which becomes
        ;; structured-output and is what extract-charts stores into :charts state —
        ;; only looked at the chart's own (here empty) :queries, landing on nil.
        (is (= {:query-id "q-1" :query stub-query}
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
    (is (= {:output (str "Query \"q-9\" was not found. Available query IDs: \"q-1\".\n"
                         "Use an available query ID from this conversation.")
            :error  {:class :recoverable :code ::recoverable.common/unknown-query-id}}
           (invoke "create_chart"
                   (assoc chart-args :data_source {:query_id "q-9"} :viz_settings {:chart_type "bar"})
                   {:queries {"q-1" stub-query}})))))

(deftest edit-chart-unknown-chart-id-test
  (let [chart (fn [chart-id] {:chart_id chart-id :query_id "q-1" :queries [stub-query]})
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
                   {:charts (into {} (map (fn [id] [id {:chart_id id :query_id "q-1" :queries [stub-query]}])) ids)})
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
                                  {:structured-output {:query-id "q-1" :query stub-query :result-columns []}})]
      (is (= {:output (str "Chart type \"histogram\" is not supported. Supported chart types: "
                           (str/join ", " shared/chart-types) ".")
              :error  {:class :recoverable :code ::create-chart-tools/unknown-chart-type}}
             (invoke "construct_notebook_query"
                     (assoc chart-args
                            :query         {:lib/type "mbql/query" :stages []}
                            :visualization {:chart_type "histogram"})
                     {}))))))

(deftest chart-tools-undeclared-failure-test
  (testing "a failure that no error declares ends the turn instead of reaching the model"
    (mt/with-dynamic-fn-redefs [create-chart-tools/create-chart (fn [_] (throw (ex-info "boom" {})))
                                edit-chart-tools/edit-chart     (fn [_] (throw (ex-info "boom" {})))]
      (is (=? {:error {:class :unrecoverable :code :internal}}
              (invoke "create_chart"
                      (assoc chart-args :data_source {:query_id "q-1"} :viz_settings {:chart_type "bar"})
                      {:queries {"q-1" stub-query}})))
      (is (=? {:error {:class :unrecoverable :code :internal}}
              (invoke "edit_chart"
                      (assoc chart-args :chart_id "c-1" :new_viz_settings {:chart_type "pie"})
                      {}))))))
