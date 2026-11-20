(ns metabase.search.query-semantics-fixture-test
  "Contracts for the recorded search scenarios and engine-aware query adaptations."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.search.query-semantics :as fixtures]
   [metabase.search.query-semantics-stats :as stats]))

(deftest ^:parallel corpus-engine-coverage-test
  (doseq [scenario fixtures/cases
          path     [[:in-place] [:appdb-h2] [:appdb-mysql] [:appdb-postgres]
                    [:semantic :keyword] [:semantic :vector]]]
    (is (some? (get-in scenario (into [:expect] path))) (str (:id scenario) " / " path))))

(deftest ^:parallel semantic-vector-alias-test
  (let [scenario {:expect {:semantic {:keyword [:A], :vector [:B]}}}]
    (is (= #{:B} (fixtures/expected-hits scenario :semantic)
           (fixtures/expected-hits scenario :semantic-only)))))

(deftest ^:parallel semantic-with-fallback-test
  (are [expected semantic postgres] (= expected (fixtures/expected-hits {:expect {:semantic       semantic
                                                                                  :appdb-postgres postgres}}
                                                                        :semantic-with-fallback))
    ;; Both arms, topped up with app-db's hits
    #{:A :B :C} {:keyword [:A], :vector [:B]} [:C]
    #{:B :C}    {:vector [:B]}                [:C]
    ;; Semantic search does not fall back when its own arms found nothing
    #{}         {:keyword [], :vector []}     [:C]))

(deftest ^:parallel translated-comparisons-change-a-query-test
  (doseq [{:keys [scenario-id focus specs]} (stats/translation-rows fixtures/cases)]
    (is (< 1 (count (set (map (comp :query specs) stats/engines))))
        (str scenario-id " / " focus " does not adapt any query"))))

(deftest ^:parallel comparisons-have-a-goal-kind-test
  (doseq [{:keys [id comparisons]} fixtures/cases
          {:keys [focus kind]}     comparisons]
    (is (some #{kind} stats/goal-kinds)
        (str id " / " focus " has no known goal kind"))))

(deftest ^:parallel comparison-ids-are-unique-test
  ;; Report links name a comparison by its id.
  (let [ids (for [{:keys [comparisons]} fixtures/cases, {:keys [id]} comparisons] id)]
    (is (= (count ids) (count (set (filter string? ids)))))))

(deftest ^:parallel scenario-ids-are-unique-test
  (let [ids (map :id fixtures/cases)]
    (is (every? #(and (string? %) (not (str/blank? %))) ids))
    (is (= (count ids) (count (set ids))))))
