(ns metabase-enterprise.semantic-layer.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-layer.api]
   [metabase.test :as mt]))

(comment metabase-enterprise.semantic-layer.api/keep-me)

(def ^:private endpoint "ee/semantic-layer/complexity")

(deftest complexity-endpoint-requires-superuser-test
  (testing "non-superusers are rejected"
    (is (= "You don't have permissions to do that."
           (mt/user-http-request :rasta :get 403 endpoint)))))

(deftest complexity-endpoint-superuser-gets-consistent-totals-test
  (testing "check invariants not covered by schema"
    (let [resp (mt/user-http-request :crowberto :get 200 endpoint)
          component-count  (fn [cat k] (or (get-in resp [cat :components k :count])
                                           (get-in resp [cat :components k :pairs])))
          component-score  (fn [cat k] (get-in resp [cat :components k :score]))
          component-keys   [:entity-count :name-collisions :synonym-pairs
                            :field-count :repeated-measures]
          ;; :synonym-pairs is not monotonic across library → universe: score-synonym-pairs dedupes by
          ;; normalized name and keeps the embedding that `search-index-embedder` returns for that name.
          ;; Adding universe-only entities that share a normalized name with a library entity can flip
          ;; which vector wins, changing pair count and score non-monotonically.
          monotonic-keys   (remove #{:synonym-pairs} component-keys)]
      (testing ":total equals the sum of its component :score values"
        (doseq [catalog [:library :universe]
                :let [{:keys [total components]} (get resp catalog)]]
          (is (= total (reduce + 0 (map :score (vals components))))
              (format "%s :total should equal sum of component :score values" catalog))))
      (testing "universe is a superset of library: every count and score ≥ library's"
        (doseq [k monotonic-keys
                metric [:count :score]
                :let [lib (if (= metric :count) (component-count :library k)  (component-score :library k))
                      uni (if (= metric :count) (component-count :universe k) (component-score :universe k))]]
          (is (>= uni lib)
              (format "universe %s %s (%d) should be ≥ library's (%d)" k metric uni lib))))
      (testing ":synonym-pairs can't exceed the number of distinct-name pairs possible"
        (doseq [catalog [:library :universe]
                :let [n-entities (component-count catalog :entity-count)
                      syn-pairs  (component-count catalog :synonym-pairs)
                      max-pairs  (/ (* n-entities (dec n-entities)) 2)]]
          (is (<= syn-pairs max-pairs)
              (format "%s :synonym-pairs (%d) can't exceed n*(n-1)/2 for n=%d" catalog syn-pairs n-entities)))))))
