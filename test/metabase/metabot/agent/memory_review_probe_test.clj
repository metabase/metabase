(ns metabase.metabot.agent.memory-review-probe-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-be.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.memory :as memory]
   [metabase.metabot.tools.transforms.write :as transforms.write]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn- degrade [x]
  (json/decode (json/encode x) true))

(defn- hydrated-query [query]
  (memory/find-query
   (memory/initialize [] {:queries {"q" query}})
   "q"))

(deftest canonicalization-contract-probe-test
  (let [mp              (mt/metadata-provider)
        table           (lib.metadata/table mp (mt/id :orders))
        canonical       (lib/query mp table)
        canonical-out   (hydrated-query canonical)
        legacy          {:database (mt/id)
                         :type     :query
                         :query    {:source-table (mt/id :orders)}}
        legacy-out      (hydrated-query legacy)
        native-sql      "SELECT '{\"lib/type\":\"field\",\"value\":\"day\"}'"
        native          (lib/native-query mp native-sql)
        native-out      (hydrated-query (degrade native))
        degenerate      {:id "q1"}
        degenerate-out  (hydrated-query degenerate)]
    (println "CONTRACT"
             {:canonical-idempotent?
              (= (lib/prepare-for-serialization canonical)
                 (lib/prepare-for-serialization canonical-out))
              :legacy-type          (:type (lib/->legacy-MBQL legacy-out))
              :legacy-source-table  (get-in (lib/->legacy-MBQL legacy-out) [:query :source-table])
              :native-sql-preserved (= native-sql (lib/raw-native-query native-out))
              :degenerate-preserved (= degenerate degenerate-out)})
    (is (= (lib/prepare-for-serialization canonical)
           (lib/prepare-for-serialization canonical-out)))
    (is (= :query (:type (lib/->legacy-MBQL legacy-out))))
    (is (= (mt/id :orders)
           (get-in (lib/->legacy-MBQL legacy-out) [:query :source-table])))
    (is (= native-sql (lib/raw-native-query native-out)))
    (is (= degenerate degenerate-out))))

(deftest chart-config-query-coverage-probe-test
  (let [mp    (mt/metadata-provider)
        query (degrade (lib/query mp (lib.metadata/table mp (mt/id :orders))))
        mem   (memory/initialize [] {:chart-configs {"chart-config" {:query query}}})
        out   (get-in mem [:state :chart-configs "chart-config" :query])]
    (println "CHART-CONFIG" {:lib-type (:lib/type out)})
    (is (= :mbql/query (:lib/type out)))))

(deftest structurally-broken-query-probe-test
  (let [out          (hydrated-query {:lib/type "mbql/query"
                                      :database (mt/id)
                                      :stages   [{:lib/type "mbql.stage/mbql"
                                                  :source-table 2147483647}]})
        legacy-result (try
                        {:value (lib/->legacy-MBQL out)}
                        (catch Throwable e
                          {:error (ex-message e)}))]
    (println "BROKEN-QUERY"
             {:type-assertion-passes? (= :mbql/query (:lib/type out))
              :output                 (dissoc out :lib/metadata)
              :legacy-result          legacy-result})
    (is (= :mbql/query (:lib/type out)))
    (is (nil? (:error legacy-result)))))

(deftest broken-query-execution-probe-test
  (mt/with-test-user :rasta
    (let [out    (hydrated-query {:lib/type "mbql/query"
                                  :database (mt/id)
                                  :stages   [{:lib/type "mbql.stage/mbql"
                                              :source-table 2147483647}]})
          result (try
                   (qp/process-query out)
                   (catch Throwable e
                     {:status :threw
                      :error  (ex-message e)}))]
      (println "BROKEN-QUERY-EXECUTION"
               (select-keys result [:status :error :error_type]))
      (is (= :completed (:status result))))))

(deftest lossy-normalization-probe-test
  (let [base       {:database (mt/id)
                    :type     :query
                    :query    {:source-table (mt/id :orders)}}
        candidates {:short-filter     (assoc-in base [:query :filter] [:=])
                    :short-field      (assoc-in base [:query :filter] [:= [:field] 1])
                    :nil-field        (assoc-in base [:query :fields] [nil])
                    :short-breakout   (assoc-in base [:query :breakout] [[:field]])
                    :short-aggregation (assoc-in base [:query :aggregation] [[:sum]])
                    :short-order-by   (assoc-in base [:query :order-by] [[:asc]])
                    :missing-join-field
                    (assoc-in base [:query :fields]
                              [[:field (mt/id :orders :id) {:join-alias "Missing"}]])
                    :missing-expression-filter
                    (assoc-in base [:query :filter] [:= [:expression "missing"] 1])
                    :missing-aggregation-order
                    (assoc-in base [:query :order-by] [[:asc [:aggregation 42]]])
                    :bad-join         (assoc-in base [:query :joins]
                                                [{:source-table (mt/id :people)
                                                  :alias        "People"
                                                  :condition    [:=]}])}
        results    (into {}
                         (for [[label query] candidates]
                           (let [normalized (lib-be/normalize-query query)]
                             [label
                              {:normalized? (boolean (seq normalized))
                               :output      (some-> normalized
                                                    lib/->legacy-MBQL
                                                    (dissoc :lib/metadata))
                               :input       query}])))
        lossy      (into {}
                         (filter (fn [[_ {:keys [normalized? input output]}]]
                                   (and normalized? (not= input output))))
                         results)]
    (println "LOSSY-CANDIDATES" results)
    (println "LOSSY-NONEMPTY" lossy)
    (is (empty? lossy))))

(deftest normalize-call-count-and-metadata-probe-test
  (let [mp             (mt/metadata-provider)
        query          (degrade (lib/query mp (lib.metadata/table mp (mt/id :orders))))
        provider-calls (atom 0)
        real-provider  lib.metadata.jvm/application-database-metadata-provider
        mem            (mt/with-dynamic-fn-redefs
                         [lib.metadata.jvm/application-database-metadata-provider
                          (fn [database-id]
                            (swap! provider-calls inc)
                            (real-provider database-id))]
                         (memory/initialize
                          []
                          {:queries    {"q1" query "q2" query}
                           :charts     {"c1" {:queries [query query]}
                                        "c2" {:queries [query]}}
                           :transforms {"t1" {:source {:query query}}
                                        "t2" {:source {:query query}}}}))
        queries        (concat
                        (vals (get-in mem [:state :queries]))
                        (mapcat :queries (vals (get-in mem [:state :charts])))
                        (keep #(get-in % [:source :query])
                              (vals (get-in mem [:state :transforms]))))
        invoked        (into {}
                             (for [metadata-type [:metadata/database
                                                  :metadata/table
                                                  :metadata/column
                                                  :metadata/card]]
                               [metadata-type
                                (mapv #(lib.metadata/invoked-ids (:lib/metadata %) metadata-type)
                                      queries)]))]
    (println "PERF"
             {:state-query-occurrences (count queries)
              :provider-factory-calls  @provider-calls
              :metadata-invocations    invoked})
    (is (= 7 @provider-calls))
    (is (every? empty? (mapcat val invoked)))))

(deftest raw-context-transform-probe-test
  (let [mp        (mt/metadata-provider)
        degraded  (degrade (lib/native-query mp "SELECT 1"))
        transform {:id 1 :source {:type "query" :query degraded}}
        memory    (atom (memory/initialize [] {:transforms {"1" transform}}))
        result    (try
                    {:value
                     (transforms.write/write-transform-sql
                      {:transform_id 1
                       :edit_action  {:mode "edit"
                                      :edits [{:old_string "1" :new_string "2"}]}
                       :memory-atom  memory
                       :context      {:transforms {"1" transform}}})}
                    (catch Throwable e
                      {:error (ex-message e)}))]
    (println "RAW-CONTEXT" result)
    (is (nil? (:error result)))
    (is (= "SELECT 2"
           (some-> result :value :structured-output :transform :source :query lib/raw-native-query)))))

(deftest empty-context-bypasses-memory-probe-test
  (let [mp        (mt/metadata-provider)
        transform {:id 1 :source {:type "query" :query (lib/native-query mp "SELECT 1")}}
        memory    (atom (memory/initialize [] {:transforms {"1" transform}}))
        result    (try
                    {:value
                     (transforms.write/write-transform-sql
                      {:transform_id 1
                       :edit_action  {:mode "edit"
                                      :edits [{:old_string "1" :new_string "2"}]}
                       :memory-atom  memory
                       :context      {}})}
                    (catch Throwable e
                      {:error (ex-message e)}))]
    (println "EMPTY-CONTEXT" result)
    (is (nil? (:error result)))))
