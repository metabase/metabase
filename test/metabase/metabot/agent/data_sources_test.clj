(ns metabase.metabot.agent.data-sources-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.jev.client :as jev]
   [metabase.metabot.agent.data-sources :as data-sources]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- search-with [& results]
  (data-sources/start-search
   {"search" {:fn (constantly {:output            "<result>search</result>"
                               :structured-output {:result-type :search :data (vec results)}})}}
   "show me orders over time"
   nil))

(defn- describe-with [probabilities search]
  (let [read-uris (atom [])
        asked     (atom nil)]
    (mt/with-dynamic-fn-redefs [jev/ask (fn [state questions _opts]
                                          (reset! asked state)
                                          {:ok      true
                                           :answers (into {} (map-indexed (fn [i k] [k {:type "noul" :noul (nth probabilities i)}]))
                                                          (sort-by #(parse-long (subs (name %) 10)) (keys questions)))})]
      {:context (data-sources/describe search
                                       "show me orders over time"
                                       (fn [{:keys [uris]}]
                                         (swap! read-uris into uris)
                                         {:output (str "read " (str/join "," uris))})
                                       nil)
       :read    @read-uris
       :asked   @asked})))

(deftest describes-likely-data-sources-test
  (let [{:keys [context read asked]} (describe-with [0.95 0.2 0.8]
                                                    (search-with {:id 1 :type "table" :name "ORDERS"
                                                                  :database_name "Sample Database" :database_schema nil}
                                                                 {:id 2 :type "table" :name "People"}
                                                                 {:id 3 :type "metric" :name "Order count"
                                                                  :portable_entity_id "abc123"}))]
    (is (= ["metabase://table/1/fields" "metabase://metric/3"] read))
    (is (str/starts-with? context "<relevant_data_sources>\n"))
    (is (str/includes? context "read metabase://table/1/fields,metabase://metric/3"))
    (testing "spells out the exact references, including a table's null schema"
      (is (str/includes? context "- ORDERS (table): source-table [\"Sample Database\",null,\"ORDERS\"]"))
      (is (str/includes? context "- Order count (metric): portable_entity_id \"abc123\"")))
    (testing "the relevance model reads the prompt and what was searched for"
      (is (= "show me orders over time" (:user_prompt asked)))
      (is (= ["show me orders over time"] (:search_queries asked))))))

(deftest nothing-likely-test
  (is (= {:context nil :read []}
         (select-keys (describe-with [0.4] (search-with {:id 1 :type "table" :name "People"}))
                      [:context :read]))))

(deftest skips-results-without-a-uri-test
  (is (= ["metabase://table/2/fields"]
         (:read (describe-with [0.9 0.9] (search-with {:id 1 :type "document" :name "Orders notes"}
                                                      {:id 2 :type "table" :name "Orders"}))))))

(deftest prefers-the-library-search-test
  (let [calls (atom [])
        tool  (fn [tool-name] {:fn (fn [args] (swap! calls conj [tool-name args]) {:output ""})})]
    @(data-sources/start-search {"search" (tool "search") "retrieve_library_entities" (tool "retrieve_library_entities")}
                                "orders" nil)
    (is (= [["retrieve_library_entities" {:user_search_prompt "orders"}]] @calls))
    (is (nil? (data-sources/start-search {"read_resource" (tool "read_resource")} "orders" nil)))
    (testing "the conversation's subjects go in as extra keyword queries"
      (reset! calls [])
      @(data-sources/start-search {"search" (tool "search")} "break it down by source" ["orders"])
      (is (= [["search" {:semantic_queries ["break it down by source"]
                         :keyword_queries  ["break it down by source" "orders"]}]]
             @calls)))))

(deftest known-data-sources-test
  (mt/with-temp [:model/User                {user-id :id}         {}
                 :model/MetabotConversation {conversation-id :id} {:user_id user-id}
                 :model/MetabotMessage      {live-id :id}         {:conversation_id conversation-id}
                 :model/MetabotMessage      {deleted-id :id}      {:conversation_id conversation-id
                                                                   :deleted_at      (java.time.OffsetDateTime/now)}]
    (t2/insert! :model/MetabotUsedTable [{:message_id live-id :table_id (mt/id :orders)}
                                         {:message_id deleted-id :table_id (mt/id :people)}])
    (is (=? [{:type "table" :name (t2/select-one-fn :name :model/Table (mt/id :orders))}]
            (data-sources/known-data-sources conversation-id)))
    (testing "field names come along, so routing can tell whether a known table covers the prompt"
      (is (contains? (set (:fields (first (data-sources/known-data-sources conversation-id))))
                     (t2/select-one-fn :name :model/Field (mt/id :orders :total)))))
    (is (nil? (data-sources/known-data-sources nil)))))
