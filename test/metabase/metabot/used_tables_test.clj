(ns metabase.metabot.used-tables-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.metabot.query-analyzer :as nqa]
   [metabase.metabot.used-tables :as used-tables]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture])
  (:import
   (java.util.concurrent ArrayBlockingQueue CountDownLatch ThreadPoolExecutor TimeUnit)))

(set! *warn-on-reflection* true)

;;; ---------------------------------------- metadata provider helpers ----------------------------------------

(defn- mock-card
  "Build a card map suitable for [[lib.tu/mock-metadata-provider]]."
  ([id query]
   (mock-card id query :question))
  ([id query card-type]
   {:lib/type      :metadata/card
    :id            id
    :name          (str "Card " id)
    :database-id   (meta/id)
    :type          card-type
    :dataset-query query}))

(defn- mp+cards
  "Compose `meta/metadata-provider` with a mock provider containing `cards`."
  [cards]
  (lib.tu/mock-metadata-provider meta/metadata-provider {:cards cards}))

;;; ---------------------------------------- query construction helpers ----------------------------------------

(defn- table-query
  "Query whose first stage's source is `table-id`, attached to `metadata-provider`."
  ([table-id]
   (table-query meta/metadata-provider table-id))
  ([metadata-provider table-id]
   (lib/query metadata-provider (lib.metadata/table metadata-provider table-id))))

(defn- card-query
  "Query whose first stage's source is the given Card, attached to `metadata-provider`."
  [metadata-provider card-id]
  (lib/query metadata-provider (lib.metadata/card metadata-provider card-id)))

(defn- native-query
  "Native query against the test database."
  ([sql]
   (native-query meta/metadata-provider sql))
  ([metadata-provider sql]
   (lib/native-query metadata-provider sql)))

;;; ---------------------------------------- tool-input/output helpers ----------------------------------------

(defn- notebook-input
  "Build a `construct_notebook_query` tool-input part."
  [id]
  {:type      :tool-input
   :id        id
   :function  "construct_notebook_query"
   :arguments {:reasoning "x"}})

(defn- notebook-output
  "Build a `construct_notebook_query` tool-output part with the given query."
  [id query]
  {:type   :tool-output
   :id     id
   :result {:output            "<result>...</result>"
            :structured-output {:query-id "qid"
                                :query    query}}})

(defn- sql-input
  ([id]
   (sql-input id "create_sql_query" {:database_id 1 :sql_query "SELECT 1"}))
  ([id fn-name args]
   {:type      :tool-input
    :id        id
    :function  fn-name
    :arguments args}))

(defn- sql-output
  "Build a SQL tool-output. `query` is an already-constructed native query
  (built via [[native-query]] in the test)."
  [id sql db-id query]
  {:type   :tool-output
   :id     id
   :result {:output            "<result>...</result>"
            :structured-output {:query-id      "qid"
                                :query-content sql
                                :database      db-id
                                :query         query}}})

(defn- table-ids
  "Return the set of `:table_id`s in the resulting rows."
  [rows]
  (into #{} (map :table_id) rows))

;;; ---------------------------------------- empty/no-op (no DB) ----------------------------------------

(deftest ^:parallel empty-parts-returns-nothing-test
  (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 1 []))))

(deftest ^:parallel non-query-tool-skipped-test
  (testing "tool calls outside `query-generation-tool-names` produce no rows"
    (let [parts [{:type      :tool-input
                  :id        "n1"
                  :function  "navigate_user"
                  :arguments {}}
                 {:type   :tool-output
                  :id     "n1"
                  :result {:output            "ok"
                           :structured-output {:query-id "ignored"}}}]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 1 parts))))))

(deftest ^:parallel errored-tool-output-skipped-test
  (testing "tool outputs with :error are dropped even with structured-output"
    (let [parts [(notebook-input "c1")
                 (-> (notebook-output "c1" (table-query (meta/id :orders)))
                     (assoc :error "exploded"))]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 1 parts))))))

(deftest ^:parallel missing-structured-output-skipped-test
  (testing "tool outputs without :structured-output are dropped"
    (let [parts [(notebook-input "c1")
                 {:type   :tool-output
                  :id     "c1"
                  :result {:output "<result>failed</result>"}}]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 1 parts))))))

(deftest ^:parallel orphan-tool-input-skipped-test
  (testing "tool-inputs without a matching tool-output yield no rows"
    (let [parts [(notebook-input "c1")]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 1 parts))))))

;;; ---------------------------------------- notebook ----------------------------------------

(deftest ^:parallel notebook-source-table-test
  (testing "construct_notebook_query with :source-table yields one table row"
    (let [parts [(notebook-input "c1")
                 (notebook-output "c1" (table-query (meta/id :orders)))]
          rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
      (is (= [{:message_id 99
               :table_id   (meta/id :orders)}]
             rows)))))

(deftest ^:parallel notebook-source-card-question-expanded-test
  (testing ":source-card pointing at a question Card collapses to the question's underlying table"
    (let [card-id 1
          mp      (mp+cards [(mock-card card-id (table-query (meta/id :orders)) :question)])
          parts   [(notebook-input "c1")
                   (notebook-output "c1" (card-query mp card-id))]
          rows    (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= [{:message_id 99
               :table_id   (meta/id :orders)}]
             rows)))))

(deftest ^:parallel notebook-source-card-model-expanded-test
  (testing ":source-card pointing at a model Card collapses to the model's underlying table"
    (let [card-id 1
          mp      (mp+cards [(mock-card card-id (table-query (meta/id :orders)) :model)])
          parts   [(notebook-input "c1")
                   (notebook-output "c1" (card-query mp card-id))]
          rows    (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= [{:message_id 99
               :table_id   (meta/id :orders)}]
             rows)))))

(deftest ^:parallel notebook-source-card-metric-expanded-test
  (testing ":source-card pointing at a metric Card collapses to the metric's underlying table"
    (let [card-id 1
          mp      (mp+cards [(mock-card card-id
                                        (-> (table-query (meta/id :orders))
                                            (lib/aggregate (lib/count)))
                                        :metric)])
          parts   [(notebook-input "c1")
                   (notebook-output "c1" (card-query mp card-id))]
          rows    (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= [{:message_id 99
               :table_id   (meta/id :orders)}]
             rows)))))

(deftest ^:parallel notebook-recurses-through-card-on-card-test
  (testing "card A on card B on table T collapses all the way down to T"
    (let [a-id  1
          mp-b  (mp+cards [(mock-card 2 (table-query (meta/id :orders)))])
          mp    (mp+cards [(mock-card 2 (table-query (meta/id :orders)))
                           (mock-card a-id (card-query mp-b 2))])
          parts [(notebook-input "c1")
                 (notebook-output "c1" (card-query mp a-id))]
          rows  (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= [{:message_id 99
               :table_id   (meta/id :orders)}]
             rows)))))

(deftest ^:parallel notebook-deleted-card-warns-test
  (testing "a :source-card id that doesn't exist yields no row and logs a warn"
    (let [card-id   1
          absent-id 2
          mp0       (mp+cards [(mock-card 1 (table-query (meta/id :orders)))
                               (mock-card 2 (table-query (meta/id :products)))])
          ;; query references a card which does not exist in new mock mp
          mp        (mp+cards [(mock-card card-id (card-query mp0 2))])
          parts     [(notebook-input "c1")
                     (notebook-output "c1" (card-query mp card-id))]]
      (log.capture/with-log-messages-for-level [logs [metabase.metabot.used-tables :warn]]
        (let [rows (#'used-tables/extract-used-tables mp 99 parts)]
          (is (= [] rows))
          (is (some #(re-find (re-pattern (str absent-id)) (:message %)) (logs))
              "warn line mentions the missing card id"))))))

;;; ---------------------------------------- nested cards (recursion) ----------------------------------------

(deftest ^:parallel notebook-three-levels-of-nesting-test
  (testing "card -> card -> card -> table collapses all the way down to the table"
    (let [a-id  1
          mp-c  (mp+cards [(mock-card 3 (table-query (meta/id :orders)))])
          mp-b  (mp+cards [(mock-card 3 (table-query (meta/id :orders)))
                           (mock-card 2 (card-query mp-c 3))])
          mp    (mp+cards [(mock-card 3 (table-query (meta/id :orders)))
                           (mock-card 2 (card-query mp-c 3))
                           (mock-card a-id (card-query mp-b 2))])
          parts [(notebook-input "c1")
                 (notebook-output "c1" (card-query mp a-id))]
          rows  (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders)}
             (table-ids rows))))))

(deftest ^:parallel notebook-model-on-question-test
  (testing "a model whose source is a question Card still resolves to the underlying table"
    (let [m-id  1
          mp-q  (mp+cards [(mock-card 2 (table-query (meta/id :orders)))])
          mp    (mp+cards [(mock-card 2 (table-query (meta/id :orders)))
                           (mock-card m-id (card-query mp-q 2) :model)])
          parts [(notebook-input "c1")
                 (notebook-output "c1" (card-query mp m-id))]
          rows  (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders)}
             (table-ids rows))))))

(deftest ^:parallel notebook-question-on-model-test
  (testing "a question whose source is a model resolves to the underlying table"
    (let [q-id  1
          mp-m  (mp+cards [(mock-card 2 (table-query (meta/id :orders)) :model)])
          mp    (mp+cards [(mock-card 2 (table-query (meta/id :orders)) :model)
                           (mock-card q-id (card-query mp-m 2))])
          parts [(notebook-input "c1")
                 (notebook-output "c1" (card-query mp q-id))]
          rows  (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders)}
             (table-ids rows))))))

(deftest ^:parallel notebook-multi-stage-source-table-test
  (testing "a query with multiple stages still surfaces the first-stage :source-table"
    (let [query (-> (table-query (meta/id :orders))
                    (lib/aggregate (lib/count))
                    lib/append-stage)
          parts [(notebook-input "c1")
                 (notebook-output "c1" query)]
          rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
      (is (= #{(meta/id :orders)}
             (table-ids rows))))))

;;; ---------------------------------------- joins ----------------------------------------

(deftest ^:parallel notebook-explicit-join-against-table-test
  (testing "an explicit join against another table surfaces both the source and joined tables"
    (let [mp    meta/metadata-provider
          query (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                    (lib/join (lib.metadata/table mp (meta/id :people))))
          parts [(notebook-input "c1")
                 (notebook-output "c1" query)]
          rows  (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :people)}
             (table-ids rows))))))

(deftest ^:parallel notebook-explicit-join-against-card-test
  (testing "an explicit join against a question Card surfaces both the source table and the card's underlying table"
    (let [card-id 1
          mp      (mp+cards [(mock-card card-id (table-query (meta/id :people)))])
          query   (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                      (lib/join (lib.metadata/card mp card-id)))
          parts   [(notebook-input "c1")
                   (notebook-output "c1" query)]
          rows    (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :people)}
             (table-ids rows))))))

(deftest ^:parallel notebook-explicit-join-against-model-test
  (testing "an explicit join against a model Card surfaces both the source table and the model's underlying table"
    (let [model-id 1
          mp       (mp+cards [(mock-card model-id (table-query (meta/id :people)) :model)])
          query    (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                       (lib/join (lib.metadata/card mp model-id)))
          parts    [(notebook-input "c1")
                    (notebook-output "c1" query)]
          rows     (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :people)}
             (table-ids rows))))))

(deftest ^:parallel notebook-recurses-into-card-with-joins-test
  (testing "recursing into a Card whose own query has joins picks up all of the card's tables"
    (let [card-query-with-join (-> (table-query (meta/id :orders))
                                   (lib/join (lib.metadata/table meta/metadata-provider (meta/id :people))))
          card-id              1
          mp                   (mp+cards [(mock-card card-id card-query-with-join)])
          parts                [(notebook-input "c1")
                                (notebook-output "c1" (card-query mp card-id))]
          rows                 (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :people)}
             (table-ids rows))))))

(deftest ^:parallel notebook-source-table-with-join-to-card-on-card-test
  (testing "an outer query with both :source-table and a join to a chain of cards captures everything"
    (let [mid-id  1
          mp-leaf (mp+cards [(mock-card 2 (table-query (meta/id :people)))])
          mp      (mp+cards [(mock-card 2 (table-query (meta/id :people)))
                             (mock-card mid-id (card-query mp-leaf 2))])
          query   (-> (lib/query mp (lib.metadata/table mp (meta/id :orders)))
                      (lib/join (lib.metadata/card mp mid-id)))
          parts   [(notebook-input "c1")
                   (notebook-output "c1" query)]
          rows    (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :people)}
             (table-ids rows))))))

(deftest ^:parallel notebook-implicit-join-via-source-field-breakout-test
  (testing "a breakout with :source-field (implicit join) surfaces the joined table"
    (let [base    (-> (table-query (meta/id :orders))
                      (lib/aggregate (lib/count)))
          ;; pick the implicitly-joinable products.category column reachable
          ;; via the FK orders.product_id -> products.id
          cat-col (m/find-first #(= (:id %) (meta/id :products :category))
                                (lib/breakoutable-columns base))
          query   (lib/breakout base cat-col)
          parts   [(notebook-input "c1")
                   (notebook-output "c1" query)]
          rows    (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :products)}
             (table-ids rows))))))

(deftest ^:parallel notebook-implicit-join-via-source-field-filter-test
  (testing "an implicit-join field reference inside a filter clause also surfaces the joined table"
    (let [base    (table-query (meta/id :orders))
          cat-col (m/find-first #(= (:id %) (meta/id :products :category))
                                (lib/filterable-columns base))
          query   (lib/filter base (lib/= cat-col "Widget"))
          parts   [(notebook-input "c1")
                   (notebook-output "c1" query)]
          rows    (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :products)}
             (table-ids rows))))))

(deftest ^:parallel notebook-implicit-join-inside-nested-card-test
  (testing "implicit joins inside a recursively-walked card's dataset_query also surface"
    (let [base    (-> (table-query (meta/id :orders))
                      (lib/aggregate (lib/count)))
          cat-col (m/find-first #(= (:id %) (meta/id :products :category))
                                (lib/breakoutable-columns base))
          inner   (lib/breakout base cat-col)
          card-id 1
          mp      (mp+cards [(mock-card card-id inner)])
          parts   [(notebook-input "c1")
                   (notebook-output "c1" (card-query mp card-id))]
          rows    (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(meta/id :orders) (meta/id :products)}
             (table-ids rows))))))

;;; ---------------------------------------- native (SQL) ----------------------------------------

(deftest ^:parallel sql-extracts-native-tables-test
  (testing "native SQL is parsed and the underlying tables come through"
    (let [order-id (meta/id :orders)
          sql      "SELECT * FROM orders"]
      (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _]
                                                          {:tables [{:table-id order-id}]})]
        (let [parts [(sql-input "s1" "create_sql_query" {:database_id (meta/id) :sql_query sql})
                     (sql-output "s1" sql (meta/id) (native-query sql))]
              rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
          (is (= [{:message_id 99
                   :table_id   order-id}]
                 rows)))))))

(deftest ^:parallel sql-template-tag-card-expanded-test
  (testing "card-type template tag in native SQL recursively expands to its underlying table"
    (let [card-id 1
          mp      (mp+cards [(mock-card card-id (table-query (meta/id :orders)))])]
      (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _] {:tables []})]
        (let [;; `{{#N}}` syntax produces a card-type template tag with :card-id N
              sql   (format "SELECT * FROM {{#%s}}" card-id)
              parts [(sql-input "s1" "create_sql_query" {:database_id (meta/id) :sql_query sql})
                     (sql-output "s1" sql (meta/id) (native-query mp sql))]
              rows  (#'used-tables/extract-used-tables mp 99 parts)]
          (is (some #(= % {:message_id 99
                           :table_id   (meta/id :orders)})
                    rows)))))))

(deftest ^:parallel sql-template-tag-native-card-test
  (testing "template tag pointing at a native-query card recurses and parses the inner SQL"
    (let [orders-id    (meta/id :orders)
          people-id    (meta/id :people)
          inner-sql    "SELECT * FROM people"
          inner-tables (atom nil)
          card-id      1
          ;; build the inner native query attached to the base provider, then mock the card
          inner-query  (native-query inner-sql)
          mp           (mp+cards [(mock-card card-id inner-query)])
          ;; outer SQL must contain the `{{#N}}` template tag for the card so that
          ;; `lib/native-query` auto-extracts a card-type tag pointing at the card
          outer-sql    (format "SELECT * FROM {{#%s}}" card-id)]
      (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [query & _]
                                                          ;; production extractor passes a query, not raw SQL
                                                          (let [sql (lib/raw-native-query query)]
                                                            (cond
                                                              (= sql outer-sql) {:tables [{:table-id orders-id}]}
                                                              (= sql inner-sql) (do (reset! inner-tables true)
                                                                                    {:tables [{:table-id people-id}]})
                                                              :else             {:tables []})))]
        (let [parts [(sql-input "s1" "create_sql_query"
                                {:database_id (meta/id) :sql_query outer-sql})
                     (sql-output "s1" outer-sql (meta/id) (native-query mp outer-sql))]
              rows  (#'used-tables/extract-used-tables mp 99 parts)]
          (is (true? @inner-tables) "sql parser was invoked on the inner card's native SQL")
          (is (= #{orders-id people-id}
                 (table-ids rows))
              "outer and inner native tables both make it into the result"))))))

(deftest ^:parallel sql-parse-error-logged-test
  (testing "tables-for-native error yields no rows and logs a warn"
    (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _]
                                                        {:error :query-analysis.error/parse-failed})]
      (let [sql   "SELEKT bad"
            parts [(sql-input "s1" "create_sql_query" {:database_id (meta/id) :sql_query sql})
                   (sql-output "s1" sql (meta/id) (native-query sql))]]
        (log.capture/with-log-messages-for-level [logs [metabase.metabot.used-tables :warn]]
          (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)))
          (is (some #(re-find #"tables-for-native error" (:message %)) (logs))))))))

;;; ---------------------------------------- native (SQL) — real tables-for-native ----------------------------------
;;;
;;; The tests above all stub `nqa/tables-for-native` to isolate the extractor logic from the sql parser. These two
;;; tests run the real parser end-to-end against the H2 test-data DB so we catch integration issues. They need the
;;; real application DB metadata provider, so they cannot be `^:parallel`.

(deftest sql-real-tables-for-native-join-with-where-test
  (testing "real tables-for-native against a plain JOIN + WHERE: both tables come through end-to-end"
    (let [sql   "SELECT o.id FROM orders o JOIN products p ON o.product_id = p.id WHERE p.category = 'Widget'"
          mp    (mt/metadata-provider)
          parts [(sql-input "s1" "create_sql_query" {:database_id (mt/id) :sql_query sql})
                 (sql-output "s1" sql (mt/id) (lib/native-query mp sql))]
          rows  (#'used-tables/extract-used-tables mp 99 parts)]
      (is (= #{(mt/id :orders) (mt/id :products)}
             (table-ids rows))))))

(deftest sql-real-tables-for-native-with-card-template-tag-test
  (testing "real tables-for-native against SQL that references a saved card via {{#card-id}} template tag"
    (mt/with-temp [:model/Card {card-id :id}
                   {:type          :question
                    :database_id   (mt/id)
                    :dataset_query (let [mp (mt/metadata-provider)]
                                     (lib/query mp (lib.metadata/table mp (mt/id :products))))}]
      (let [tag-name (str "#" card-id)
            sql      (format "SELECT * FROM orders WHERE product_id IN (SELECT id FROM {{%s}})" tag-name)
            mp       (mt/metadata-provider)
            parts    [(sql-input "s1" "create_sql_query" {:database_id (mt/id) :sql_query sql})
                      (sql-output "s1" sql (mt/id) (lib/native-query mp sql))]
            rows     (#'used-tables/extract-used-tables mp 99 parts)]
        (is (= #{(mt/id :orders) (mt/id :products)}
               (table-ids rows)))))))

;;; ---------------------------------------- transforms ----------------------------------------

(defn- transform-sql-input
  "Build a `write_transform_sql` tool-input part."
  ([id]
   (transform-sql-input id {}))
  ([id arguments]
   {:type      :tool-input
    :id        id
    :function  "write_transform_sql"
    :arguments (merge {:database_id 1
                       :edit_action {:mode "replace" :new_content "SELECT 1"}}
                      arguments)}))

(defn- transform-sql-output
  "Build a `write_transform_sql` tool-output part."
  [id db-id query]
  {:type   :tool-output
   :id     id
   :result {:output "ok"
            :structured-output
            {:transform {:id          nil
                         :name        "T"
                         :description ""
                         :target      {:type "table" :name "" :database db-id :schema nil}
                         :source      {:type  "query"
                                       :query query}}
             :thinking  "x"
             :message   "Transform SQL updated successfully."}}})

(defn- transform-python-input
  "Build a `write_transform_python` tool-input part with the given `source_tables` entries."
  [id source-tables]
  {:type      :tool-input
   :id        id
   :function  "write_transform_python"
   :arguments {:transform_name "T"
               :edit_action    {:mode "replace" :new_content "def transform(): pass"}
               :source_tables  (vec source-tables)}})

(defn- transform-python-output
  "Build a `write_transform_python` tool-output.
  The structured `:transform`is intentionally sparse.
  Extraction reads `:source_tables` from the *arguments*, not from the structured output."
  [id]
  {:type   :tool-output
   :id     id
   :result {:output            "ok"
            :structured-output {:transform {:source {:type "python"}}
                                :thinking  "x"
                                :message   "Transform Python updated successfully."}}})

(deftest ^:parallel transform-sql-extracts-tables-from-structured-output-test
  (testing "write_transform_sql walks the suggested transform's native query"
    (let [orders-id (meta/id :orders)
          sql       "SELECT * FROM orders"]
      (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _] {:tables [{:table-id orders-id}]})]
        (let [parts [(transform-sql-input "t1")
                     (transform-sql-output "t1" (meta/id) (native-query sql))]
              rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
          (is (= [{:message_id 99 :table_id orders-id}]
                 rows)))))))

(deftest ^:parallel transform-sql-defensively-reads-source-tables-arg-test
  (testing "write_transform_sql also picks up `:source_tables` from arguments when present"
    (let [orders-id (meta/id :orders)
          people-id (meta/id :people)
          sql       "SELECT * FROM orders"]
      (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _] {:tables [{:table-id orders-id}]})]
        (let [parts [(transform-sql-input "t1"
                                          {:source_tables [{:alias "o" :table_id orders-id
                                                            :schema "PUBLIC" :database_id (meta/id)}
                                                           {:alias "p" :table_id people-id
                                                            :schema "PUBLIC" :database_id (meta/id)}]})
                     (transform-sql-output "t1" (meta/id) (native-query sql))]
              rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
          (is (= #{orders-id people-id}
                 (table-ids rows))
              "sql parsed `orders` and arg-declared `people` both surface, deduped")
          (is (= 2 (count rows))))))))

(deftest ^:parallel transform-sql-errored-output-skipped-test
  (testing "an errored write_transform_sql output yields no rows"
    (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _] {:tables [{:table-id (meta/id :orders)}]})]
      (let [parts [(transform-sql-input "t1")
                   (-> (transform-sql-output "t1" (meta/id) (native-query "SELECT 1"))
                       (assoc :error "boom"))]]
        (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)))))))

(deftest ^:parallel transform-sql-without-query-source-yields-nothing-test
  (testing "no rows if the suggested transform has no [:source :query] or :source_tables"
    (let [parts [(transform-sql-input "t1")
                 {:type   :tool-output
                  :id     "t1"
                  :result {:output            "ok"
                           :structured-output {:transform {:source {:type "query"}}
                                               :thinking  "x"
                                               :message   "ok"}}}]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 99 parts))))))

(deftest ^:parallel transform-python-extracts-declared-source-tables-test
  (testing "write_transform_python yields one row per declared `:source_tables` entry"
    (let [orders-id (meta/id :orders)
          people-id (meta/id :people)
          parts [(transform-python-input
                  "t1"
                  [{:alias "o" :table_id orders-id :schema "PUBLIC" :database_id (meta/id)}
                   {:alias "p" :table_id people-id :schema "PUBLIC" :database_id (meta/id)}])
                 (transform-python-output "t1")]
          rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
      (is (= #{orders-id people-id}
             (table-ids rows)))
      (is (= 2 (count rows))))))

(deftest ^:parallel transform-python-empty-source-tables-yields-nothing-test
  (testing "write_transform_python with an empty source_tables list yields no rows"
    (let [parts [(transform-python-input "t1" [])
                 (transform-python-output "t1")]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 99 parts))))))

(deftest ^:parallel transform-python-errored-output-skipped-test
  (testing "an errored write_transform_python output yields no rows, even if arguments declare tables"
    (let [parts [(transform-python-input
                  "t1"
                  [{:alias "o" :table_id (meta/id :orders) :schema "PUBLIC" :database_id (meta/id)}])
                 (-> (transform-python-output "t1")
                     (assoc :error "boom"))]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 99 parts))))))

(deftest ^:parallel transform-python-orphan-input-yields-nothing-test
  (testing "a write_transform_python tool-input without a matching tool-output yields no rows"
    (let [parts [(transform-python-input
                  "t1"
                  [{:alias "o" :table_id (meta/id :orders) :schema "PUBLIC" :database_id (meta/id)}])]]
      (is (= [] (#'used-tables/extract-used-tables meta/metadata-provider 99 parts))))))

;;; ---------------------------------------- combined tool calls ----------------------------------------

(deftest ^:parallel notebook-and-sql-tool-calls-combine-test
  (testing "a turn that mixes construct_notebook_query with create_sql_query yields the union of their tables"
    (let [orders-id (meta/id :orders)
          people-id (meta/id :people)
          sql       "SELECT * FROM people"]
      (mt/with-dynamic-fn-redefs [nqa/tables-for-native (fn [_ & _]
                                                          {:tables [{:table-id people-id}]})]
        (let [parts [(notebook-input "n1")
                     (notebook-output "n1" (table-query orders-id))
                     (sql-input "s1" "create_sql_query" {:database_id (meta/id) :sql_query sql})
                     (sql-output "s1" sql (meta/id) (native-query sql))]
              rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
          (is (= #{orders-id people-id}
                 (table-ids rows))))))))

(deftest ^:parallel cross-pair-card-resolved-once-test
  (testing "a card referenced from multiple tool-call pairs is resolved at most once per extraction"
    (let [c-id  1
          mp    (mp+cards [(mock-card c-id (table-query (meta/id :orders)))])
          parts [(notebook-input "n1")
                 (notebook-output "n1" (card-query mp c-id))
                 (notebook-input "n2")
                 (notebook-output "n2" (card-query mp c-id))
                 (notebook-input "n3")
                 (notebook-output "n3" (card-query mp c-id))]
          calls (atom [])
          orig  (mt/original-fn #'used-tables/card-query)]
      (mt/with-dynamic-fn-redefs [used-tables/card-query (fn [m cid]
                                                           (swap! calls conj cid)
                                                           (orig m cid))]
        (let [rows (#'used-tables/extract-used-tables mp 99 parts)]
          (is (= [{:message_id 99
                   :table_id   (meta/id :orders)}]
                 rows))
          (is (= [c-id] @calls)))))))

;;; ---------------------------------------- dedupe / stamping ----------------------------------------

(deftest ^:parallel dedupes-within-message-test
  (testing "two notebook tool calls referencing the same table yield a single row"
    (let [parts [(notebook-input "c1")
                 (notebook-output "c1" (table-query (meta/id :orders)))
                 (notebook-input "c2")
                 (notebook-output "c2" (table-query (meta/id :orders)))]
          rows  (#'used-tables/extract-used-tables meta/metadata-provider 99 parts)]
      (is (= [{:message_id 99
               :table_id   (meta/id :orders)}]
             rows)))))

(deftest ^:parallel stamps-message-id-test
  (testing "every returned row has :message_id set to the value passed in"
    (let [parts [(notebook-input "c1")
                 (notebook-output "c1" (table-query (meta/id :orders)))
                 (notebook-input "c2")
                 (notebook-output "c2" (table-query (meta/id :people)))]
          rows  (#'used-tables/extract-used-tables meta/metadata-provider 42 parts)]
      (is (every? #(= 42 (:message_id %)) rows))
      (is (= 2 (count rows))))))

;;; ---------------------------------------- prometheus metrics ----------------------------------------
;;; `extract-used-tables-with-timing!` wraps the 2-arity entry point. We redef `extract-used-tables` to isolate the
;;; wrapper's metric contract from query analysis. One shared `with-prometheus-system!` (it's slow to set up); metrics
;;; are cleared between `testing` blocks so each starts from zero. Not `^:parallel` (installs a reporter, redefs a var).

(def ^:private extraction-metrics
  [:metabase-metabot/used-tables-extraction-total
   :metabase-metabot/used-tables-extraction-errors
   :metabase-metabot/used-tables-extraction-duration-ms
   :metabase-metabot/used-tables-extraction-warnings
   :metabase-metabot/used-tables-extraction-dropped
   :metabase-metabot/used-tables-extraction-timeouts])

(deftest extraction-metrics-test
  (mt/with-prometheus-system! [_ system]
    ;; mt/with-prometheus-system! is slow, so combine all test in a single deftest and clear! metrics between cases.
    (let [reset! #(run! prometheus/clear! extraction-metrics)]
      (testing "extract-used-tables-with-timing! increments the total counter, leaves errors at 0, and returns the body"
        (mt/with-dynamic-fn-redefs [used-tables/extract-used-tables (fn [_message-id _parts] [::row])]
          (is (= [::row] (#'used-tables/extract-used-tables-with-timing! 1 [])))
          (is (= 1.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-total)))
          (is (= 0.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-errors)))))
      (reset!)
      (testing "extract-used-tables-with-timing! increments the errors counter and rethrows when extraction throws"
        (mt/with-dynamic-fn-redefs [used-tables/extract-used-tables (fn [_message-id _parts] (throw (ex-info "boom" {})))]
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"boom"
                                (#'used-tables/extract-used-tables-with-timing! 1 [])))
          (is (= 1.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-total)))
          (is (= 1.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-errors)))))
      (reset!)
      (testing "extract-used-tables-with-timing! observes the duration histogram"
        (mt/with-dynamic-fn-redefs [used-tables/extract-used-tables (fn [_message-id _parts] (Thread/sleep 1) [])]
          (#'used-tables/extract-used-tables-with-timing! 1 [])
          (is (pos? (:sum (mt/metric-value system :metabase-metabot/used-tables-extraction-duration-ms))))))
      (reset!)
      (testing "caught exception increments the warnings counter (by :reason) without touching errors"
        ;; query references a card absent from the provider -> card-query warns :card-missing and recovers (no rows)
        (let [mp0   (mp+cards [(mock-card 1 (table-query (meta/id :orders)))
                               (mock-card 2 (table-query (meta/id :products)))])
              mp    (mp+cards [(mock-card 1 (card-query mp0 2))])
              parts [(notebook-input "c1")
                     (notebook-output "c1" (card-query mp 1))]]
          (is (= [] (#'used-tables/extract-used-tables mp 99 parts)))
          (is (= 0.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-errors)))
          (is (= 1.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-warnings
                                      {:reason :card-missing})))))
      (reset!)
      (testing "record-used-tables! drops the task (counter + warning, no throw) when the bounded queue is full"
        ;; Saturate a real bounded pool sized 1 thread + 1 queue slot. With corePoolSize=1 the first submission
        ;; is handed straight to the (only) worker, which parks on `release`; the second fills the single queue
        ;; slot; the third can be neither run nor queued, so the default AbortPolicy rejects it -> dropped.
        (let [release (CountDownLatch. 1)
              full    (ThreadPoolExecutor. 1 1 0 TimeUnit/MILLISECONDS (ArrayBlockingQueue. 1))]
          (with-redefs [used-tables/waiter-executor    (delay full)
                        used-tables/extract-and-insert! (fn [_ _] (.await release))]
            (try
              (log.capture/with-log-messages-for-level [messages [metabase.metabot.used-tables :warn]]
                (used-tables/record-used-tables! 1 [])         ; accepted: runs, parks on `release`
                (used-tables/record-used-tables! 2 [])         ; accepted: occupies the lone queue slot
                (is (nil? (used-tables/record-used-tables! 3 []))) ; rejected: nowhere to run or queue
                (is (= 1.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-dropped)))
                (is (some #(re-find #"queue full" (:message %)) (messages))))
              (finally
                ;; `shutdownNow` before releasing the latch, so the queued task 2 is drained without ever running.
                ;; Await termination inside `with-redefs`: a task still in flight when the redefs unwind would hit
                ;; the real `extract-and-insert!`, whose failure path can bump the errors counter after the next
                ;; testing block has reset the metrics.
                (.shutdownNow full)
                (.countDown release)
                (is (.awaitTermination full 2 TimeUnit/SECONDS)))))))
      (reset!)
      (testing "extract-used-tables-with-timing! counts a timeout, warns, and returns nil when extraction exceeds the cap"
        ;; Shrink extraction-timeout-ms and make extraction outlast it: the async path's `.get` times out, the worker
        ;; future is cancelled, and the wrapper swallows the TimeoutException (counter + warning, returns nil).
        (with-redefs [used-tables/extraction-timeout-ms 50]
          (mt/with-dynamic-fn-redefs [used-tables/extract-used-tables (fn [_message-id _parts]
                                                                        (Thread/sleep 10000)
                                                                        [::never])]
            (log.capture/with-log-messages-for-level [messages [metabase.metabot.used-tables :warn]]
              (is (nil? (#'used-tables/extract-used-tables-with-timing! 1 [])))
              (is (= 1.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-timeouts)))
              (is (= 0.0 (mt/metric-value system :metabase-metabot/used-tables-extraction-errors)))
              (is (some #(re-find #"exceeded the .* timeout" (:message %)) (messages))))))))))
