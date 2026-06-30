(ns metabase.explorations.groups-test
  "Pure tests for the read-side group tree — specifically the adaptive-loop
  filter-path-aware leaf identity and naming (Issue 4)."
  (:require
   [clojure.test :refer :all]
   [metabase.explorations.groups :as explorations.groups]))

(deftest group-anchor-type-test
  (testing "an explicit :type is honored"
    (is (= "metric"    (explorations.groups/group-anchor-type {:type "metric"    :metrics [{} {}]})))
    (is (= "dimension" (explorations.groups/group-anchor-type {:type "dimension" :metrics [{}]}))))
  (testing "a legacy / type-less group is inferred — a block crossing several metrics is
            dimension-anchored, otherwise metric-anchored (never throws)"
    (is (= "metric"    (explorations.groups/group-anchor-type {:metrics [{}]})))
    (is (= "metric"    (explorations.groups/group-anchor-type {:type nil :metrics [{}]})))
    (is (= "dimension" (explorations.groups/group-anchor-type {:type nil :metrics [{} {}]})))
    (is (= "metric"    (explorations.groups/group-anchor-type {})))))

(deftest filter-path-suffix-test
  (testing "filter-path-suffix renders a resolved drill label, or empty when undrilled"
    (let [labels {"state" "State" "source" "Source"}]
      (is (= "" (explorations.groups/filter-path-suffix labels {:params {:filter_path []}})))
      (is (= "" (explorations.groups/filter-path-suffix labels {})))
      (is (= " (State = TX)"
             (explorations.groups/filter-path-suffix labels
                                                     {:params {:filter_path [{:dimension_id "state" :value "TX"}]}})))
      (is (= " (State = TX, Source = Google)"
             (explorations.groups/filter-path-suffix
              labels {:params {:filter_path [{:dimension_id "state" :value "TX"}
                                             {:dimension_id "source" :value "Google"}]}})))
      (testing "unknown dimension ids fall back to the raw id"
        (is (= " (mystery = 7)"
               (explorations.groups/filter-path-suffix
                labels {:params {:filter_path [{:dimension_id "mystery" :value 7}]}})))))))

(deftest filter-path-key-test
  (testing "same path → same key; different path → different key; undrilled → nil"
    (let [k (fn [& steps] (explorations.groups/filter-path-key {:params {:filter_path (vec steps)}}))
          s (fn [d v] {:dimension_id d :value v})]
      (is (nil? (explorations.groups/filter-path-key {:params {:filter_path []}})))
      (is (nil? (explorations.groups/filter-path-key {})))
      (is (= (k (s "state" "TX")) (k (s "state" "TX"))))
      (is (not= (k (s "state" "TX") (s "source" "Google"))
                (k (s "state" "TX") (s "source" "Twitter")))))))

(deftest group-tree-drilled-survivors-get-distinct-leaves-test
  (testing "Adaptive-loop survivors at the same (card, dim) but different filter paths get distinct leaves; same path bundles"
    (let [fp     (fn [& steps] {:filter_path (vec steps)})
          step   (fn [d v] {:dimension_id d :value v})
          groups (explorations.groups/group-tree
                  [{:id 5 :metrics [{:card_id 10}]
                    :dimensions [{:dimension_id "title"  :display_name "Title"}
                                 {:dimension_id "state"  :display_name "State"}
                                 {:dimension_id "source" :display_name "Source"}]}]
                  [{:id 1 :group_id 5 :card_id 10 :dimension_id "title" :segment_id nil
                    :name "Revenue by Title" :params (fp)}
                   {:id 2 :group_id 5 :card_id 10 :dimension_id "title" :segment_id nil
                    :name "Revenue by Title" :params (fp (step "state" "TX") (step "source" "Google"))}
                   {:id 3 :group_id 5 :card_id 10 :dimension_id "title" :segment_id nil
                    :name "Revenue by Title (Year over year)" :params (fp (step "state" "TX") (step "source" "Google"))}
                   {:id 4 :group_id 5 :card_id 10 :dimension_id "title" :segment_id nil
                    :name "Revenue by Title" :params (fp (step "state" "TX") (step "source" "Twitter"))}]
                  {10 "Revenue"})
          leaves (filter #(= "5" (:parent_group_id %)) groups)
          by-ids (into {} (map (juxt #(set (:query_ids %)) identity)) leaves)]
      (testing "three distinct leaves — one per filter path — not one merged leaf"
        (is (= 3 (count leaves)))
        (is (= 3 (count (distinct (map :id leaves)))) "leaf ids are distinct"))
      (testing "the same-path variant bundles into one leaf"
        (is (contains? by-ids #{2 3}) "TX/Google base + its YoY variant share a leaf")
        (is (contains? by-ids #{1}))
        (is (contains? by-ids #{4})))
      (testing "drilled leaf names carry the resolved filter path; undrilled is unchanged"
        (let [name-of (fn [ids] (:name (get by-ids ids)))]
          (is (= "Revenue by Title" (name-of #{1})) "undrilled name unchanged")
          (is (re-find #"State = TX" (name-of #{2 3})))
          (is (re-find #"Source = Google" (name-of #{2 3})))
          (is (re-find #"Source = Twitter" (name-of #{4})))
          (is (not= (name-of #{2 3}) (name-of #{4})) "the two TX drills are now distinguishable"))))))
