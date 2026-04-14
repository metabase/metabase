(ns metabase.interestingness.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.interestingness.core :as interestingness]))

(defn- constant-scorer [score reason]
  (fn [_field _context] {:score score :reason reason}))

(deftest ^:parallel score-field-test
  (testing "single scorer"
    (let [result (interestingness/score-field
                  {(constant-scorer 0.8 "good") 1.0}
                  {:semantic-type :type/Category})]
      (is (= 0.8 (:score result)))
      (is (map? (:scores result)))
      (is (= {:semantic-type :type/Category} (:field result)))))

  (testing "weighted average of two scorers"
    (let [result (interestingness/score-field
                  {(constant-scorer 1.0 "high") 0.75
                   (constant-scorer 0.0 "low")  0.25}
                  {})]
      (is (= 0.75 (:score result)))))

  (testing "weights don't need to sum to 1"
    (let [result (interestingness/score-field
                  {(constant-scorer 1.0 "a") 3.0
                   (constant-scorer 0.0 "b") 1.0}
                  {})]
      (is (= 0.75 (:score result)))))

  (testing "empty scorer map returns 0.5"
    (is (= 0.5 (:score (interestingness/score-field {} {} nil)))))

  (testing "nil field doesn't crash"
    (let [result (interestingness/score-field
                  {(constant-scorer 0.5 "ok") 1.0}
                  nil)]
      (is (= 0.5 (:score result))))))

(deftest ^:parallel context-passthrough-test
  (testing "context is passed to scorers"
    (let [received-ctx (atom nil)
          ctx-scorer   (fn [_field context]
                         (reset! received-ctx context)
                         {:score 0.5 :reason "ok"})
          context      {:intent :revenue}]
      (interestingness/score-field {ctx-scorer 1.0} {} context)
      (is (= {:intent :revenue} @received-ctx))))

  (testing "nil context is normalized to {}"
    (let [received-ctx (atom nil)
          ctx-scorer   (fn [_field context]
                         (reset! received-ctx context)
                         {:score 0.5 :reason "ok"})]
      (interestingness/score-field {ctx-scorer 1.0} {} nil)
      (is (= {} @received-ctx))))

  (testing "omitted context is normalized to {}"
    (let [received-ctx (atom nil)
          ctx-scorer   (fn [_field context]
                         (reset! received-ctx context)
                         {:score 0.5 :reason "ok"})]
      (interestingness/score-field {ctx-scorer 1.0} {})
      (is (= {} @received-ctx)))))

(deftest ^:parallel compose-test
  (testing "compose returns a callable scorer"
    (let [composed (interestingness/compose
                    {(constant-scorer 0.8 "a") 1.0
                     (constant-scorer 0.6 "b") 1.0})
          result   (composed {} nil)]
      (is (= 0.7 (:score result)))))

  (testing "composed scorer works with 1-arity"
    (let [composed (interestingness/compose {(constant-scorer 0.4 "x") 1.0})
          result   (composed {})]
      (is (= 0.4 (:score result))))))

(deftest ^:parallel apply-cutoff-test
  (testing "filters below threshold"
    (let [scored [{:score 0.8 :field :a}
                  {:score 0.3 :field :b}
                  {:score 0.5 :field :c}]]
      (is (= [{:score 0.8 :field :a} {:score 0.5 :field :c}]
             (interestingness/apply-cutoff 0.5 scored)))))

  (testing "empty input returns empty"
    (is (empty? (interestingness/apply-cutoff 0.5 [])))))

(deftest ^:parallel score-and-filter-test
  (testing "scores, filters, and sorts descending"
    (let [fields [{:name "good"} {:name "bad"} {:name "ok"}]
          ;; scorer that uses field name length as score proxy
          name-scorer (fn [field _ctx]
                        (let [len (count (:name field))]
                          {:score (/ len 10.0) :reason (str len " chars")}))
          results (interestingness/score-and-filter
                   {name-scorer 1.0} fields 0.25)]
      (is (= 2 (count results)))
      (is (= "good" (-> results first :field :name)))
      (is (>= (-> results first :score) (-> results second :score)))))

  (testing "with context"
    (let [results (interestingness/score-and-filter
                   {(constant-scorer 0.9 "x") 1.0}
                   [{:name "a"}]
                   0.5
                   {:intent :revenue})]
      (is (= 1 (count results))))))

(deftest ^:parallel default-dimension-weights-test
  (testing "default weights map contains expected scorers"
    (is (= 7 (count interestingness/default-dimension-weights)))
    (is (every? fn? (keys interestingness/default-dimension-weights)))
    (is (every? pos? (vals interestingness/default-dimension-weights)))))
