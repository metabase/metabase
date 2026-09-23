(ns metabase-enterprise.semantic-search.vibes.jev-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.vibes.jev :as jev]
   [metabase-enterprise.semantic-search.vibes.prompt :as prompt]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private roster
  {"812" {"type" "card" "name" "Revenue by Product Category" "description" "<p>Monthly sum</p>" "collection" "Finance"}
   "31"  {"type" "dashboard" "name" "Ops" "description" nil}})

(def ^:private opts
  {:url "http://jev.test/v1/systemone" :api-key "key" :model "jev-latest" :timeout-ms 2000})

(defn- ok-response [answers]
  {:status  200
   :headers {"Content-Type" "application/json"}
   :body    (json/encode {:model "jev-1.13.0" :answers answers :usage {:input_tokens 10 :output_tokens 2}})})

(deftest ^:parallel request-body-test
  (is (= {:model     "jev-latest"
          :state     {:search_query "monthly revenue by product category"}
          :questions {"812" {:type         "noul"
                             :instructions {:candidate {"type" "card" "name" "Revenue by Product Category"
                                                        "description" "Monthly sum" "collection" "Finance"}
                                            :question  (str "`candidate` is one row of a search result. Is it the item a "
                                                            "user searching for `search_query` would want to open?")}
                             :criteria     {:true  (str "The candidate's name, description or content describe the same "
                                                        "data, metric or analysis the search query asks for, at the same "
                                                        "or a close grain.")
                                            :false (str "The candidate only shares a keyword or general topic with the "
                                                        "search query, or covers different data, a different metric or "
                                                        "an unrelated grouping.")}}
                      "31"  {:type         "noul"
                             :instructions {:candidate {"type" "dashboard" "name" "Ops"}
                                            :question  (str "`candidate` is one row of a search result. Is it the item a "
                                                            "user searching for `search_query` would want to open?")}
                             :criteria     {:true  (str "The candidate's name, description or content describe the same "
                                                        "data, metric or analysis the search query asks for, at the same "
                                                        "or a close grain.")
                                            :false (str "The candidate only shares a keyword or general topic with the "
                                                        "search query, or covers different data, a different metric or "
                                                        "an unrelated grouping.")}}}}
         (jev/request-body "jev-latest" :search "monthly revenue by product category" roster))))

(deftest ^:parallel request-body-rows-test
  (testing "vibes on query rows: the prompt is a free-form vibe, not a search"
    (is (=? {:model     "jev-latest"
             :state     {:vibe "a raccoon just got a corporate credit card"}
             :questions {"31" {:type         "noul"
                               :instructions {:candidate {"type" "dashboard" "name" "Ops"}
                                              :question  (str "`candidate` is one row of a query result. Does it fit "
                                                              "the vibe described by `vibe`?")}
                               :criteria     {:true  (str "The row embodies `vibe`: someone who read the phrase "
                                                          "would say this row fits it, literally, by association, "
                                                          "or in spirit, including jokes and hyperbole.")
                                              :false (str "The row has little to do with `vibe`, or fits it no "
                                                          "better than an ordinary, unrelated row would.")}}}}
            (jev/request-body "jev-latest" :rows "a raccoon just got a corporate credit card" roster)))))

(deftest ^:parallel sanitize-text-test
  (is (= "Monthly sum of totals" (prompt/sanitize-text "<p>Monthly   sum</p> of\n totals")))
  (is (nil? (prompt/sanitize-text "<br/>")))
  (is (= 301 (count (prompt/sanitize-text (apply str (repeat 400 "x")))))))

(deftest ^:parallel parse-answers-test
  (is (= {"812" 0.91 "31" 0.05}
         (jev/parse-answers {"answers" {"812" {"type" "noul" "noul" 0.91}
                                        "31"  {"type" "noul" "noul" 0.05}
                                        "7"   {"type" "noul"}
                                        "8"   {"type" "noul" "noul" "high"}}})))
  (is (= {} (jev/parse-answers {}))))

(deftest score-candidates-test
  (let [posted (atom [])]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [url body opts]
                                            (swap! posted conj {:url url :body body :opts opts})
                                            (ok-response {"812" {:type "noul" :noul 0.91} "31" {:type "noul" :noul 0.05}}))]
      (is (= {"812" 0.91 "31" 0.05} (jev/score-candidates! "q" roster opts)))
      (is (=? [{:url  "http://jev.test/v1/systemone"
                :body {:model "jev-latest" :state {:search_query "q"}}
                :opts {:api-key "key" :timeout-ms 2000}}]
              @posted)))))

(deftest score-candidates-question-test
  (let [posted (atom [])]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ body _]
                                            (swap! posted conj body)
                                            (ok-response {"812" {:type "noul" :noul 0.5}}))]
      (jev/score-candidates! "q" roster (assoc opts :question :rows))
      (is (=? [{:state {:vibe "q"}}] @posted)))))

(deftest score-candidates-complete-test
  (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] (ok-response {"812" {:type "noul" :noul 0.5}}))]
    (testing "an id Jev didn't answer still makes a complete scoring"
      (is (false? (jev/incomplete? (jev/score-candidates! "q" roster opts)))))))

(deftest score-candidates-failed-chunk-is-incomplete-test
  (let [big (into {} (map (fn [i] [(str i) {"name" (str "item " i)}])) (range 150))
        n   (atom 0)]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ body _]
                                            (if (= 1 (swap! n inc))
                                              (ok-response (update-vals (:questions body) (constantly {:type "noul" :noul 0.5})))
                                              {:status 500 :headers {} :body "down"}))]
      (let [scores (jev/score-candidates! "q" big opts)]
        (is (= 100 (count scores)))
        (is (true? (jev/incomplete? scores)))))))

(deftest score-candidates-out-of-time-is-incomplete-test
  (let [big (into {} (map (fn [i] [(str i) {"name" (str "item " i)}])) (range 150))
        n   (atom 0)]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ body _]
                                            (swap! n inc)
                                            (Thread/sleep 60)
                                            (ok-response (update-vals (:questions body) (constantly {:type "noul" :noul 0.5}))))]
      (let [scores (jev/score-candidates! "q" big (assoc opts :timeout-ms 50))]
        (testing "the second chunk is never sent once the budget is spent"
          (is (= 1 @n)))
        (is (= 100 (count scores)))
        (is (true? (jev/incomplete? scores)))))))

(deftest score-candidates-missing-id-test
  (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] (ok-response {"812" {:type "noul" :noul 0.5}}))]
    (is (= {"812" 0.5} (jev/score-candidates! "q" roster opts)))))

(deftest score-candidates-http-error-test
  (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] {:status 401 :headers {} :body "{\"error\":\"nope\"}"})]
    (is (nil? (jev/score-candidates! "q" roster opts))))
  (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] {:status 422 :headers {} :body "bad"})]
    (is (nil? (jev/score-candidates! "q" roster opts)))))

(deftest score-candidates-bad-json-test
  (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] {:status 200 :headers {} :body "not json"})]
    (is (nil? (jev/score-candidates! "q" roster opts)))))

(deftest score-candidates-network-error-test
  (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] (throw (java.net.SocketTimeoutException. "Read timed out")))]
    (is (nil? (jev/score-candidates! "q" roster opts)))))

(deftest score-candidates-retry-once-test
  (let [n (atom 0)]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _]
                                            (if (= 1 (swap! n inc))
                                              {:status 429 :headers {"retry-after" "0"} :body ""}
                                              (ok-response {"812" {:type "noul" :noul 0.7}})))]
      (is (= {"812" 0.7} (jev/score-candidates! "q" roster opts)))
      (is (= 2 @n)))))

(deftest score-candidates-retry-at-most-once-test
  (let [n (atom 0)]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _]
                                            (swap! n inc)
                                            {:status 529 :headers {} :body ""})]
      (is (nil? (jev/score-candidates! "q" roster opts)))
      (is (= 2 @n)))))

(deftest score-candidates-retry-outside-budget-test
  (let [n (atom 0)]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _]
                                            (swap! n inc)
                                            {:status 429 :headers {"retry-after" "30"} :body ""})]
      (is (nil? (jev/score-candidates! "q" roster opts)))
      (testing "a retry-after beyond the budget is not waited for"
        (is (= 1 @n))))))

(deftest score-candidates-no-key-test
  (let [n (atom 0)]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] (swap! n inc) (ok-response {}))]
      (is (nil? (jev/score-candidates! "q" roster (assoc opts :api-key nil))))
      (is (zero? @n)))))

(deftest score-candidates-chunking-test
  (let [sizes (atom [])
        big   (into {} (map (fn [i] [(str i) {"name" (str "item " i)}])) (range 150))]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ body _]
                                            (swap! sizes conj (count (:questions body)))
                                            (ok-response (update-vals (:questions body) (constantly {:type "noul" :noul 0.5}))))]
      (is (= 150 (count (jev/score-candidates! "q" big opts))))
      (is (= [100 50] @sizes)))))

(deftest score-candidates-empty-roster-test
  (let [n (atom 0)]
    (mt/with-dynamic-fn-redefs [jev/post! (fn [_ _ _] (swap! n inc) (ok-response {}))]
      (is (= {} (jev/score-candidates! "q" {} opts)))
      (is (zero? @n)))))
