(ns metabase-enterprise.metabot-v3.tools.navigate-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.tools.navigate :as navigate]))

(deftest page->path-test
  (testing "page navigation produces correct paths"
    ;; Test through the public navigate function
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (testing "notebook_editor"
        (let [result (navigate/navigate {:destination {:page "notebook_editor"}
                                         :memory-atom memory-atom})]
          (is (= "/question/notebook" (get-in result [:structured-output :path])))))

      (testing "metrics_browser"
        (let [result (navigate/navigate {:destination {:page "metrics_browser"}
                                         :memory-atom memory-atom})]
          (is (= "/browse/metrics" (get-in result [:structured-output :path])))))

      (testing "model_browser"
        (let [result (navigate/navigate {:destination {:page "model_browser"}
                                         :memory-atom memory-atom})]
          (is (= "/browse/models" (get-in result [:structured-output :path])))))

      (testing "database_browser"
        (let [result (navigate/navigate {:destination {:page "database_browser"}
                                         :memory-atom memory-atom})]
          (is (= "/browse/databases" (get-in result [:structured-output :path])))))

      (testing "home"
        (let [result (navigate/navigate {:destination {:page "home"}
                                         :memory-atom memory-atom})]
          (is (= "/" (get-in result [:structured-output :path])))))

      (testing "sql_editor with database_id"
        (let [result (navigate/navigate {:destination {:page "sql_editor" :database_id 123}
                                         :memory-atom memory-atom})]
          (is (string? (get-in result [:structured-output :path])))
          (is (clojure.string/starts-with? (get-in result [:structured-output :path]) "/question#")))))))

(deftest entity->path-test
  (testing "entity navigation produces correct paths"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (testing "table navigation"
        (let [result (navigate/navigate {:destination {:entity_type "table" :entity_id 42}
                                         :memory-atom memory-atom})]
          (is (= "/table/42" (get-in result [:structured-output :path])))))

      (testing "model navigation"
        (let [result (navigate/navigate {:destination {:entity_type "model" :entity_id 100}
                                         :memory-atom memory-atom})]
          (is (= "/model/100" (get-in result [:structured-output :path])))))

      (testing "question navigation"
        (let [result (navigate/navigate {:destination {:entity_type "question" :entity_id 55}
                                         :memory-atom memory-atom})]
          (is (= "/question/55" (get-in result [:structured-output :path])))))

      (testing "metric navigation"
        (let [result (navigate/navigate {:destination {:entity_type "metric" :entity_id 77}
                                         :memory-atom memory-atom})]
          (is (= "/metric/77" (get-in result [:structured-output :path])))))

      (testing "dashboard navigation"
        (let [result (navigate/navigate {:destination {:entity_type "dashboard" :entity_id 88}
                                         :memory-atom memory-atom})]
          (is (= "/dashboard/88" (get-in result [:structured-output :path])))))

      (testing "database navigation"
        (let [result (navigate/navigate {:destination {:entity_type "database" :entity_id 99}
                                         :memory-atom memory-atom})]
          (is (= "/browse/databases/99" (get-in result [:structured-output :path])))))

      (testing "collection navigation"
        (let [result (navigate/navigate {:destination {:entity_type "collection" :entity_id 111}
                                         :memory-atom memory-atom})]
          (is (= "/collection/111" (get-in result [:structured-output :path]))))))))

(deftest query-navigation-test
  (testing "query navigation resolves from memory"
    (let [query {:lib/type :mbql/query
                 :database 1
                 :stages [{:lib/type :mbql.stage/mbql
                           :source-table 10}]}
          memory-atom (atom {:state {:queries {"test-query-id" query}
                                     :charts {}}})]
      (let [result (navigate/navigate {:destination {:query_id "test-query-id"}
                                       :memory-atom memory-atom})]
        (is (clojure.string/starts-with? (get-in result [:structured-output :path]) "/question#")))))

  (testing "query navigation fails for missing query"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Query not found"
           (navigate/navigate {:destination {:query_id "nonexistent"}
                               :memory-atom memory-atom}))))))

(deftest chart-navigation-test
  (testing "chart navigation resolves from memory"
    (let [query {:lib/type :mbql/query :database 1 :stages [{:lib/type :mbql.stage/mbql :source-table 10}]}
          memory-atom (atom {:state {:queries {"q1" query}
                                     :charts {"chart1" {:query-id "q1" :chart-type :bar}}}})]
      (let [result (navigate/navigate {:destination {:chart_id "chart1"}
                                       :memory-atom memory-atom})]
        (is (clojure.string/starts-with? (get-in result [:structured-output :path]) "/question#")))))

  (testing "chart navigation falls back to query lookup if chart not found"
    (let [query {:lib/type :mbql/query :database 1 :stages [{:lib/type :mbql.stage/mbql :source-table 10}]}
          memory-atom (atom {:state {:queries {"chart1" query}
                                     :charts {}}})]
      (let [result (navigate/navigate {:destination {:chart_id "chart1"}
                                       :memory-atom memory-atom})]
        (is (clojure.string/starts-with? (get-in result [:structured-output :path]) "/question#")))))

  (testing "chart navigation fails for missing chart and query"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Chart not found"
           (navigate/navigate {:destination {:chart_id "nonexistent"}
                               :memory-atom memory-atom}))))))

(deftest navigate-returns-reactions-test
  (testing "navigate returns redirect reaction"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})
          result (navigate/navigate {:destination {:page "home"}
                                     :memory-atom memory-atom})]
      (is (contains? result :reactions))
      (is (= 1 (count (:reactions result))))
      (let [reaction (first (:reactions result))]
        (is (= :metabot.reaction/redirect (:type reaction)))
        (is (= "/" (:url reaction)))))))

(deftest navigate-format-message-test
  (testing "navigate returns user-friendly messages"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (testing "page navigation message"
        (let [result (navigate/navigate {:destination {:page "home"}
                                         :memory-atom memory-atom})]
          (is (string? (get-in result [:structured-output :message])))))

      (testing "entity navigation message"
        (let [result (navigate/navigate {:destination {:entity_type "model" :entity_id 1}
                                         :memory-atom memory-atom})]
          (is (string? (get-in result [:structured-output :message]))))))))

(deftest navigate-invalid-destination-test
  (testing "navigate fails for invalid destination"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid destination"
           (navigate/navigate {:destination {}
                               :memory-atom memory-atom}))))))

(deftest navigate-unknown-page-test
  (testing "navigate fails for unknown page"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Unknown page"
           (navigate/navigate {:destination {:page "unknown_page"}
                               :memory-atom memory-atom}))))))

(deftest navigate-unknown-entity-type-test
  (testing "navigate fails for unknown entity type"
    (let [memory-atom (atom {:state {:queries {} :charts {}}})]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Unknown entity type"
           (navigate/navigate {:destination {:entity_type "unknown" :entity_id 1}
                               :memory-atom memory-atom}))))))
