(ns metabase-enterprise.similarity.fusion-test
  "Pure-Clojure unit tests for the JVM-side reference RRF implementation. The
   production codepath fuses in SQL inside `views.ensemble`; these tests pin
   the math so the SQL-side stays equivalent."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.fusion :as fusion]))

(def ^:private cfg
  {:weights {:co-dashboard 1.2}
   :k       60})

(defn- ->n
  "Build a minimal `:to_entity_*`-shaped row for a `(type id)` neighbor."
  [t id]
  {:to_entity_type t :to_entity_id id})

(deftest fuses-and-sorts-by-score-desc
  (let [out (fusion/fuse-ranks
             [[:co-dashboard       [(->n :card 1) (->n :card 2) (->n :card 3)]]
              [:source-table-jaccard [(->n :card 2) (->n :card 1) (->n :card 4)]]]
             cfg)]
    (testing "all four candidates show up in the result"
      (is (= #{[:card 1] [:card 2] [:card 3] [:card 4]}
             (set (map (juxt :to-type :to-id) out)))))
    (testing "result is sorted by score-desc"
      (let [scores (map :score out)]
        (is (= scores (sort > scores)))))
    (testing "candidates seen in both lists outrank candidates seen in only one"
      (let [seen-in-both (->> out (filter #(#{[:card 1] [:card 2]} [(:to-type %) (:to-id %)]))
                              (map :score))
            seen-in-one  (->> out (filter #(#{[:card 3] [:card 4]} [(:to-type %) (:to-id %)]))
                              (map :score))]
        (is (every? (fn [a] (every? (fn [b] (> a b)) seen-in-one)) seen-in-both))))))

(deftest weight-monotonicity-test
  (testing "doubling a single view's weight strictly increases that view's contribution"
    (let [base [[:co-dashboard       [(->n :card 1) (->n :card 2)]]
                [:source-table-jaccard [(->n :card 1) (->n :card 2)]]]
          baseline (fusion/fuse-ranks base {:weights {} :k 60})
          boosted  (fusion/fuse-ranks base {:weights {:co-dashboard 5.0} :k 60})
          score-of (fn [out [t id]]
                     (some #(when (and (= t (:to-type %)) (= id (:to-id %))) (:score %)) out))]
      ;; Both candidates appear in :co-dashboard so both should grow when its weight grows.
      (is (> (score-of boosted [:card 1]) (score-of baseline [:card 1])))
      (is (> (score-of boosted [:card 2]) (score-of baseline [:card 2]))))))

(deftest single-list-identity-test
  (testing "single ranked list with weight 1.0 ⇒ scores match 1/(k+rank)"
    (let [out (fusion/fuse-ranks [[:any [(->n :card 10) (->n :card 11)]]]
                                 {:weights {} :k 60})
          by-id (into {} (map (juxt :to-id :score)) out)]
      (is (== (/ 1.0 61) (get by-id 10)))
      (is (== (/ 1.0 62) (get by-id 11))))))

(deftest empty-list-elision-test
  (testing "empty ranked-lists do not change the result"
    (let [non-empty [[:co-dashboard [(->n :card 1) (->n :card 2)]]]
          padded    (conj non-empty [:source-table-jaccard []])
          a (fusion/fuse-ranks non-empty cfg)
          b (fusion/fuse-ranks padded cfg)]
      (is (= (map (juxt :to-type :to-id :score) a)
             (map (juxt :to-type :to-id :score) b))))))

(deftest weight-for-defaults-test
  (testing "unknown view → 1.0; known view → mapped weight"
    (is (== 1.0 (fusion/weight-for {:weights {}} :anything)))
    (is (== 2.5 (fusion/weight-for {:weights {:foo 2.5}} :foo)))
    (is (== 1.0 (fusion/weight-for {:weights {:foo 2.5}} :bar)))))

(deftest contributing-breakdown-test
  (testing "the :contributing field captures per-view rank/weight contributions"
    (let [out (fusion/fuse-ranks
               [[:co-dashboard         [(->n :card 1)]]
                [:source-table-jaccard [(->n :card 1)]]]
               {:weights {:co-dashboard 1.2} :k 60})
          row (first out)]
      (is (= 2 (count (:contributing row))))
      (is (= #{:co-dashboard :source-table-jaccard}
             (set (map :view (:contributing row)))))
      (is (every? (fn [{:keys [rank weight]}]
                    (and (pos-int? rank) (pos? weight)))
                  (:contributing row))))))

(deftest ensemble-config-stable-test
  (testing "ensemble-config returns the [:card :card] entry with at least three views"
    (let [cfg ((fusion/ensemble-config) [:card :card])]
      (is (some? cfg))
      (is (>= (count (:views cfg)) 3))
      (is (pos-int? (:k cfg)))
      (is (pos-int? (:top-k-per-source cfg))))))
