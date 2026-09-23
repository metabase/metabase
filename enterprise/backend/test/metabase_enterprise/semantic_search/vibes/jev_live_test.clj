(ns ^:mb/vibes-live metabase-enterprise.semantic-search.vibes.jev-live-test
  "Live check against TypeSafe. Skipped (with a warning) unless `MB_VIBES_API_KEY` is set:

      MB_VIBES_API_KEY=... ./bin/test-agent :only '[metabase-enterprise.semantic-search.vibes.jev-live-test]'"
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.settings :as vibes.settings]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(def ^:private candidates
  {"1"  {"type" "card" "name" "Revenue by Product Category"        "content" "Monthly sum of order totals grouped by product category"}
   "2"  {"type" "card" "name" "Revenue by State"                   "content" "Yearly order revenue per US state"}
   "3"  {"type" "card" "name" "Orders per Customer"                "content" "Count of orders by customer, all time"}
   "4"  {"type" "card" "name" "Average Product Rating"             "content" "Mean review rating per product"}
   "5"  {"type" "card" "name" "Product Category Inventory"         "content" "Units in stock by product category"}
   "6"  {"type" "card" "name" "Discounts Given per Quarter"        "content" "Total discount amount by quarter"}
   "7"  {"type" "card" "name" "Customer Satisfaction per Category" "content" "Average review score by product category"}
   "8"  {"type" "card" "name" "Monthly Active Users"               "content" "Distinct users with at least one login per month"}
   "9"  {"type" "dashboard" "name" "Finance overview"              "content" "Revenue, margin and discounts, monthly"}
   "10" {"type" "table" "name" "ORDERS"                            "content" "orders table: id, product_id, user_id, total, discount"}})

(defn- opts []
  {:url        (vibes.settings/vibes-api-url)
   :api-key    (vibes.settings/vibes-api-key)
   :model      (vibes.settings/vibes-model)
   :timeout-ms 10000})

(defmacro ^:private when-live [& body]
  `(if (str/blank? (vibes.settings/vibes-api-key))
     (log/warn "Skipping: MB_VIBES_API_KEY is not set")
     (do ~@body)))

(deftest obvious-answer-is-top-1-test
  (when-live
   (doseq [[prompt expected] [["how much money do we make from each kind of product" "1"]
                              ["income across american regions" "2"]
                              ["price reductions granted every three months" "6"]]]
     (testing prompt
       (let [scores (jev/score-candidates! prompt candidates (opts))]
         (is (= 10 (count scores)))
         (is (= expected (key (apply max-key val scores)))))))))

(deftest latency-test
  (when-live
   (let [fifty (into {} (for [i (range 50)
                              :let [[id c] (nth (seq candidates) (mod i 10))]]
                          [(str id "-" i) c]))]
     (doseq [[label roster] [["K=10" candidates] ["K=50" fifty]]]
       (testing label
         (let [timer  (u/start-timer)
               scores (jev/score-candidates! "revenue by product" roster (opts))
               ms     (u/since-ms timer)]
           (log/infof "vibes live %s: %.0f ms" label ms)
           (is (= (count roster) (count scores)))
           (is (< ms 2000))))))))
