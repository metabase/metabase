(ns metabase-enterprise.metabot.summary-formula-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sandbox.test-util :as sandbox.tu]
   [metabase-enterprise.test :as met]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.self :as metabot.self]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private endpoint "metabot/summary-formula")

(defn- request-body
  [query]
  {:mode          "aggregation"
   :prompt        "count"
   :dataset_query (lib/prepare-for-serialization query)})

(defn- sent-to-llm
  "The user prompt the LLM gets for `query`, sent as Rasta."
  [query]
  (let [prompt (atom nil)]
    (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                metabot.self/call-llm-structured         (fn [_model [_system user] & _]
                                                                           (reset! prompt (:content user))
                                                                           {:expression "Count" :name "Count"})]
      (mt/user-http-request :rasta :post 200 endpoint (request-body query))
      @prompt)))

(defn- column-listed?
  [user-prompt column-name]
  (str/includes? user-prompt (str "[" column-name "]")))

(deftest summary-formula-sandboxed-table-test
  (testing "POST /api/metabot/summary-formula only sends the columns a sandbox allows on a table"
    (met/with-gtaps! {:gtaps {:venues {:query (sandbox.tu/restricted-column-query (mt/id))}}}
      (let [mp   (mt/metadata-provider)
            user (sent-to-llm (lib/query mp (lib.metadata/table mp (mt/id :venues))))]
        (testing "keeps the allowed columns"
          (is (column-listed? user "Name"))
          (is (column-listed? user "ID")))
        (testing "removes the restricted columns"
          (is (not (column-listed? user "Price")))
          (is (not (column-listed? user "Latitude"))))))))

(deftest summary-formula-sandboxed-model-test
  (testing "POST /api/metabot/summary-formula only sends the columns a sandbox allows behind a model"
    (met/with-gtaps! {:gtaps {:venues {:query (sandbox.tu/restricted-column-query (mt/id))}}}
      (mt/with-temp [:model/Card {model-id :id} {:name          "Venues model"
                                                 :type          :model
                                                 :database_id   (mt/id)
                                                 :table_id      (mt/id :venues)
                                                 :dataset_query {:database (mt/id)
                                                                 :type     :query
                                                                 :query    {:source-table (mt/id :venues)}}}]
        (let [mp   (mt/metadata-provider)
              user (sent-to-llm (lib/query mp (lib.metadata/card mp model-id)))]
          (is (column-listed? user "Name"))
          (is (not (column-listed? user "Price")))
          (is (not (column-listed? user "Latitude"))))))))

(deftest summary-formula-managed-lock-test
  (testing "POST /api/metabot/summary-formula returns a 402 when the managed AI lock is reached"
    (let [mp (mt/metadata-provider)]
      (mt/with-dynamic-fn-redefs [metabot.settings/llm-metabot-configured? (constantly true)
                                  metabot.usage/managed-free-limit-reached? (constantly true)]
        (is (=? {:error-code "metabase_ai_managed_locked"}
                (mt/user-http-request :rasta :post 402 endpoint
                                      (request-body (lib/query mp (lib.metadata/table mp (mt/id :venues)))))))))))
