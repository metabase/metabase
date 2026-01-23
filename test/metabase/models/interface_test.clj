(ns metabase.models.interface-test
  {:clj-kondo/config '{:linters {:deprecated-var {:level :off}}}}
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.models.interface :as mi]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.encryption-test :as encryption-test]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   (com.fasterxml.jackson.core JsonParseException)))

;; Let's make sure `transform-metric-segment-definition`/`transform-parameters-list` normalization functions respond
;; gracefully to invalid stuff when pulling them out of the Database. See #8914

(deftest timestamped-property-test
  (testing "Make sure updated_at gets updated for timestamped models"
    (mt/with-temp [:model/Table table {:updated_at #t "2023-02-02T01:00:00"}]
      (let [updated-at (:updated_at table)
            new-name   (u/qualified-name ::a-new-name)]
        (is (= 1
               (t2/update! table (u/the-id table) {:name new-name})))
        (is (=? {:id         (:id table)
                 :name       new-name
                 :updated_at (partial not= updated-at)}
                (t2/select-one [:model/Table :id :name :updated_at] (u/the-id table))))))))

(deftest ^:parallel timestamped-property-do-not-stomp-on-explicit-values-test
  (testing "The :timestamped property should not stomp on :created_at/:updated_at if they are explicitly specified"
    (mt/with-temp [:model/Field field]
      (testing "Nothing specified: use now() for both"
        (is (=? {:created_at java.time.temporal.Temporal
                 :updated_at java.time.temporal.Temporal}
                field))))))

(deftest ^:parallel timestamped-property-do-not-stomp-on-explicit-values-test-2
  (testing "The :timestamped property should not stomp on :created_at/:updated_at if they are explicitly specified"
    (let [t                  #t "2022-10-13T19:21:00Z"
          expected-timestamp (t/offset-date-time "2022-10-13T19:21:00Z")]
      (testing "Explicitly specify :created_at"
        (mt/with-temp [:model/Field field {:created_at t}]
          (is (=? {:created_at expected-timestamp
                   :updated_at java.time.temporal.Temporal}
                  field))))
      (testing "Explicitly specify :updated_at"
        (mt/with-temp [:model/Field field {:updated_at t}]
          (is (=? {:created_at java.time.temporal.Temporal
                   :updated_at expected-timestamp}
                  field)))))))

(defmethod mi/non-timestamped-fields :test-model/updated-at-tester [_]
  #{:non_timestamped :other})

(deftest ^:parallel timestamped-property-skips-non-timestamped-fields-test
  (testing "Does not add a timestamp if it only includes non-timestamped fields"
    (let [instance (-> (t2/instance :test-model/updated-at-tester {:non_timestamped nil})
                       (assoc :non_timestamped 1))]
      (is (= {:non_timestamped 1}
             (#'mi/add-updated-at-timestamp instance))))))

(deftest ^:parallel timestamped-property-skips-non-timestamped-fields-test-2
  (testing "Adds a timestamp if it includes other fields"
    (let [instance (-> (t2/instance :test-model/updated-at-tester {:non_timestamped nil :included nil})
                       (assoc :non_timestamped 1)
                       (assoc :included 2))]
      (is (= {:non_timestamped 1 :included 2 :updated_at (mi/now)}
             (#'mi/add-updated-at-timestamp instance))))))

(deftest ^:parallel upgrade-to-v2-viz-settings-test
  (let [migrate #(select-keys (#'mi/migrate-viz-settings %)
                              [:version :pie.percent_visibility])]
    (testing "show_legend -> inside"
      (is (= {:version 2
              :pie.percent_visibility "inside"}
             (migrate {:pie.show_legend          true
                       :pie.show_legend_perecent true
                       :pie.show_data_labels     true}))))
    (testing "show_legend_percent -> legend"
      (is (= {:version 2
              :pie.percent_visibility "legend"}
             (migrate {:pie.show_legend          false
                       :pie.show_legend_perecent true
                       :pie.show_data_labels     true}))))
    (testing "anything else -> nothing"
      (doseq [legend  [false nil]
              percent [false nil]
              labels  [true false nil]]
        (is (= {}
               (migrate {:pie.show_legend          legend
                         :pie.show_legend_perecent percent
                         :pie.show_data_labels     labels})))))))

(deftest encrypted-data-with-no-secret-test
  (encryption-test/with-secret-key nil
    (testing "Just parses string normally when there is no key and the string is JSON"
      (is (= {:a 1}
             (mi/encrypted-json-out "{\"a\": 1}"))))
    (testing "Also parses string if it's encrypted and JSON"
      (is (= {:a 1}
             (encryption-test/with-secret-key "qwe"
               (mi/encrypted-json-out
                (encryption/encrypt (encryption/secret-key->hash "qwe") "{\"a\": 1}"))))))
    (testing "Logs an error message when incoming data looks encrypted"
      (mt/with-log-messages-for-level [messages :error]
        (mi/encrypted-json-out
         (encryption/encrypt (encryption/secret-key->hash "qwe") "{\"a\": 1}"))
        (is (=? [{:level   :error
                  :e       JsonParseException
                  :message "Could not decrypt encrypted field! Have you forgot to set MB_ENCRYPTION_SECRET_KEY?"}]
                (messages)))))
    (testing "Invalid JSON throws correct error"
      (mt/with-log-messages-for-level [messages :error]
        (mi/encrypted-json-out "{\"a\": 1")
        (is (=? [{:level :error, :e JsonParseException, :message "Error parsing JSON"}]
                (messages))))
      (mt/with-log-messages-for-level [messages :error]
        (encryption-test/with-secret-key "qwe"
          (mi/encrypted-json-out
           (encryption/encrypt (encryption/secret-key->hash "qwe") "{\"a\": 1")))
        (is (=? [{:level :error, :e JsonParseException, :message "Error parsing JSON"}]
                (messages)))))))

(deftest ^:parallel instances-with-hydrated-data-test
  (let [things [{:id 2} nil {:id 1}]]
    (is (= [{:id 2 :even-id? true} nil {:id 1 :even-id? false}]
           (mi/instances-with-hydrated-data
            things :even-id?
            #(into {} (comp (remove nil?)
                            (map (juxt :id (comp even? :id))))
                   things)
            :id)))))

(deftest ^:parallel normalize-mbql-clause-impostor-in-visualization-settings-test
  (let [viz-settings
        {"table.pivot_column" "TAX"
         "graph.metrics" ["expression"]
         "pivot_table.column_split"
         {"rows"
          ["CREATED_AT" "expression" "TAX"]
          "columns" []
          "values" ["sum"]}
         "pivot_table.column_widths" {"leftHeaderWidths" [141 99 80], "totalLeftHeaderWidths" 320, "valueHeaderWidths" {}}
         "table.cell_column" "expression"
         "table.column_formatting"
         [{"columns" ["expression" nil "TAX" "count"]
           "type" "single"
           "operator" "is-null"
           "value" 10
           "color" "#EF8C8C"
           "highlight_row" false
           "id" 0}]
         "column_settings" {"[\"ref\",[\"expression\",\"expression\"]]" {"number_style" "currency"}}
         "series_settings" {"expression" {"line.interpolate" "step-after", "line.style" "dotted"}}
         "graph.dimensions" ["CREATED_AT"]}]
    (is (= {:table.pivot_column "TAX"
            :graph.metrics ["expression"]
            :pivot_table.column_split
            {:rows ["CREATED_AT" "expression" "TAX"]
             :columns []
             :values ["sum"]}
            :pivot_table.column_widths {:leftHeaderWidths [141 99 80], :totalLeftHeaderWidths 320, :valueHeaderWidths {}}
            :table.cell_column "expression"
            :table.column_formatting
            [{:columns ["expression" nil "TAX" "count"]
              :type "single"
              :operator "is-null"
              :value 10
              :color "#EF8C8C"
              :highlight_row false
              :id 0}]
            :column_settings {"[\"ref\",[\"expression\",\"expression\"]]" {:number_style "currency"}}
            :series_settings {:expression {:line.interpolate "step-after", :line.style "dotted"}}
            :graph.dimensions ["CREATED_AT"]}
           (mi/normalize-visualization-settings viz-settings)))))

(deftest ^:parallel json-in-with-eliding
  (is (= "{}" (#'mi/json-in-with-eliding {})))
  (is (= (json/encode {:a "short"}) (#'mi/json-in-with-eliding {:a "short"})))
  (is (= (json/encode {:a (str (apply str (repeat 247 "b")) "...")}) (#'mi/json-in-with-eliding {:a (apply str (repeat 500 "b"))})))
  (is (= (json/encode {"ex-data" {"toucan2/context-trace" [["execute SQL with class com.mchange.v2.c3p0.impl.NewProxyConnection"
                                                            {"toucan2.jdbc.query/sql-args" (str (apply str (repeat 247 "b")) "...")}]]}})
         (#'mi/json-in-with-eliding {"ex-data" {"toucan2/context-trace" [["execute SQL with class com.mchange.v2.c3p0.impl.NewProxyConnection"
                                                                          {"toucan2.jdbc.query/sql-args" (apply str (repeat 500 "b"))}]]}})))
  (is (= (json/encode {:a (repeat 50 "x")}) (#'mi/json-in-with-eliding {:a (repeat 500 "x")})))
  (testing "A passed string is not elided"
    (is (= (apply str (repeat 1000 "a")) (#'mi/json-in-with-eliding (apply str (repeat 1000 "a")))))))

(deftest ^:parallel lib-result-metadata-out-test
  (let [cols [{:active                    true
               :base-type                 :type/Text
               :database-type             "CHARACTER VARYING"
               :display-name              "Category"
               :effective-type            :type/Text
               :field-ref                 [:field 61339 nil]
               :fingerprint               {:global {:distinct-count 4, :nil% 0.0}
                                           :type   {:type/Text {:average-length 6.375
                                                                :percent-email  0.0
                                                                :percent-json   0.0
                                                                :percent-state  0.0
                                                                :percent-url    0.0}}}
               :id                        61339
               :name                      "CATEGORY"
               :position                  3
               :semantic-type             :type/Category
               :source                    :breakout
               :table-id                  10808
               :visibility-type           :normal
               :lib/breakout?             true
               :lib/deduplicated-name     "CATEGORY"
               :lib/desired-column-alias  "CATEGORY"
               :lib/original-display-name "Category"
               :lib/original-name         "CATEGORY"
               :lib/source                :source/table-defaults
               :lib/source-column-alias   "CATEGORY"
               :lib/type                  :metadata/column}]]

    (is (= cols
           (#'mi/result-metadata-out (json/encode cols))))))

;;; ---------------------------------------- can-query? tests ----------------------------------------

(deftest can-query?-default-falls-back-to-can-read?-test
  (testing "Default implementation falls back to can-read?"
    ;; Use Card model which uses the default can-query? implementation
    (mt/with-temp [:model/Card card {}]
      (with-redefs [mi/can-read? (constantly true)]
        (is (true? (mi/can-query? card))))
      (with-redefs [mi/can-read? (constantly false)]
        (is (false? (mi/can-query? card)))))))

(deftest can-query-hydration-returns-boolean-test
  (testing ":can_query hydration returns a boolean value"
    (mt/with-temp [:model/Card card {}]
      (let [hydrated (t2/hydrate card :can_query)]
        (is (contains? hydrated :can_query))
        (is (boolean? (:can_query hydrated)))))))
