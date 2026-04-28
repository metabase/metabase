(ns metabase-enterprise.similarity.views.field-jaccard-idf
  "IDF-weighted pairwise Jaccard over the fields each card references.

   Source is `query_field` (one row per `(card, field)` reference, populated by
   the query analyzer on card create/update). For each field `f`, compute the
   smoothed IDF weight `w_f = ln((1 + N) / (1 + df_f))` where `N` is the count
   of distinct cards in scope and `df_f` is the count of cards using `f`. The
   per-pair score is the weighted Jaccard

       Σ_{f ∈ A∩B} w_f
       ───────────────────────────────────────
       Σ_{f ∈ A} w_f + Σ_{f ∈ B} w_f − Σ_∩ w_f

   Compared with `source-table-jaccard`, this view sees the column-level overlap
   that table-level Jaccard misses, and the IDF weighting downweights surrogate
   keys / `created_at`-style fields that nearly every card touches.

   Symmetric — emits both `(A → B)` and `(B → A)`."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.similarity.scorer :as scorer]
   [toucan2.core :as t2]))

(def ^:private intersection-min
  "Minimum count of shared fields. The IDF threshold below also filters, but
   the count floor is cheap (HAVING) and bounds the post-aggregate row set.
   Single-shared-field pairs are noisy on this corpus (~290K of 535K
   `shared ≥ 1` pairs in `stats-20260424`)."
  2)

(def ^:private jaccard-min
  "Minimum IDF-weighted Jaccard. Calibrated on `stats-20260424` to land in the
   same band as the unweighted `source-table-jaccard` view (~92K rows) while
   preserving the long tail of moderately-rare-field overlaps that
   `source-table-jaccard` is structurally blind to. See phase 6.2 doc §5."
  0.10)

(defn- compute-pairs
  "Reducible of one row per surviving unordered pair `(card_a < card_b)`:
   `{:card_a :card_b :shared :idf_numerator :w_sum_a :w_sum_b}`.

   CTE chain:
     cards_w_fields — DISTINCT (card_id, field_id) over non-archived cards with
                      non-null field_id.
     n_cards        — scalar: count of distinct cards in scope, cast to double.
     df             — per-field doc-frequency + smoothed IDF weight `w_f`.
     card_w         — per-card sum of `w_f` (Σ over the card's fields).
     pair_inter     — self-join `cards_w_fields` by field with `a < b`; group by
                      `(a, b)` and aggregate `count(*)` and `sum(w)`. HAVING
                      `count(*) >= intersection-min`.

   The outer SELECT joins `card_w` twice for the two per-card sums; the
   per-pair Jaccard is computed in `->edges` from the four returned numbers."
  []
  (t2/reducible-query
   {:with [[:cards_w_fields
            {:select-distinct [:qf.card_id :qf.field_id]
             :from   [[:query_field :qf]]
             :join   [[:report_card :c] [:= :c.id :qf.card_id]]
             :where  [:and
                      [:not= :qf.field_id nil]
                      [:= :c.archived false]]}]
           [:n_cards
            ;; No CAST here: HoneySQL would emit `:double` as `DOUBLE`, which
            ;; is not a valid Postgres type. The `[:inline 1.0]` literal in the
            ;; `df` CTE below promotes the arithmetic to floating point, and
            ;; PG's `LN(numeric)` returns `numeric` — no integer-division risk.
            {:select [[[:count [:distinct :card_id]] :n]]
             :from   [:cards_w_fields]}]
           [:df
            {:select   [:field_id
                        [[:count :*] :df_f]
                        [[:ln [:/ [:+ [:inline 1.0]
                                   {:select [:n] :from [:n_cards]}]
                               [:+ [:inline 1.0] [:count :*]]]] :w]]
             :from     [:cards_w_fields]
             :group-by [:field_id]}]
           [:card_w
            {:select   [:cf.card_id [[:sum :d.w] :w_sum]]
             :from     [[:cards_w_fields :cf]]
             :join     [[:df :d] [:= :d.field_id :cf.field_id]]
             :group-by [:cf.card_id]}]
           [:pair_inter
            {:select   [[:a.card_id :card_a]
                        [:b.card_id :card_b]
                        [[:count :*] :shared]
                        [[:sum :d.w] :idf_numerator]]
             :from     [[:cards_w_fields :a]]
             :join     [[:cards_w_fields :b] [:and
                                              [:= :a.field_id :b.field_id]
                                              [:< :a.card_id :b.card_id]]
                        [:df :d] [:= :d.field_id :a.field_id]]
             :group-by [:a.card_id :b.card_id]
             :having   [:>= [:count :*] [:inline intersection-min]]}]]
    :select [[:pi.card_a        :card_a]
             [:pi.card_b        :card_b]
             [:pi.shared        :shared]
             [:pi.idf_numerator :idf_numerator]
             [:cwa.w_sum        :w_sum_a]
             [:cwb.w_sum        :w_sum_b]]
    :from   [[:pair_inter :pi]]
    :join   [[:card_w :cwa] [:= :cwa.card_id :pi.card_a]
             [:card_w :cwb] [:= :cwb.card_id :pi.card_b]]}))

(defn- ->edges [{:keys [card_a card_b shared idf_numerator w_sum_a w_sum_b]} now]
  (let [num   (double idf_numerator)
        denom (- (+ (double w_sum_a) (double w_sum_b)) num)]
    (when (and (pos? denom) (>= (/ num denom) jaccard-min))
      (scorer/symmetric-edges
       {:from-type         :card :from-id card_a
        :to-type           :card :to-id   card_b
        :view              :field-jaccard-idf
        :score             (/ num denom)
        :contributing-data {:source "query_field"
                            :metric {:intersection    shared
                                     :idf-numerator   num
                                     :idf-denominator denom
                                     :size-a          (double w_sum_a)
                                     :size-b          (double w_sum_b)}}
        :last-computed-at  now}))))

(defn- compute! [{:keys [batch-size] :or {batch-size 500}}]
  (let [now (t/offset-date-time)]
    (transduce (comp (mapcat #(->edges % now))
                     (partition-all batch-size))
               (completing
                (fn [total batch]
                  (t2/insert! :model/SimilarEdge batch)
                  (+ total (count batch))))
               0
               (compute-pairs))))

(scorer/register-view! :field-jaccard-idf
                       {:phase       :base
                        :typed-pairs #{[:card :card]}
                        :compute!    compute!})
