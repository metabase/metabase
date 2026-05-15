(ns metabase.metabot.used-tables-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.metabot.query-analyzer :as nqa]
   [metabase.metabot.used-tables :as used-tables]
   [metabase.test :as mt]
   [metabase.util.log.capture :as log.capture]))

(set! *warn-on-reflection* true)

(defn- notebook-input
  "Build a `construct_notebook_query` tool-input part."
  [id]
  {:type      :tool-input
   :id        id
   :function  "construct_notebook_query"
   :arguments {:reasoning "x"}})

(defn- notebook-output
  "Build a `construct_notebook_query` tool-output part with the given MBQL 5 query."
  [id query]
  {:type   :tool-output
   :id     id
   :result {:output            "<result>...</result>"
            :structured-output {:query-id "qid"
                                :query    query}}})

(defn- sql-input
  ([id] (sql-input id "create_sql_query" {:database_id 1 :sql_query "SELECT 1"}))
  ([id fn-name args]
   {:type :tool-input :id id :function fn-name :arguments args}))

(defn- sql-output
  [id sql db-id & {:keys [template-tags]}]
  {:type   :tool-output
   :id     id
   :result {:output            "<result>...</result>"
            :structured-output {:query-id      "qid"
                                :query-content sql
                                :database      db-id
                                :query         (cond-> {:database db-id
                                                        :type     :native
                                                        :native   {:query sql}}
                                                 template-tags
                                                 (assoc-in [:native :template-tags] template-tags))}}})

(defn- mbql5-source-table
  "MBQL 5 query satisfying `::lib.schema/query` with the given source table id."
  [source-table-id]
  {:lib/type :mbql/query
   :database (mt/id)
   :stages   [{:lib/type     :mbql.stage/mbql
               :source-table source-table-id}]})

(defn- mbql5-source-card
  "MBQL 5 query with a `:source-card` stage."
  [card-id]
  {:lib/type :mbql/query
   :database (mt/id)
   :stages   [{:lib/type    :mbql.stage/mbql
               :source-card card-id}]})

(defn- legacy-query-on-card
  "Build a legacy-MBQL `:dataset_query` whose source is another card."
  [card-id]
  {:database (mt/id)
   :type     :query
   :query    {:source-table (str "card__" card-id)}})

(defn- table-ids
  "Return the set of `:table_id`s in the resulting rows."
  [rows]
  (into #{} (map :table_id) rows))

;;; ---------------------------------------- empty/no-op (no DB) ----------------------------------------

(deftest ^:parallel empty-parts-returns-nothing-test
  (is (= [] (used-tables/extract-used-tables 1 []))))

(deftest ^:parallel non-query-tool-skipped-test
  (testing "tool calls outside `query-generation-tool-names` produce no rows"
    (let [parts [{:type :tool-input :id "n1" :function "navigate_user" :arguments {}}
                 {:type :tool-output :id "n1"
                  :result {:output "ok"
                           :structured-output {:query-id "ignored"}}}]]
      (is (= [] (used-tables/extract-used-tables 1 parts))))))

(deftest ^:parallel errored-tool-output-skipped-test
  (testing "tool outputs with :error are dropped even with structured-output"
    (let [parts [(notebook-input "c1")
                 (assoc (notebook-output "c1" (mbql5-source-table 7)) :error "exploded")]]
      (is (= [] (used-tables/extract-used-tables 1 parts))))))

(deftest ^:parallel missing-structured-output-skipped-test
  (testing "tool outputs without :structured-output are dropped"
    (let [parts [(notebook-input "c1")
                 {:type :tool-output :id "c1" :result {:output "<result>failed</result>"}}]]
      (is (= [] (used-tables/extract-used-tables 1 parts))))))

(deftest ^:parallel orphan-tool-input-skipped-test
  (testing "tool-inputs without a matching tool-output yield no rows"
    (let [parts [(notebook-input "c1")]]
      (is (= [] (used-tables/extract-used-tables 1 parts))))))

;;; ---------------------------------------- notebook (MBQL 5) ----------------------------------------

(deftest notebook-source-table-test
  (testing "construct_notebook_query MBQL 5 with :source-table yields one table row"
    (let [parts [(notebook-input "c1")
                 (notebook-output "c1" (mbql5-source-table (mt/id :orders)))]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= [{:message_id 99 :table_id (mt/id :orders)}] rows)))))

(deftest notebook-source-card-question-expanded-test
  (testing ":source-card pointing at a question Card collapses to the question's underlying table"
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query orders)}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card card-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= [{:message_id 99 :table_id (mt/id :orders)}] rows))))))

(deftest notebook-source-card-model-expanded-test
  (testing ":source-card pointing at a model Card collapses to the model's underlying table"
    (mt/with-temp [:model/Card {card-id :id} {:type          :model
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query orders)}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card card-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= [{:message_id 99 :table_id (mt/id :orders)}] rows))))))

(deftest notebook-source-card-metric-expanded-test
  (testing ":source-card pointing at a metric Card collapses to the metric's underlying table"
    (mt/with-temp [:model/Card {card-id :id} {:type          :metric
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query orders
                                                               {:aggregation [[:count]]})}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card card-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= [{:message_id 99 :table_id (mt/id :orders)}] rows))))))

(deftest notebook-recurses-through-card-on-card-test
  (testing "card A on card B on table T collapses all the way down to T"
    (mt/with-temp [:model/Card {b-id :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (mt/mbql-query orders)}
                   :model/Card {a-id :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query {:database (mt/id)
                                                           :type     :query
                                                           :query    {:source-table (str "card__" b-id)}}}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card a-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= [{:message_id 99 :table_id (mt/id :orders)}] rows))))))

(deftest notebook-deleted-card-warns-test
  (testing "a :source-card id that doesn't exist yields no row and logs a warn"
    (let [absent-id (+ 1000000 (rand-int 1000000))
          parts     [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card absent-id))]]
      (log.capture/with-log-messages-for-level [logs [metabase.metabot.used-tables :warn]]
        (let [rows (used-tables/extract-used-tables 99 parts)]
          (is (= [] rows))
          (is (some #(re-find (re-pattern (str absent-id)) (:message %)) (logs))
              "warn line mentions the missing card id"))))))

;;; ---------------------------------------- nested cards (recursion) ----------------------------------------

(deftest notebook-three-levels-of-nesting-test
  (testing "card -> card -> card -> table collapses all the way down to the table"
    (mt/with-temp [:model/Card {c-id :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (mt/mbql-query orders)}
                   :model/Card {b-id :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (legacy-query-on-card c-id)}
                   :model/Card {a-id :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (legacy-query-on-card b-id)}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card a-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders)} (table-ids rows)))))))

(deftest notebook-model-on-question-test
  (testing "a model whose source is a question Card still resolves to the underlying table"
    (mt/with-temp [:model/Card {q-id :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (mt/mbql-query orders)}
                   :model/Card {m-id :id} {:type          :model
                                           :database_id   (mt/id)
                                           :dataset_query (legacy-query-on-card q-id)}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card m-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders)} (table-ids rows)))))))

(deftest notebook-question-on-model-test
  (testing "a question whose source is a model resolves to the underlying table"
    (mt/with-temp [:model/Card {m-id :id} {:type          :model
                                           :database_id   (mt/id)
                                           :dataset_query (mt/mbql-query orders)}
                   :model/Card {q-id :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (legacy-query-on-card m-id)}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card q-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders)} (table-ids rows)))))))

(deftest notebook-multi-stage-source-table-test
  (testing "a query with multiple stages still surfaces the first-stage :source-table"
    (let [query {:lib/type :mbql/query
                 :database (mt/id)
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table (mt/id :orders)
                             :aggregation  [[:count {:lib/uuid (str (random-uuid))}]]}
                            {:lib/type :mbql.stage/mbql}]}
          parts [(notebook-input "c1") (notebook-output "c1" query)]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= #{(mt/id :orders)} (table-ids rows))))))

;;; ---------------------------------------- joins ----------------------------------------

(deftest notebook-explicit-join-against-table-test
  (testing "an explicit join against another table surfaces both the source and joined tables"
    (let [query (mt/mbql-query orders
                  {:joins [{:source-table $$people
                            :alias        "P"
                            :condition    [:= $user_id &P.people.id]}]})
          parts [(notebook-input "c1") (notebook-output "c1" query)]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= #{(mt/id :orders) (mt/id :people)} (table-ids rows))))))

(deftest notebook-explicit-join-against-card-test
  (testing "an explicit join against a question Card surfaces both the source table and the card's underlying table"
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query people)}]
      (let [query (mt/mbql-query orders
                    {:joins [{:source-table (str "card__" card-id)
                              :alias        "P"
                              :condition    [:= $user_id [:field "id" {:join-alias "P"
                                                                       :base-type  :type/Integer}]]}]})
            parts [(notebook-input "c1") (notebook-output "c1" query)]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders) (mt/id :people)} (table-ids rows)))))))

(deftest notebook-explicit-join-against-model-test
  (testing "an explicit join against a model Card surfaces both the source table and the model's underlying table"
    (mt/with-temp [:model/Card {model-id :id} {:type          :model
                                               :database_id   (mt/id)
                                               :dataset_query (mt/mbql-query people)}]
      (let [query (mt/mbql-query orders
                    {:joins [{:source-table (str "card__" model-id)
                              :alias        "P"
                              :condition    [:= $user_id [:field "id" {:join-alias "P"
                                                                       :base-type  :type/Integer}]]}]})
            parts [(notebook-input "c1") (notebook-output "c1" query)]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders) (mt/id :people)} (table-ids rows)))))))

(deftest notebook-recurses-into-card-with-joins-test
  (testing "recursing into a Card whose own query has joins picks up all of the card's tables"
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query orders
                                                               {:joins [{:source-table $$people
                                                                         :alias        "P"
                                                                         :condition    [:= $user_id &P.people.id]}]})}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card card-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders) (mt/id :people)} (table-ids rows)))))))

(deftest notebook-source-table-with-join-to-card-on-card-test
  (testing "an outer query with both :source-table and a join to a chain of cards captures everything"
    (mt/with-temp [:model/Card {leaf :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (mt/mbql-query people)}
                   :model/Card {mid  :id} {:type          :question
                                           :database_id   (mt/id)
                                           :dataset_query (legacy-query-on-card leaf)}]
      (let [query (mt/mbql-query orders
                    {:joins [{:source-table (str "card__" mid)
                              :alias        "P"
                              :condition    [:= $user_id [:field "id" {:join-alias "P"
                                                                       :base-type  :type/Integer}]]}]})
            parts [(notebook-input "c1") (notebook-output "c1" query)]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders) (mt/id :people)} (table-ids rows)))))))

(deftest notebook-implicit-join-via-source-field-breakout-test
  (testing (str "a breakout with :source-field (implicit join) surfaces the joined table — "
                "the MBQL has no :source-table for products, only a [:field {:source-field <fk>} <field-in-products>]")
    (let [query {:lib/type :mbql/query
                 :database (mt/id)
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table (mt/id :orders)
                             :aggregation  [[:count {:lib/uuid (str (random-uuid))}]]
                             :breakout     [[:field {:lib/uuid     (str (random-uuid))
                                                     :base-type    :type/Text
                                                     :source-field (mt/id :orders :product_id)}
                                             (mt/id :products :category)]]}]}
          parts [(notebook-input "c1") (notebook-output "c1" query)]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= #{(mt/id :orders) (mt/id :products)} (table-ids rows))))))

(deftest notebook-implicit-join-via-source-field-filter-test
  (testing "an implicit-join field reference inside a filter clause also surfaces the joined table"
    (let [query {:lib/type :mbql/query
                 :database (mt/id)
                 :stages   [{:lib/type     :mbql.stage/mbql
                             :source-table (mt/id :orders)
                             :filters      [[:= {:lib/uuid (str (random-uuid))}
                                             [:field {:lib/uuid     (str (random-uuid))
                                                      :base-type    :type/Text
                                                      :source-field (mt/id :orders :product_id)}
                                              (mt/id :products :category)]
                                             "Widget"]]}]}
          parts [(notebook-input "c1") (notebook-output "c1" query)]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= #{(mt/id :orders) (mt/id :products)} (table-ids rows))))))

(deftest notebook-implicit-join-inside-nested-card-test
  (testing "implicit joins inside a recursively-walked card's dataset_query also surface"
    (mt/with-temp [:model/Card {card-id :id}
                   {:type          :question
                    :database_id   (mt/id)
                    :dataset_query (mt/mbql-query orders
                                     {:aggregation [[:count]]
                                      :breakout    [[:field (mt/id :products :category)
                                                     {:source-field (mt/id :orders :product_id)}]]})}]
      (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-card card-id))]
            rows  (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders) (mt/id :products)} (table-ids rows)))))))

;;; ---------------------------------------- native (SQL) ----------------------------------------

(deftest sql-extracts-macaw-tables-test
  (testing "native SQL is parsed by macaw and the underlying tables come through"
    (let [order-id (mt/id :orders)]
      (with-redefs [nqa/tables-for-native (fn [_ & _]
                                            {:tables [{:table-id order-id}]})]
        (let [parts [(sql-input "s1" "create_sql_query"
                                {:database_id (mt/id) :sql_query "SELECT * FROM orders"})
                     (sql-output "s1" "SELECT * FROM orders" (mt/id))]
              rows  (used-tables/extract-used-tables 99 parts)]
          (is (= [{:message_id 99 :table_id order-id}] rows)))))))

(deftest sql-template-tag-card-expanded-test
  (testing "card-type template tag in native SQL recursively expands to its underlying table"
    (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                              :database_id   (mt/id)
                                              :dataset_query (mt/mbql-query orders)}]
      (with-redefs [nqa/tables-for-native (fn [_ & _] {:tables []})]
        (let [tags  {"c1" {:id           "c1"
                           :name         "c1"
                           :display-name "C1"
                           :type         :card
                           :card-id      card-id}}
              parts [(sql-input "s1" "create_sql_query"
                                {:database_id (mt/id) :sql_query "SELECT 1"})
                     (sql-output "s1" "SELECT 1" (mt/id) :template-tags tags)]
              rows  (used-tables/extract-used-tables 99 parts)]
          (is (some #(= % {:message_id 99 :table_id (mt/id :orders)}) rows)))))))

(deftest sql-template-tag-native-card-recurses-macaw-test
  (testing "template tag pointing at a native-query Card recurses and macaw parses the inner SQL"
    (let [orders-id     (mt/id :orders)
          people-id     (mt/id :people)
          outer-sql     "SELECT 1"
          inner-sql     "SELECT * FROM people"
          inner-tables  (atom nil)]
      (mt/with-temp [:model/Card {card-id :id} {:type          :question
                                                :database_id   (mt/id)
                                                :dataset_query {:database (mt/id)
                                                                :type     :native
                                                                :native   {:query inner-sql}}}]
        (with-redefs [nqa/tables-for-native (fn [query & _]
                                              ;; production extractor converts to MBQL 5
                                              ;; before calling, so SQL lives on the stage
                                              (let [sql (-> query :stages first :native)]
                                                (cond
                                                  (= sql outer-sql) {:tables [{:table-id orders-id}]}
                                                  (= sql inner-sql) (do (reset! inner-tables true)
                                                                        {:tables [{:table-id people-id}]})
                                                  :else             {:tables []})))]
          (let [tags  {"c1" {:id           "c1"
                             :name         "c1"
                             :display-name "C1"
                             :type         :card
                             :card-id      card-id}}
                parts [(sql-input "s1" "create_sql_query"
                                  {:database_id (mt/id) :sql_query outer-sql})
                       (sql-output "s1" outer-sql (mt/id) :template-tags tags)]
                rows  (used-tables/extract-used-tables 99 parts)]
            (is (true? @inner-tables) "macaw was invoked on the inner card's native SQL")
            (is (= #{orders-id people-id} (table-ids rows))
                "outer and inner native tables both make it into the result")))))))

(deftest sql-parse-error-logged-test
  (testing "tables-for-native error yields no rows and logs a warn"
    (with-redefs [nqa/tables-for-native (fn [_ & _]
                                          {:error :query-analysis.error/parse-failed})]
      (let [parts [(sql-input "s1" "create_sql_query"
                              {:database_id (mt/id) :sql_query "SELEKT bad"})
                   (sql-output "s1" "SELEKT bad" (mt/id))]]
        (log.capture/with-log-messages-for-level [logs [metabase.metabot.used-tables :warn]]
          (is (= [] (used-tables/extract-used-tables 99 parts)))
          (is (some #(re-find #"tables-for-native error" (:message %)) (logs))))))))

;;; ---------------------------------------- native (SQL) — real macaw ----------------------------------------
;;;
;;; The tests above all stub `nqa/tables-for-native` to isolate the extractor logic from the macaw
;;; parser. These two tests run the real parser end-to-end against the H2 test-data DB so we catch
;;; integration regressions in the lib/query → tables-for-native handoff.

(deftest ^:sequential sql-real-macaw-join-with-where-test
  (testing "real macaw against a plain JOIN + WHERE: both tables come through end-to-end"
    (let [sql "SELECT o.id FROM orders o JOIN products p ON o.product_id = p.id WHERE p.category = 'Widget'"
          parts [(sql-input "s1" "create_sql_query"
                            {:database_id (mt/id) :sql_query sql})
                 (sql-output "s1" sql (mt/id))]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= #{(mt/id :orders) (mt/id :products)} (table-ids rows))))))

(deftest ^:sequential sql-real-macaw-with-card-template-tag-test
  (testing (str "real macaw against SQL that references a saved card via {{#card-id}} template tag — "
                "macaw expands the tag and surfaces both the outer table and the card's underlying table")
    (mt/with-temp [:model/Card {card-id :id}
                   {:type          :question
                    :database_id   (mt/id)
                    :dataset_query (mt/mbql-query products)}]
      (let [tag-name (str "#" card-id)
            sql      (format "SELECT * FROM orders WHERE product_id IN (SELECT id FROM {{%s}})" tag-name)
            tags     {tag-name {:id           tag-name
                                :name         tag-name
                                :display-name tag-name
                                :type         :card
                                :card-id      card-id}}
            parts    [(sql-input "s1" "create_sql_query"
                                 {:database_id (mt/id) :sql_query sql})
                      (sql-output "s1" sql (mt/id) :template-tags tags)]
            rows     (used-tables/extract-used-tables 99 parts)]
        (is (= #{(mt/id :orders) (mt/id :products)} (table-ids rows))
            "outer macaw walk finds orders; template-tag substitution + card recursion both reach products")))))

;;; ---------------------------------------- transforms ----------------------------------------

(defn- transform-sql-input
  "Build a `write_transform_sql` tool-input part. `source_tables` is optional —
  the production schema is closed without it, but the extractor reads it
  defensively, so we cover both shapes."
  ([id] (transform-sql-input id {}))
  ([id arguments]
   {:type :tool-input :id id :function "write_transform_sql"
    :arguments (merge {:database_id 1
                       :edit_action {:mode "replace" :new_content "SELECT 1"}}
                      arguments)}))

(defn- transform-sql-output
  "Build a `write_transform_sql` tool-output whose suggested transform's
  `[:source :query]` is an MBQL 5 native query. `sql` is the raw native text
  that macaw would parse (the production tool produces this via
  `lib/native-query` + `lib/with-native-query`)."
  [id sql db-id]
  {:type :tool-output :id id
   :result {:output "ok"
            :structured-output
            {:transform {:id nil
                         :name "T"
                         :description ""
                         :target {:type "table" :name "" :database db-id :schema nil}
                         :source {:type "query"
                                  :query {:lib/type :mbql/query
                                          :database db-id
                                          :stages   [{:lib/type :mbql.stage/native
                                                      :native   {:query sql}}]}}}
             :thinking "x"
             :message "Transform SQL updated successfully."}}})

(defn- transform-python-input
  "Build a `write_transform_python` tool-input part with the given
  `source_tables` entries."
  [id source-tables]
  {:type :tool-input :id id :function "write_transform_python"
   :arguments {:transform_name "T"
               :edit_action {:mode "replace" :new_content "def transform(): pass"}
               :source_tables (vec source-tables)}})

(defn- transform-python-output
  "Build a `write_transform_python` tool-output. The structured `:transform`
  is intentionally sparse — extraction reads `:source_tables` from the
  *arguments*, not from the structured output."
  [id]
  {:type :tool-output :id id
   :result {:output "ok"
            :structured-output {:transform {:source {:type "python"}}
                                :thinking "x"
                                :message "Transform Python updated successfully."}}})

(deftest transform-sql-extracts-macaw-tables-from-structured-output-test
  (testing "write_transform_sql walks the suggested transform's MBQL 5 native query through macaw"
    (let [orders-id (mt/id :orders)]
      (with-redefs [nqa/tables-for-native (fn [_ & _] {:tables [{:table-id orders-id}]})]
        (let [parts [(transform-sql-input "t1")
                     (transform-sql-output "t1" "SELECT * FROM orders" (mt/id))]
              rows  (used-tables/extract-used-tables 99 parts)]
          (is (= [{:message_id 99 :table_id orders-id}] rows)))))))

(deftest transform-sql-defensively-reads-source-tables-arg-test
  (testing "write_transform_sql also picks up `:source_tables` from arguments when present,
            and dedupes against macaw-derived ids — guards against a future schema relaxation"
    (let [orders-id (mt/id :orders)
          people-id (mt/id :people)]
      (with-redefs [nqa/tables-for-native (fn [_ & _] {:tables [{:table-id orders-id}]})]
        (let [parts [(transform-sql-input "t1"
                                          {:source_tables [{:alias "o" :table_id orders-id
                                                            :schema "PUBLIC" :database_id (mt/id)}
                                                           {:alias "p" :table_id people-id
                                                            :schema "PUBLIC" :database_id (mt/id)}]})
                     (transform-sql-output "t1" "SELECT * FROM orders" (mt/id))]
              rows  (used-tables/extract-used-tables 99 parts)]
          (is (= #{orders-id people-id} (table-ids rows))
              "macaw-derived `orders` and arg-declared `people` both surface, deduped")
          (is (= 2 (count rows))))))))

(deftest transform-sql-errored-output-skipped-test
  (testing "an errored write_transform_sql output yields no rows"
    (with-redefs [nqa/tables-for-native (fn [_ & _] {:tables [{:table-id (mt/id :orders)}]})]
      (let [parts [(transform-sql-input "t1")
                   (assoc (transform-sql-output "t1" "SELECT 1" (mt/id))
                          :error "boom")]]
        (is (= [] (used-tables/extract-used-tables 99 parts)))))))

(deftest transform-sql-without-query-source-yields-nothing-test
  (testing "if the suggested transform has no `[:source :query]`, no macaw walk happens
            (and with no `:source_tables` argument, no rows at all)"
    (let [parts [(transform-sql-input "t1")
                 {:type :tool-output :id "t1"
                  :result {:output "ok"
                           :structured-output {:transform {:source {:type "query"}}
                                               :thinking "x"
                                               :message "ok"}}}]]
      (is (= [] (used-tables/extract-used-tables 99 parts))))))

(deftest transform-python-extracts-declared-source-tables-test
  (testing "write_transform_python yields one row per declared `:source_tables` entry"
    (let [orders-id (mt/id :orders)
          people-id (mt/id :people)
          parts [(transform-python-input
                  "t1"
                  [{:alias "o" :table_id orders-id :schema "PUBLIC" :database_id (mt/id)}
                   {:alias "p" :table_id people-id :schema "PUBLIC" :database_id (mt/id)}])
                 (transform-python-output "t1")]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= #{orders-id people-id} (table-ids rows)))
      (is (= 2 (count rows))))))

(deftest transform-python-empty-source-tables-yields-nothing-test
  (testing "write_transform_python with an empty source_tables list yields no rows"
    (let [parts [(transform-python-input "t1" [])
                 (transform-python-output "t1")]]
      (is (= [] (used-tables/extract-used-tables 99 parts))))))

(deftest transform-python-errored-output-skipped-test
  (testing "an errored write_transform_python output yields no rows, even if arguments declare tables"
    (let [parts [(transform-python-input
                  "t1"
                  [{:alias "o" :table_id (mt/id :orders) :schema "PUBLIC" :database_id (mt/id)}])
                 (assoc (transform-python-output "t1") :error "boom")]]
      (is (= [] (used-tables/extract-used-tables 99 parts))))))

(deftest transform-python-orphan-input-yields-nothing-test
  (testing "a write_transform_python tool-input without a matching tool-output yields no rows"
    (let [parts [(transform-python-input
                  "t1"
                  [{:alias "o" :table_id (mt/id :orders) :schema "PUBLIC" :database_id (mt/id)}])]]
      (is (= [] (used-tables/extract-used-tables 99 parts))))))

(deftest transform-and-notebook-tool-calls-combine-test
  (testing "a turn that mixes write_transform_python with construct_notebook_query
            yields the union of their tables"
    (let [orders-id (mt/id :orders)
          people-id (mt/id :people)
          parts [(transform-python-input
                  "t1"
                  [{:alias "p" :table_id people-id :schema "PUBLIC" :database_id (mt/id)}])
                 (transform-python-output "t1")
                 (notebook-input "n1")
                 (notebook-output "n1" (mbql5-source-table orders-id))]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= #{orders-id people-id} (table-ids rows))))))

;;; ---------------------------------------- dedupe / stamping ----------------------------------------

(deftest dedupes-within-message-test
  (testing "two notebook tool calls referencing the same table yield a single row"
    (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-table (mt/id :orders)))
                 (notebook-input "c2") (notebook-output "c2" (mbql5-source-table (mt/id :orders)))]
          rows  (used-tables/extract-used-tables 99 parts)]
      (is (= [{:message_id 99 :table_id (mt/id :orders)}] rows)))))

(deftest stamps-message-id-test
  (testing "every returned row has :message_id set to the value passed in"
    (let [parts [(notebook-input "c1") (notebook-output "c1" (mbql5-source-table (mt/id :orders)))
                 (notebook-input "c2") (notebook-output "c2" (mbql5-source-table (mt/id :people)))]
          rows  (used-tables/extract-used-tables 42 parts)]
      (is (every? #(= 42 (:message_id %)) rows))
      (is (= 2 (count rows))))))

