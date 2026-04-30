(ns metabase-enterprise.similarity.overlay-test
  "Phase 7 governance overlay tests.

   Layered:
     - Pure-Clojure unit tests for the multiplier formula and the in-process
       view-count percentile, using `with-redefs` to substitute the appdb
       loaders. No DB hits.
     - DB-backed tests that exercise `score-with-overlay` end-to-end against
       real `report_card` / `report_dashboard` / `metabase_table` /
       `moderation_review` / `similarity_pagerank` rows."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.overlay :as overlay]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

;; ----------------------------------------------------------------------------
;; Pure-Clojure unit tests
;; ----------------------------------------------------------------------------

(defn- ->row
  "Minimal row: just enough for `score-with-overlay` to key by `(type id)`."
  [t id score]
  {:from_entity_type :card :from_entity_id 1
   :to_entity_type   t :to_entity_id id
   :view             :ensemble :score (double score)})

(defn- approx= [a b] (< (Math/abs (- (double a) (double b))) 1e-9))

(defn- with-stub-loaders!
  "Run `body-fn` with `load-governance` and `load-pr-percentiles` redefined to
   return the given canned maps. Bypasses the DB for unit tests."
  [gov pr-pcts body-fn]
  (with-redefs [overlay/load-governance     (constantly gov)
                overlay/load-pr-percentiles (constantly pr-pcts)]
    (body-fn)))

(deftest verified-multiplier-test
  (testing "verified card lifts score by exactly 1.4×"
    (let [row [(->row :card 10 1.0)]
          gov {[:card 10] {:verified?  true   :canonical? false :published? false
                           :is-metric? false  :view-count nil}}]
      (with-stub-loaders! gov {}
        (fn []
          (let [[out] (overlay/score-with-overlay row {})]
            (is (approx= 1.4 (:overlay_multiplier out)))
            (is (approx= 1.4 (:score out)))
            (is (approx= 1.0 (:fused_score out)))))))))

(deftest canonical-multiplier-test
  (testing "canonical table lifts by 1.3×"
    (let [row [(->row :table 10 1.0)]
          gov {[:table 10] {:verified?  false :canonical? true :published? false
                            :is-metric? false :view-count nil}}]
      (with-stub-loaders! gov {}
        (fn []
          (is (approx= 1.3 (:overlay_multiplier (first (overlay/score-with-overlay row {}))))))))))

(deftest published-multiplier-test
  (testing "published table lifts by 1.2×"
    (let [row [(->row :table 10 1.0)]
          gov {[:table 10] {:verified?  false :canonical? false :published? true
                            :is-metric? false :view-count nil}}]
      (with-stub-loaders! gov {}
        (fn []
          (is (approx= 1.2 (:overlay_multiplier (first (overlay/score-with-overlay row {}))))))))))

(deftest is-metric-multiplier-test
  (testing "metric card lifts by 1.2×"
    (let [row [(->row :card 10 1.0)]
          gov {[:card 10] {:verified?  false :canonical? false :published? false
                           :is-metric? true  :view-count nil}}]
      (with-stub-loaders! gov {}
        (fn []
          (is (approx= 1.2 (:overlay_multiplier (first (overlay/score-with-overlay row {}))))))))))

(deftest all-booleans-product-test
  (testing "all flags on (no percentile terms) ⇒ 1.4 · 1.3 · 1.2 · 1.2"
    (let [row [(->row :card 10 1.0)]
          gov {[:card 10] {:verified?  true :canonical? true :published? true
                           :is-metric? true :view-count nil}}]
      (with-stub-loaders! gov {}
        (fn []
          (let [m (:overlay_multiplier (first (overlay/score-with-overlay row {})))]
            (is (approx= (* 1.4 1.3 1.2 1.2) m))))))))

(deftest ceiling-clamp-test
  (testing "the multiplier is clamped at the configured ceiling"
    (let [row [(->row :card 10 1.0)]
          ;; Booleans alone come to ~2.62; vc=999 (n=1 ⇒ pct 0.5 ⇒ +0.25 term)
          ;; and PR pct=1.0 (+0.4 term) push the unclamped product past 4.0.
          gov {[:card 10] {:verified?  true :canonical? true :published? true
                           :is-metric? true :view-count 999}}
          pr  {[:card 10] 1.0}]
      (with-stub-loaders! gov pr
        (fn []
          (let [m (:overlay_multiplier (first (overlay/score-with-overlay row {})))
                ceiling (:ceiling overlay/governance-config)]
            (is (approx= ceiling m))))))))

(deftest unclamped-maximum-fence-test
  (testing "current six factors must exceed the ceiling — adding a new signal forces calibration"
    (let [{:keys [multipliers ceiling]} overlay/governance-config
          {:keys [verified canonical published is-metric
                  view-count-coef pagerank-coef]} multipliers
          unclamped (* verified canonical published is-metric
                       (+ 1.0 view-count-coef)
                       (+ 1.0 pagerank-coef))]
      (is (> unclamped ceiling)
          (format "unclamped max %.3f should exceed ceiling %.3f" unclamped ceiling)))))

(deftest view-count-percentile-spread-test
  (testing "20 candidates with descending view counts: top → 1.0 pct, bottom → 0.0 pct"
    (let [n   20
          ids (range 100 (+ 100 n))
          rows (mapv (fn [id] (->row :card id 1.0)) ids)
          ;; Higher id ⇒ higher view-count.
          gov  (into {} (map (fn [id]
                               [[:card id] {:verified?  false :canonical? false
                                            :published? false :is-metric? false
                                            :view-count (- id 99)}]))
                     ids)]
      (with-stub-loaders! gov {}
        (fn []
          (let [out      (overlay/score-with-overlay rows {})
                by-id    (into {} (map (juxt :to_entity_id :overlay_multiplier)) out)
                top-mul  (by-id (+ 100 (dec n)))
                base-mul (by-id 100)]
            ;; Top: 1 + 0.5*1.0 = 1.5
            (is (approx= 1.5 top-mul))
            ;; Bottom: 1 + 0.5*0.0 = 1.0
            (is (approx= 1.0 base-mul))))))))

(deftest pr-percentile-term-test
  (testing "PR percentile contributes (1 + 0.4·pct) to the multiplier"
    (let [row [(->row :card 10 1.0)]
          gov {[:card 10] {:verified?  false :canonical? false :published? false
                           :is-metric? false :view-count nil}}]
      (doseq [pct [0.0 0.25 0.5 0.75 1.0]]
        (with-stub-loaders! gov {[:card 10] pct}
          (fn []
            (let [m (:overlay_multiplier (first (overlay/score-with-overlay row {})))]
              (is (approx= (+ 1.0 (* 0.4 pct)) m)))))))))

(deftest re-sort-flips-order-test
  (testing "post-overlay sort can re-order the result list"
    (let [;; A has a higher fused score, but B is verified and outranks after overlay.
          rows [(->row :card 1 0.50)
                (->row :card 2 0.45)]
          gov  {[:card 1] {:verified?  false :canonical? false :published? false
                           :is-metric? false :view-count nil}
                [:card 2] {:verified?  true  :canonical? false :published? false
                           :is-metric? false :view-count nil}}]
      (with-stub-loaders! gov {}
        (fn []
          (let [out (overlay/score-with-overlay rows {})]
            (is (= [2 1] (mapv :to_entity_id out)))
            (is (> (:score (first out)) (:score (second out))))))))))

(deftest empty-input-noop-test
  (testing "empty rows return [] without DB hits — stubs throw if invoked"
    (with-redefs [overlay/load-governance     (fn [& _] (throw (ex-info "no DB hit allowed" {})))
                  overlay/load-pr-percentiles (fn [& _] (throw (ex-info "no DB hit allowed" {})))]
      (is (= [] (overlay/score-with-overlay [] {})))
      (is (= [] (overlay/score-with-overlay nil {}))))))

(deftest fused-and-multiplier-decoration-test
  (testing ":fused_score and :overlay_multiplier surface on every row"
    (let [rows [(->row :card 1 0.5) (->row :card 2 0.7)]
          gov  {[:card 1] {:verified? false :canonical? false :published? false
                           :is-metric? false :view-count nil}
                [:card 2] {:verified? false :canonical? false :published? false
                           :is-metric? false :view-count nil}}]
      (with-stub-loaders! gov {}
        (fn []
          (let [out (overlay/score-with-overlay rows {})]
            (is (every? :fused_score out))
            (is (every? :overlay_multiplier out))
            (is (= [0.7 0.5] (mapv :fused_score out)))))))))

(deftest nil-percentile-floor-test
  (testing "nil PR percentile contributes 1.0× — no multiplicative zero"
    (let [row [(->row :card 10 1.0)]
          gov {[:card 10] {:verified?  false :canonical? false :published? false
                           :is-metric? false :view-count nil}}]
      ;; pr-pcts map omits the tuple — load-pr-percentiles returned nothing for it.
      (with-stub-loaders! gov {}
        (fn []
          (let [m (:overlay_multiplier (first (overlay/score-with-overlay row {})))]
            (is (approx= 1.0 m))))))))

;; ----------------------------------------------------------------------------
;; DB-backed tests — exercise the loaders against real appdb tables
;; ----------------------------------------------------------------------------

(defn- score-of
  "Return the post-overlay score for the row whose `:to_entity_id` matches `id`."
  [out id]
  (some #(when (= id (:to_entity_id %)) (:score %)) out))

(defn- mult-of
  [out id]
  (some #(when (= id (:to_entity_id %)) (:overlay_multiplier %)) out))

(defn- insert-verified-review!
  [item-type item-id]
  (t2/insert! :model/ModerationReview
              {:moderated_item_id   item-id
               :moderated_item_type item-type
               :moderator_id        (mt/user->id :crowberto)
               :status              "verified"
               :most_recent         true
               :text                "ok"}))

(defn- single-row-mult
  "Run `score-with-overlay` over a one-row input and return the multiplier.
   Pinning to one row makes view-count-percentile a fixed 0.5 (n=1 branch),
   isolating the contribution of the boolean flags from candidate-set noise."
  [t id]
  (let [row {:from_entity_type :card :from_entity_id 999
             :to_entity_type   t     :to_entity_id   id
             :view :ensemble :score 0.5}]
    (:overlay_multiplier (first (overlay/score-with-overlay [row] {})))))

(deftest ^:sequential verified-card-flag-test
  (testing "moderation_review (status='verified', most_recent=true) lights :verified?"
    (mt/with-model-cleanup [:model/Card :model/ModerationReview]
      (mt/with-temp [:model/Card {a :id} {}
                     :model/Card {b :id} {}]
        (insert-verified-review! "card" a)
        (is (approx= (* 1.4 1.25) (single-row-mult :card a)))
        (is (approx= 1.25         (single-row-mult :card b)))))))

(deftest ^:sequential verified-card-floats-up-test
  (testing "end-to-end: verified card outranks unverified peer at the same fused score"
    (mt/with-model-cleanup [:model/Card :model/ModerationReview
                            :model/SimilarityPagerank :model/SimilarityCommunity]
      (mt/with-temp [:model/Card {a :id} {}
                     :model/Card {b :id} {}]
        (insert-verified-review! "card" a)
        (let [rows [{:from_entity_type :card :from_entity_id 999
                     :to_entity_type   :card :to_entity_id b
                     :view :ensemble :score 0.5}
                    {:from_entity_type :card :from_entity_id 999
                     :to_entity_type   :card :to_entity_id a
                     :view :ensemble :score 0.5}]
              out  (overlay/score-with-overlay rows {})]
          (is (= a (-> out first :to_entity_id)))
          (is (> (score-of out a) (score-of out b))))))))

(deftest ^:sequential metric-card-flag-test
  (testing "report_card.type='metric' lights :is-metric?"
    (mt/with-model-cleanup [:model/Card :model/SimilarityPagerank :model/SimilarityCommunity]
      (mt/with-temp [:model/Card {q :id} {}
                     :model/Card {m :id} {:type :metric}]
        ;; n=1 vc-pct = 0.5 ⇒ vc-mult = 1.25; metric flag adds 1.2× factor.
        (is (approx= 1.25         (single-row-mult :card q)))
        (is (approx= (* 1.2 1.25) (single-row-mult :card m)))))))

(deftest ^:sequential canonical-table-flag-test
  (testing "metabase_table.data_layer='final' lights :canonical?"
    (mt/with-model-cleanup [:model/Table :model/SimilarityPagerank :model/SimilarityCommunity]
      (mt/with-temp [:model/Table {final-t :id} {:data_layer :final}
                     :model/Table {plain-t :id} {}]
        (is (approx= 1.25         (single-row-mult :table plain-t)))
        (is (approx= (* 1.3 1.25) (single-row-mult :table final-t)))))))

(deftest ^:sequential published-table-flag-test
  (testing "metabase_table.is_published=true lights :published?"
    (mt/with-model-cleanup [:model/Table :model/SimilarityPagerank :model/SimilarityCommunity]
      (mt/with-temp [:model/Table {pub-t :id}   {:is_published true}
                     :model/Table {plain-t :id} {}]
        (is (approx= 1.25         (single-row-mult :table plain-t)))
        (is (approx= (* 1.2 1.25) (single-row-mult :table pub-t)))))))

(deftest ^:sequential cold-pr-and-community-test
  (testing "empty similarity_pagerank ⇒ PR term degrades to 1.0× (no exception)"
    (mt/with-model-cleanup [:model/Card :model/SimilarityPagerank]
      (mt/with-temp [:model/Card {c :id} {}]
        (let [rows [{:from_entity_type :card :from_entity_id 999
                     :to_entity_type   :card :to_entity_id c
                     :view :ensemble :score 0.7}]
              out  (overlay/score-with-overlay rows {})]
          ;; Single card → view-count percentile = 0.5 → 1 + 0.5*0.5 = 1.25
          ;; No PR row, no other booleans set: total mult = 1.25
          (is (some? (first out)))
          (is (number? (mult-of out c))))))))

(deftest ^:sequential mixed-type-result-list-test
  (testing "per-type loader returns governance attrs without cross-pollination"
    (mt/with-model-cleanup [:model/Card :model/Table :model/Dashboard
                            :model/ModerationReview
                            :model/SimilarityPagerank :model/SimilarityCommunity]
      (mt/with-temp [:model/Card      {c :id} {}
                     :model/Table     {t :id} {:data_layer :final}
                     :model/Dashboard {d :id} {}]
        (let [rows [{:from_entity_type :card :from_entity_id 999
                     :to_entity_type   :card :to_entity_id c
                     :view :ensemble :score 0.5}
                    {:from_entity_type :card :from_entity_id 999
                     :to_entity_type   :table :to_entity_id t
                     :view :ensemble :score 0.5}
                    {:from_entity_type :card :from_entity_id 999
                     :to_entity_type   :dashboard :to_entity_id d
                     :view :ensemble :score 0.5}]
              out  (overlay/score-with-overlay rows {})]
          ;; Table is canonical → biggest multiplier; the others should not pick
          ;; up the table flag.
          (is (> (mult-of out t) (mult-of out c)))
          (is (> (mult-of out t) (mult-of out d))))))))
