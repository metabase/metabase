(ns metabase.metabot.tools.explore-table-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.api-scope.core :as api-scope]
   [metabase.jev.client :as jev]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.tools.construct :as construct]
   [metabase.metabot.tools.explore-table :as explore-table]
   [metabase.metabot.tools.shared :as shared]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(deftest ^:parallel output-schema-test
  (is (mr/validate self.core/LLMRequestOpts {:schema @#'explore-table/output-schema})))

(defn- jev-answers
  "A fake `jev/ask` answering each candidate question from `by-candidate`, a map of candidate text to
  `{:answerable :insight :orientation :angle}`."
  [by-candidate]
  (fn [state questions _opts]
    (let [candidates (:candidates state)]
      {:ok      true
       :answers (into {}
                      (map (fn [[id {:keys [type instructions]}]]
                             (let [i       (parse-long (second (re-find #"candidates\[(\d+)\]" instructions)))
                                   answers (by-candidate (nth candidates i))]
                               [id (case type
                                     "noul"   {:noul (:answerable answers)}
                                     "choice" {:choice (name (:angle answers))}
                                     "score"  {:score (if (str/includes? instructions "never seen")
                                                        (:orientation answers)
                                                        (:insight answers))})])))
                      questions)})))

(deftest select-ideas-test
  (let [judged {"Revenue by month"            {:answerable 0.9 :insight 2.5 :orientation 3 :angle :trend}
                "Revenue by week"             {:answerable 0.9 :insight 2.4 :orientation 3 :angle :trend}
                "Revenue by quarter"          {:answerable 0.9 :insight 2.3 :orientation 3 :angle :trend}
                "Revenue by year"             {:answerable 0.9 :insight 2.2 :orientation 3 :angle :trend}
                "Revenue by product category" {:answerable 0.9 :insight 2   :orientation 2 :angle :join}
                "Profit margin by state"      {:answerable 0.1 :insight 3   :orientation 3 :angle :breakdown}
                "How many rows are there?"    {:answerable 1.0 :insight 0.2 :orientation 2 :angle :distribution}
                "Orders by status"            {:answerable 0.9 :insight 1.5 :orientation 3 :angle :breakdown}
                "Top customers by spend"      {:answerable 0.8 :insight 3   :orientation 0 :angle :ranking}}]
    (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                jev/ask          (jev-answers judged)]
      (let [ideas (with-redefs [explore-table/keep-count 5]
                    (#'explore-table/select-ideas {} (vec (keys judged)) :basics))]
        (testing "unanswerable and trivial ideas are dropped"
          (is (not-any? #{"Profit margin by state" "How many rows are there?"} (map :prompt ideas))))
        (testing "the best idea of each angle is kept over a better-ranked second idea of one angle, and the
                  kept ideas are ranked best first"
          (is (= ["Revenue by month" "Revenue by week" "Orders by status" "Revenue by product category"
                  "Top customers by spend"]
                 (map :prompt ideas)))))
      (testing "deeper keeps only revealing ideas and ranks by insight"
        (is (= ["Revenue by month" "Revenue by week" "Revenue by quarter" "Revenue by year" "Orders by status"
                "Revenue by product category" "Top customers by spend"]
               (map :prompt (#'explore-table/select-ideas {} (vec (keys judged)) :basics))))
        (is (= ["Revenue by month" "Revenue by week" "Revenue by quarter" "Top customers by spend"
                "Revenue by year" "Revenue by product category"]
               (map :prompt (#'explore-table/select-ideas {} (vec (keys judged)) :deeper))))))
    (testing "a failed dimension falls back to its default instead of emptying the ideas"
      (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                  jev/ask          (constantly {:ok false :error "unavailable"})]
        (is (= ["A" "B"] (map :prompt (#'explore-table/select-ideas {} ["A" "B"] :basics))))))
    (testing "without Jev, the first candidates are kept as generated"
      (mt/with-dynamic-fn-redefs [jev/key-present? (constantly false)]
        (is (= (map str (range 9)) (map :prompt (#'explore-table/select-ideas {} (mapv str (range 20)) :basics))))))))

(deftest ^:parallel plan-test
  (let [ideas (map (fn [[prompt angle]]
                     (cond-> {:prompt prompt :angle angle}
                       (= :relationship angle) (assoc :recipe {:measure ["db" "s" "t" "total"]
                                                               :group-by ["db" "s" "t" "discount"]})))
                   [["Top customers" :ranking] ["Spread of totals" :distribution] ["Revenue by month" :trend]
                    ["Revenue by category" :join] ["Orders by state" :breakdown] ["Discount vs total" :relationship]
                    ["Orders by source" :breakdown] ["Quantity by month" :trend]])
        {:keys [build offer]} (#'explore-table/plan ideas)]
    (testing "charts are built in story order, one per angle before any angle's second, skipping distributions"
      (is (= [["Revenue by month" :line] ["Quantity by month" :line] ["Orders by state" :bar] ["Top customers" :row]
              ["Revenue by category" :bar] ["Discount vs total" :scatter]]
             (map (juxt :prompt :chart) build))))
    (testing "the rest are offered best first"
      (is (= ["Spread of totals" "Orders by source"] (map :prompt offer))))))

(defn- idea
  "A generated idea as the model returns it."
  [question aggregation measure group-by time-unit]
  {:question    question
   :title       question
   :aggregation aggregation
   :measure     (or measure "")
   :group_by    group-by
   :time_unit   (or time-unit "")})

(def ^:private ideas
  [(idea "Orders by month" "count" nil "ORDERS.CREATED_AT" "month")
   (idea "Revenue by product category" "sum" "ORDERS.TOTAL" "PRODUCTS.CATEGORY" nil)
   (idea "Orders by favorite color" "count" nil "ORDERS.FAVORITE_COLOR" nil)])

(defn- fake-construct
  "A stand-in for the notebook query tool that records the queries it is handed and charts each one."
  [queries]
  (fn [{:keys [query]}]
    (let [n (count (swap! queries conj query))]
      {:structured-output {:query-id (str "q" n) :query query :chart-id (str "c" n) :chart-type :bar}
       :data-parts        [{:type :data :data-type "generated_entity" :data {:id (str "c" n)}}]})))

(defmacro ^:private with-explore-fakes
  "Run `body` with Jev off, the generator answering `ideas`, charting allowed, and the notebook query tool faked."
  [[llm-input queries memory] & body]
  `(mt/with-dynamic-fn-redefs [jev/key-present?          (constantly false)
                               self/call-llm-structured  (fn [_model# messages# & _#]
                                                           (reset! ~llm-input messages#)
                                                           {:ideas ideas})
                               construct/construct-notebook-query-tool (fake-construct ~queries)]
     (binding [scope/*current-user-scope* api-scope/unrestricted
               shared/*memory-atom*       ~memory]
       ~@body)))

(deftest explore-table-tool-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [llm-input (atom nil)
          queries   (atom [])
          memory    (atom {})
          field     (fn [table column opts] ["field" opts [(:name (mt/db)) "PUBLIC" table column]])]
      (with-explore-fakes [llm-input queries memory]
        (let [{:keys [output data-parts structured-output]} (explore-table/explore-table-tool {:table_id (mt/id :orders)})]
          (testing "the table's foreign-key neighbours are part of the context"
            (is (= #{"People" "Products"} (set (map :name (:joinable-tables structured-output)))))
            (is (str/includes? (:content (last @llm-input)) ":ref \"PRODUCTS\"")))
          (testing "an idea naming a column the tables do not have is dropped"
            (is (not-any? #{"Orders by favorite color"}
                          (map :prompt (concat (:build structured-output) (:offer structured-output))))))
          (testing "recipes compile to portable queries: a time grouping in order, a breakdown largest first"
            (is (= [{:lib/type "mbql/query"
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table [(:name (mt/db)) "PUBLIC" "ORDERS"]
                                 :aggregation  [["count" {}]]
                                 :breakout     [(field "ORDERS" "CREATED_AT" {:temporal-unit "month"})]
                                 :order-by     [["asc" {} (field "ORDERS" "CREATED_AT" {:temporal-unit "month"})]]}]}
                    {:lib/type "mbql/query"
                     :stages   [{:lib/type     "mbql.stage/mbql"
                                 :source-table [(:name (mt/db)) "PUBLIC" "ORDERS"]
                                 :aggregation  [["sum" {} (field "ORDERS" "TOTAL" {})]]
                                 :breakout     [(field "PRODUCTS" "CATEGORY" {})]
                                 :order-by     [["desc" {} ["aggregation" {} 0]]]
                                 :limit        20}]}]
                   (sort-by #(-> % :stages first :aggregation ffirst) @queries))))
          (testing "the charts stream to the client and are remembered for later turns"
            (is (= 2 (count data-parts)))
            (is (= #{"c1" "c2"} (set (keys (get-in @memory [:state :charts]))))))
          (is (str/includes? output "<charted>"))
          (is (not (str/includes? output "<offer_next>")))))
      (testing "already explored ideas are passed to the generator and never suggested again"
        (with-explore-fakes [llm-input (atom []) memory]
          (let [{:keys [structured-output]} (explore-table/explore-table-tool
                                             {:table_id         (mt/id :orders)
                                              :depth            "deeper"
                                              :already_explored ["orders by month"]})]
            (is (= ["Revenue by product category"] (map :prompt (:build structured-output))))
            (is (str/includes? (:content (last @llm-input)) "- orders by month"))
            (is (str/includes? (:content (first @llm-input)) "go past them")))))
      (testing "without permission to create notebook queries, every idea is offered instead of charted"
        (with-explore-fakes [llm-input (atom []) memory]
          (binding [scope/*current-user-scope* #{}]
            (let [{:keys [structured-output]} (explore-table/explore-table-tool {:table_id (mt/id :orders)})]
              (is (empty? (:build structured-output)))
              (is (= 2 (count (:offer structured-output)))))))))))

(deftest explore-table-progress-test
  (mt/with-current-user (mt/user->id :crowberto)
    (let [judged  {"Orders by month"             {:answerable 0.9 :insight 2.5 :orientation 3 :angle :trend}
                   "Revenue by product category" {:answerable 0.1 :insight 3   :orientation 3 :angle :join}}
          reports (atom [])]
      (with-explore-fakes [(atom nil) (atom []) (atom {})]
        (mt/with-dynamic-fn-redefs [jev/key-present? (constantly true)
                                    jev/ask          (jev-answers judged)]
          (binding [self.core/*tool-progress* #(swap! reports conj (get-in % [:data :ideas]))]
            (explore-table/explore-table-tool {:table_id (mt/id :orders)}))))
      (let [statuses (fn [ideas] (into {} (map (juxt :prompt (juxt :status :reason))) ideas))]
        (is (= [{"Orders by month"             ["considering" nil]
                 "Revenue by product category" ["considering" nil]}
                {"Orders by month"             ["considering" nil]
                 "Revenue by product category" ["dropped" "Not answerable from these columns"]}
                {"Orders by month"             ["considering" "Charting"]
                 "Revenue by product category" ["dropped" "Not answerable from these columns"]}
                {"Orders by month"             ["kept" "Charted"]
                 "Revenue by product category" ["dropped" "Not answerable from these columns"]}]
               (map statuses @reports)))))))

(deftest explore-table-tool-permissions-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-no-data-perms-for-all-users!
      (mt/with-dynamic-fn-redefs [self/call-llm-structured (fn [& _] (throw (ex-info "should not be called" {})))]
        (is (str/starts-with? (:output (explore-table/explore-table-tool {:table_id (mt/id :orders)}))
                              "Failed to explore table"))))))
