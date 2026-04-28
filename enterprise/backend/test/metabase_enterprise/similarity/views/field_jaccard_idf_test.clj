(ns metabase-enterprise.similarity.views.field-jaccard-idf-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.similarity.runner :as runner]
   [metabase-enterprise.similarity.views.field-jaccard-idf :as field-jaccard-idf]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(set! *warn-on-reflection* true)

(defn- insert-card-fields!
  "Insert one `query_field` row per `field-id` for `card-id`. `column` and
   `table` are NOT NULL on the schema; we fill them with stable strings."
  [card-id field-ids]
  (when (seq field-ids)
    (t2/insert! :query_field
                (for [field-id field-ids]
                  {:card_id            card-id
                   :field_id           field-id
                   :column             (str "f" field-id)
                   :table              "t"
                   :explicit_reference true}))))

(defn- insert-card-field-row!
  "Single-row insert. Use when a test needs a row with `field_id = nil` (the
   collection insert above filters those, but a single-row map can carry the
   nil through verbatim)."
  [row]
  (t2/insert! :query_field (merge {:column "f" :table "t" :explicit_reference true} row)))

(defn- edge-between [card-x card-y]
  (t2/select-one :model/SimilarEdge
                 :view :field-jaccard-idf
                 :from_entity_type :card :from_entity_id card-x
                 :to_entity_type   :card :to_entity_id   card-y))

(defn- approx?
  "Floating-point equality with a small epsilon. The IDF arithmetic involves
   logarithms; bit-exact `==` would be fragile across summation orders."
  [expected actual]
  (< (Math/abs (- (double expected) (double actual))) 1e-6))

(defn- run-with-permissive-thresholds!
  "Drop the count and Jaccard floors so single-shared-field test fixtures
   produce edges. Tests that exercise the floors keep production constants."
  []
  (with-redefs [field-jaccard-idf/intersection-min 1
                field-jaccard-idf/jaccard-min      0.0]
    (runner/run-view! :field-jaccard-idf)))

(deftest ^:sequential pairwise-idf-jaccard-respects-thresholds-test
  (testing "(A, B) sharing 2 fields produces an edge with the weighted-Jaccard score"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}
                     :model/Card {cc :id} {}]
        ;; Field plan (N = 3 cards in scope):
        ;;   x1 (orders.id)         → A, B, C        df = 3
        ;;   x2 (orders.created_at) → A, B           df = 2
        ;;   y_a (orders.user_id)   → A only        df = 1
        ;;   y_b (orders.product_id)→ B only        df = 1
        ;;   z (orders.tax)         → C only        df = 1
        (let [x1  (mt/id :orders :id)
              x2  (mt/id :orders :created_at)
              y-a (mt/id :orders :user_id)
              y-b (mt/id :orders :product_id)
              z   (mt/id :orders :tax)]
          (insert-card-fields! ca [x1 x2 y-a])
          (insert-card-fields! cb [x1 x2 y-b])
          (insert-card-fields! cc [x1 z])
          (try
            (runner/run-view! :field-jaccard-idf)
            (testing "(A, B): shared {x1, x2}, jaccard = ln(4/3) / (ln(4/3) + 2·ln(4/2))"
              (let [w-x1     (Math/log (/ 4.0 4.0))      ; 0 — shared by all 3
                    w-x2     (Math/log (/ 4.0 3.0))      ; ln(4/3)
                    w-uniq   (Math/log (/ 4.0 2.0))      ; ln(2)
                    sum-a    (+ w-x1 w-x2 w-uniq)
                    sum-b    sum-a
                    inter    (+ w-x1 w-x2)
                    expected (/ inter (- (+ sum-a sum-b) inter))
                    edge     (edge-between ca cb)]
                (is (some? edge))
                (is (approx? expected (:score edge))
                    "weighted Jaccard equals hand-computed value")))
            (testing "(A, C): intersection {x1} is below intersection-min=2 — no edge"
              (is (nil? (edge-between ca cc)))
              (is (nil? (edge-between cc ca))))
            (testing "(B, C): intersection {x1} is below intersection-min=2 — no edge"
              (is (nil? (edge-between cb cc))))
            (finally
              (t2/delete! :query_field :card_id [:in [ca cb cc]]))))))))

(deftest ^:sequential symmetric-storage-test
  (testing "edges store both (A → B) and (B → A) with identical scores"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      ;; A third card with an unrelated field ensures `N >= 3`. With only two
      ;; cards in scope the smoothed IDF assigns `w_f = 0` to every field
      ;; that's shared, collapsing the score to zero and tripping the
      ;; `pos? denom` guard before any edge is emitted.
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}
                     :model/Card {cc :id} {}]
        (let [f1 (mt/id :orders :id)
              f2 (mt/id :orders :created_at)
              f3 (mt/id :orders :user_id)
              f4 (mt/id :reviews :id)]
          (insert-card-fields! ca [f1 f2 f3])
          (insert-card-fields! cb [f1 f2 f3])
          (insert-card-fields! cc [f4])
          (try
            (runner/run-view! :field-jaccard-idf)
            (let [a->b (edge-between ca cb)
                  b->a (edge-between cb ca)]
              (is (some? a->b))
              (is (some? b->a))
              (is (= (:score a->b) (:score b->a))
                  "symmetric edge pair carries the same score"))
            (finally
              (t2/delete! :query_field :card_id [:in [ca cb cc]]))))))))

(deftest ^:sequential archived-cards-excluded-test
  (testing "archived cards do not produce edges, even with abundant overlap"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {:archived true}
                     :model/Card {cb :id} {}]
        (let [f1 (mt/id :orders :id)
              f2 (mt/id :orders :created_at)
              f3 (mt/id :orders :user_id)]
          (insert-card-fields! ca [f1 f2 f3])
          (insert-card-fields! cb [f1 f2 f3])
          (try
            (runner/run-view! :field-jaccard-idf)
            (is (nil? (edge-between ca cb)))
            (is (nil? (edge-between cb ca)))
            (finally
              (t2/delete! :query_field :card_id [:in [ca cb]]))))))))

(deftest ^:sequential null-field-id-rows-excluded-test
  (testing "rows with field_id IS NULL do not contribute to the intersection"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}
                     :model/Card {cc :id} {}]
        (let [f1 (mt/id :orders :id)
              f2 (mt/id :orders :created_at)
              f3 (mt/id :reviews :id)]
          ;; A has 2 resolved fields and 1 unresolved (native query) row.
          ;; C is unrelated padding so `N >= 3` (otherwise smoothed IDF
          ;; collapses to zero — see symmetric-storage-test).
          (insert-card-fields! ca [f1 f2])
          (insert-card-field-row! {:card_id ca :field_id nil :column "unresolved"})
          (insert-card-fields! cb [f1 f2])
          (insert-card-fields! cc [f3])
          (try
            (runner/run-view! :field-jaccard-idf)
            (let [edge (edge-between ca cb)]
              (is (some? edge))
              (is (= 2 (-> edge :contributing_data :metric :intersection))
                  "the NULL field_id row does not inflate the intersection"))
            (finally
              (t2/delete! :query_field :card_id [:in [ca cb cc]]))))))))

(deftest ^:sequential intersection-min-filter-test
  (testing "a single-shared-field pair is filtered by intersection-min, even at high IDF"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}]
        (let [shared (mt/id :orders :id)
              extra-a (mt/id :orders :user_id)
              extra-b (mt/id :orders :product_id)]
          ;; A and B share exactly one field. Even with no other cards in scope
          ;; the field has `df = 2`, but the count floor is checked independently.
          (insert-card-fields! ca [shared extra-a])
          (insert-card-fields! cb [shared extra-b])
          (try
            (runner/run-view! :field-jaccard-idf)
            (is (nil? (edge-between ca cb))
                "intersection = 1 < intersection-min = 2 → no edge")
            (finally
              (t2/delete! :query_field :card_id [:in [ca cb]]))))))))

(deftest ^:sequential jaccard-min-filter-test
  (testing "a pair with intersection ≥ 2 but Jaccard below the floor produces no edge"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}
                     :model/Card {cc :id} {}]
        ;; A and B each have 12 fields, sharing exactly 2. Unweighted Jaccard
        ;; is 2/22 ≈ 0.091 — below jaccard-min = 0.10. C exists only to make N
        ;; large enough that the smoothed IDF assigns positive weight to all
        ;; shared fields (otherwise df = N collapses w_f to 0 and the test
        ;; passes for the wrong reason).
        (let [shared    [(mt/id :orders :id) (mt/id :orders :created_at)]
              a-only    [(mt/id :orders :user_id) (mt/id :orders :product_id)
                         (mt/id :orders :subtotal) (mt/id :orders :tax)
                         (mt/id :orders :total) (mt/id :orders :discount)
                         (mt/id :orders :quantity)
                         (mt/id :products :id) (mt/id :products :ean)
                         (mt/id :products :title)]
              b-only    [(mt/id :people :id) (mt/id :people :address)
                         (mt/id :people :email) (mt/id :people :password)
                         (mt/id :people :name) (mt/id :people :city)
                         (mt/id :people :longitude) (mt/id :people :state)
                         (mt/id :people :source) (mt/id :people :birth_date)]
              c-only    [(mt/id :reviews :id)]]
          (insert-card-fields! ca (into shared a-only))
          (insert-card-fields! cb (into shared b-only))
          (insert-card-fields! cc c-only)
          (try
            (runner/run-view! :field-jaccard-idf)
            (is (nil? (edge-between ca cb))
                "weighted Jaccard ≈ 0.09 < jaccard-min = 0.10 → no edge")
            (finally
              (t2/delete! :query_field :card_id [:in [ca cb cc]]))))))))

(deftest ^:sequential idf-downweights-common-fields-test
  (testing "pairs whose only overlap is a rare field score higher than pairs sharing only a common field"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id}  {}
                     :model/Card {cb :id}  {}
                     :model/Card {cc :id}  {}
                     :model/Card {cd :id}  {}
                     :model/Card {f1 :id}  {}
                     :model/Card {f2 :id}  {}
                     :model/Card {f3 :id}  {}
                     :model/Card {f4 :id}  {}
                     :model/Card {f5 :id}  {}]
        ;; Common field: orders.id, used by A, B, F1..F5      → df = 7
        ;; Rare   field: people.email, used by C, D            → df = 2
        ;; Plus one unique field per AB/CD card so card sizes match.
        (let [common  (mt/id :orders :id)
              rare    (mt/id :people :email)
              ax      (mt/id :orders :user_id)
              by      (mt/id :orders :product_id)
              cx      (mt/id :reviews :id)
              dy      (mt/id :reviews :reviewer)]
          (insert-card-fields! ca [common ax])
          (insert-card-fields! cb [common by])
          (insert-card-fields! cc [rare cx])
          (insert-card-fields! cd [rare dy])
          (doseq [pad [f1 f2 f3 f4 f5]]
            (insert-card-fields! pad [common]))
          (try
            (run-with-permissive-thresholds!)
            (let [ab (edge-between ca cb)
                  cd-edge (edge-between cc cd)]
              (is (some? ab))
              (is (some? cd-edge))
              (is (< (:score ab) (:score cd-edge))
                  "rare-field overlap → higher weighted Jaccard than common-field overlap"))
            (finally
              (t2/delete! :query_field
                          :card_id [:in [ca cb cc cd f1 f2 f3 f4 f5]]))))))))

(deftest ^:sequential contributing-data-shape-test
  (testing ":contributing_data carries source + the five metric keys, with denom = a+b−num"
    (mt/with-model-cleanup [:model/Card :model/SimilarEdge :model/SimilarEdgeStatus]
      (mt/with-temp [:model/Card {ca :id} {}
                     :model/Card {cb :id} {}
                     :model/Card {cc :id} {}]
        (let [f1 (mt/id :orders :id)
              f2 (mt/id :orders :created_at)
              f3 (mt/id :orders :user_id)
              f4 (mt/id :orders :product_id)
              f5 (mt/id :reviews :id)]
          ;; cc carries an unrelated field so `N >= 3` (otherwise the smoothed
          ;; IDF collapses every shared-field weight to zero — see
          ;; symmetric-storage-test).
          (insert-card-fields! ca [f1 f2 f3])
          (insert-card-fields! cb [f1 f2 f4])
          (insert-card-fields! cc [f5])
          (try
            (runner/run-view! :field-jaccard-idf)
            (let [edge   (edge-between ca cb)
                  data   (:contributing_data edge)
                  metric (:metric data)]
              (is (some? edge))
              (is (= "query_field" (:source data)))
              (is (= 2 (:intersection metric)))
              (is (every? #(contains? metric %)
                          [:intersection :idf-numerator :idf-denominator :size-a :size-b]))
              (is (approx? (:idf-denominator metric)
                           (- (+ (:size-a metric) (:size-b metric)) (:idf-numerator metric)))
                  "denominator = size-a + size-b − numerator (union-of-weights identity)"))
            (finally
              (t2/delete! :query_field :card_id [:in [ca cb cc]]))))))))
