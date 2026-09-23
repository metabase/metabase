(ns metabase.jev.apps.classify-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase.jev.apps.classify :as classify]
   [metabase.jev.client :as jev]
   [metabase.test :as mt]
   [metabase.transforms-base.interface :as transforms-base.i]))

(set! *warn-on-reflection* true)

(use-fixtures :each (fn [thunk]
                      (reset! @#'classify/answer-cache {})
                      (thunk)))

(def ^:private kind-spec
  {:input          "NAME"
   :question       "What kind of place is this?"
   :answers        {:bar "serves drinks" :food "serves food"}
   :output         {:mode "new-column" :name "kind"}
   :min-confidence 0.6})

(def ^:private fancy-spec
  {:input    "NAME"
   :kind     "noul"
   :question "Does this sound fancy?"
   :output   {:mode "new-column" :name "fancy"}})

(defn- fake-ask
  "A `jev/ask` that answers `bar` for names containing \"Bar\" (confidently) and `food` otherwise (not)."
  [calls]
  (fn [state questions & _]
    (swap! calls conj [state (set (keys questions))])
    (let [bar? (re-find #"Bar" (str (get state "NAME")))]
      {:ok      true
       :answers (into {}
                      (map (fn [[id q]]
                             [id (if (= "choice" (:type q))
                                   {:type "choice" :choice (if bar? "bar" "food") :confidence (if bar? 0.9 0.4)}
                                   {:type "noul" :noul 0.25})]))
                      questions)})))

(defn- rows-as-maps [{:keys [columns rows]}]
  (mapv #(zipmap (map :name columns) %) rows))

(deftest dispatch-test
  (testing "a query transform with a classify step dispatches as :jev; without one it stays :query"
    (is (= :jev (transforms-base.i/transform->transform-type {:source {:type "query" :jev-classify [kind-spec]}})))
    (is (= :query (transforms-base.i/transform->transform-type {:source {:type "query"}})))
    (is (= :query (transforms-base.i/transform->transform-type {:source {:type "query" :jev-classify []}})))))

(deftest classify-new-columns-test
  (let [calls (atom [])]
    (with-redefs [jev/ask (fake-ask calls)]
      (let [result (classify/classify (mt/mbql-query venues {:order-by [[:asc $id]] :limit 4})
                                      [kind-spec fancy-spec]
                                      10 nil)
            rows   (rows-as-maps result)]
        (testing "adds each spec's columns after the source columns"
          (is (= ["kind" "kind_confidence" "fancy"] (take-last 3 (map :name (:columns result))))))
        (testing "below :min-confidence a choice becomes `unsure`, keeping the confidence"
          (is (every? #{"bar" "unsure"} (map #(get % "kind") rows)))
          (is (every? number? (map #(get % "kind_confidence") rows))))
        (testing "noul answers are written as-is"
          (is (every? #{0.25} (map #(get % "fancy") rows))))
        (testing "specs over the same input share one Jev call per row"
          (is (= 4 (count @calls)))
          (is (every? #{#{:q0 :q1}} (map second @calls))))))))

(deftest cache-test
  (let [calls (atom [])
        query (mt/mbql-query venues {:order-by [[:asc $id]] :limit 3})]
    (with-redefs [jev/ask (fake-ask calls)]
      (classify/classify query [(assoc kind-spec :question "cache-test question")] 10 nil)
      (let [first-run (count @calls)]
        (classify/classify query [(assoc kind-spec :question "cache-test question")] 10 nil)
        (is (= first-run (count @calls)) "a re-run is answered from the cache")))))

(deftest overwrite-keeps-original-when-unsure-test
  (with-redefs [jev/ask (fake-ask (atom []))]
    (let [spec   (assoc kind-spec :output {:mode "overwrite" :name "NAME"})
          before (rows-as-maps (classify/classify (mt/mbql-query venues {:order-by [[:asc $id]] :limit 4})
                                                  [(assoc fancy-spec :output {:mode "new-column" :name "x"})]
                                                  10 nil))
          after  (rows-as-maps (classify/classify (mt/mbql-query venues {:order-by [[:asc $id]] :limit 4})
                                                  [spec]
                                                  10 nil))]
      (doseq [[b a] (map vector before after)]
        (if (re-find #"Bar" (get b "NAME"))
          (is (= "bar" (get a "NAME")))
          (is (= (get b "NAME") (get a "NAME"))))))))

(deftest validation-test
  (with-redefs [jev/ask (fake-ask (atom []))]
    (let [query (mt/mbql-query venues {:limit 1})]
      (testing "a new column may not shadow a source column"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"already exists"
                              (classify/classify query [(assoc-in kind-spec [:output :name] "NAME")] 1 nil))))
      (testing "fill-empty/overwrite need an existing column"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"does not exist"
                              (classify/classify query [(assoc kind-spec :output {:mode "fill-empty" :name "nope"})] 1 nil))))
      (testing "a choice needs at least two answers"
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"at least two answers"
                              (classify/classify query [(assoc kind-spec :answers {:only "one"})] 1 nil)))))))

(deftest every-call-failing-throws-test
  (with-redefs [jev/ask (constantly {:ok false :error "Jev token is not configured"})]
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"every Jev call failed"
                          (classify/classify (mt/mbql-query venues {:limit 2}) [kind-spec] 2 nil)))))

(deftest no-specs-returns-source-rows-test
  (with-redefs [jev/ask (fn [& _] (throw (ex-info "should not be called" {})))]
    (let [{:keys [columns rows]} (classify/classify (mt/mbql-query venues {:limit 2}) [] 2 nil)]
      (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"] (map :name columns)))
      (is (= 2 (count rows))))))

(deftest preview-endpoint-test
  (testing "POST /api/jev/classify/preview runs the steps over the query's first rows"
    (with-redefs [jev/ask (fake-ask (atom []))]
      (let [{:keys [columns rows]} (mt/user-http-request :crowberto :post 200 "jev/classify/preview"
                                                         {:query    (mt/mbql-query venues {:order-by [[:asc $id]]})
                                                          :classify [kind-spec]
                                                          :limit    3})]
        (is (= ["kind" "kind_confidence"] (take-last 2 (map :name columns))))
        (is (= 3 (count rows))))))
  (testing "with no steps it returns the source columns"
    (is (= ["ID" "NAME" "CATEGORY_ID" "LATITUDE" "LONGITUDE" "PRICE"]
           (->> (mt/user-http-request :crowberto :post 200 "jev/classify/preview"
                                      {:query (mt/mbql-query venues) :classify [] :limit 1})
                :columns
                (map :name))))))

(deftest string-keyed-specs-test
  (testing "specs read back from a stored transform source have string keys"
    (with-redefs [jev/ask (fake-ask (atom []))]
      (let [spec   {"input"          ["NAME" "PRICE"]
                    "question"       "What kind of place is this?"
                    "kind"           "choice"
                    "answers"        {"bar" "serves drinks" "food" "serves food"}
                    "output"         {"mode" "new-column" "name" "kind"}
                    "min-confidence" 0.6}
            result (classify/classify (mt/mbql-query venues {:limit 2}) [spec] 2 nil)]
        (is (= ["kind" "kind_confidence"] (take-last 2 (map :name (:columns result)))))))))
