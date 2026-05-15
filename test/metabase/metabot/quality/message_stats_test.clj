(ns metabase.metabot.quality.message-stats-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.quality.message-stats :as message-stats]))

(defn- tool-input
  ([function]
   (tool-input function {} :keyword))
  ([function args]
   (tool-input function args :keyword))
  ([function args key-style]
   (case key-style
     :keyword {:type :tool-input :function function :arguments args :id "toolu_x"}
     :string  {:type "tool-input" :function function :arguments args :id "toolu_x"})))

(defn- tool-output
  []
  {:type :tool-output :id "toolu_x" :result {:output "ok"}})

(defn- text
  []
  {:type :text :text "hello"})

;; ---------------------------------------------------------------------------
;; Empty / no-authoring cases
;; ---------------------------------------------------------------------------

(deftest message-stats-empty-test
  (testing "nil parts → defaults"
    (is (= {:query_modified false :query_count 0}
           (message-stats/message-stats nil))))
  (testing "empty vector → defaults"
    (is (= {:query_modified false :query_count 0}
           (message-stats/message-stats [])))))

(deftest message-stats-no-authoring-tools-test
  (testing "text-only assistant turn"
    (is (= {:query_modified false :query_count 0}
           (message-stats/message-stats [(text)]))))
  (testing "search + read_resource (no authoring) is not counted"
    (is (= {:query_modified false :query_count 0}
           (message-stats/message-stats
            [(tool-input "search") (tool-output)
             (tool-input "read_resource") (tool-output)
             (text)])))))

;; ---------------------------------------------------------------------------
;; One authoring call per each authoring tool
;; ---------------------------------------------------------------------------

(deftest message-stats-each-authoring-tool-test
  (doseq [tool-name ["create_sql_query"
                     "edit_sql_query"
                     "replace_sql_query"
                     "construct_notebook_query"
                     "write_transform_sql"
                     "write_transform_python"
                     "document_construct_sql_chart"
                     "document_construct_model_chart"]]
    (testing (str "single " tool-name " call → modified + count 1")
      (is (= {:query_modified true :query_count 1}
             (message-stats/message-stats
              [(tool-input tool-name) (tool-output)]))))))

;; ---------------------------------------------------------------------------
;; Mixed turn shapes
;; ---------------------------------------------------------------------------

(deftest message-stats-multiple-authoring-calls-test
  (testing "two authoring calls in one turn → count 2"
    (is (= {:query_modified true :query_count 2}
           (message-stats/message-stats
            [(tool-input "create_sql_query")
             (tool-output)
             (text)
             (tool-input "edit_sql_query")
             (tool-output)])))))

(deftest message-stats-only-authoring-counted-test
  (testing "authoring + non-authoring tool calls — only authoring counted"
    (is (= {:query_modified true :query_count 1}
           (message-stats/message-stats
            [(tool-input "search") (tool-output)
             (tool-input "create_sql_query") (tool-output)
             (tool-input "navigate_user") (tool-output)
             (text)])))))

;; ---------------------------------------------------------------------------
;; Cross-format compatibility (keyword `:type` in-memory, string after JSON
;; round-trip — message-stats must accept both so a future backfill can call
;; the same function against persisted rows)
;; ---------------------------------------------------------------------------

(deftest message-stats-string-typed-parts-test
  (testing "string :type values are recognised the same as keyword :type values"
    (is (= {:query_modified true :query_count 2}
           (message-stats/message-stats
            [(tool-input "create_sql_query" {} :string)
             (tool-input "edit_sql_query" {} :string)])))))
