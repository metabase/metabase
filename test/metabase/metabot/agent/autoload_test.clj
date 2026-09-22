(ns metabase.metabot.agent.autoload-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.agent.autoload :as autoload]
   [metabase.metabot.self.system-one :as s1]
   [metabase.test :as mt]))

(defn- search-result [& results]
  {:output            "<result>search</result>"
   :structured-output {:result-type :search :data (vec results)}})

(defn- tools-with [search-result read-uris]
  {"search"        {:fn (constantly search-result)}
   "read_resource" {:fn (fn [{:keys [uris]}]
                          (swap! read-uris into uris)
                          {:output (str "read " (str/join "," uris))})}})

(defn- run-search [probabilities result]
  (let [read-uris (atom [])]
    (mt/with-dynamic-fn-redefs [s1/available? (constantly true)
                                s1/ask        (fn [_state questions _opts]
                                                {:answers (into {} (map-indexed (fn [i k] [k {:type :noul :noul (nth probabilities i)}]))
                                                                (sort-by #(parse-long (subs (name %) 10)) (keys questions)))})]
      (let [tools (autoload/wrap-search-tools (tools-with result read-uris)
                                              {:autoload-resources? true}
                                              "show me orders over time"
                                              {})]
        {:output ((get-in tools ["search" :fn]) {:keyword_queries ["orders"]})
         :read   @read-uris}))))

(deftest autoloads-likely-results-test
  (let [{:keys [output read]} (run-search [0.95 0.2 0.8]
                                          (search-result {:id 1 :type "table" :name "Orders"}
                                                         {:id 2 :type "table" :name "People"}
                                                         {:id 3 :type "metric" :name "Order count"}))]
    (is (= ["metabase://table/1/fields" "metabase://metric/3"] read))
    (is (str/starts-with? (:output output) "<result>search</result>"))
    (is (str/includes? (:output output) "<autoloaded_resources>\n"))
    (is (str/includes? (:output output) "read metabase://table/1/fields,metabase://metric/3"))))

(deftest leaves-unlikely-results-test
  (let [{:keys [output read]} (run-search [0.4] (search-result {:id 1 :type "table" :name "People"}))]
    (is (empty? read))
    (is (= "<result>search</result>" (:output output)))))

(deftest skips-results-without-a-uri-test
  (let [{:keys [read]} (run-search [0.9 0.9]
                                   (search-result {:id 1 :type "document" :name "Orders notes"}
                                                  {:id 2 :type "table" :name "Orders"}))]
    (is (= ["metabase://table/2/fields"] read))))

(deftest disabled-test
  (mt/with-dynamic-fn-redefs [s1/available? (constantly true)]
    (let [tools (tools-with (search-result {:id 1 :type "table"}) (atom []))]
      (testing "profile without the flag"
        (is (= tools (autoload/wrap-search-tools tools {} "orders" {}))))
      (testing "no read_resource tool"
        (let [tools (dissoc tools "read_resource")]
          (is (= tools (autoload/wrap-search-tools tools {:autoload-resources? true} "orders" {}))))))))
