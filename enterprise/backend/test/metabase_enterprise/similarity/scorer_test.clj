(ns metabase-enterprise.similarity.scorer-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.scorer :as scorer]))

(deftest register-and-lookup-test
  (testing "register-view! is idempotent and lookup returns the registered map"
    (let [view-name (keyword (str "test-view-" (random-uuid)))
          v1 {:typed-pairs #{[:card :card]} :compute! (constantly 1)}
          v2 {:typed-pairs #{[:card :card]} :compute! (constantly 2)}]
      (scorer/register-view! view-name v1)
      (is (= v1 (scorer/lookup view-name)))
      (testing "re-registering replaces the prior entry"
        (scorer/register-view! view-name v2)
        (is (= v2 (scorer/lookup view-name))))
      (testing "registered-views includes the view"
        (is (contains? (scorer/registered-views) view-name))))))

(deftest symmetric-edges-emits-both-directions-test
  (testing "symmetric-edges produces (A,B) and (B,A) rows with the same score"
    (let [now   #t "2026-04-27T00:00:00Z"
          edges (scorer/symmetric-edges
                 {:from-type         :card :from-id 1
                  :to-type           :card :to-id   2
                  :view              :co-dashboard
                  :score             0.5
                  :contributing-data {:source :report_dashboardcard}
                  :last-computed-at  now})]
      (is (= 2 (count edges)))
      (is (= #{[:card 1 :card 2] [:card 2 :card 1]}
             (set (map (juxt :from_entity_type :from_entity_id
                             :to_entity_type   :to_entity_id)
                       edges))))
      (is (= [0.5 0.5] (map :score edges)))
      (is (= [:co-dashboard :co-dashboard] (map :view edges))))))
