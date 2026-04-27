(ns metabase-enterprise.similarity.views.source-table-jaccard
  "Pairwise sparse Jaccard over the source tables each card queries.

   Mirrors `co-dashboard` structurally; thresholds are stricter to suppress the
   very common single-shared-table case (every card touching `orders` would be
   a neighbor of every other card touching `orders`). Symmetric — emits both
   `(A → B)` and `(B → A)`."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.similarity.scorer :as scorer]
   [toucan2.core :as t2]))

(def ^:private intersection-min
  "Minimum shared-table count. Single-table overlaps are too noisy: every card
   touching one common fact table would otherwise be a neighbor of every other.
   Drop to `1` only if Phase 5 eval shows a recall regression."
  2)

(def ^:private jaccard-min
  "Minimum Jaccard coefficient. Tighter than co-dashboard because the table set
   tends to be small."
  0.1)

(defn- compute-pairs
  "Reducible of `{:card_a :card_b :intersection_size :size_a :size_b}` rows for
   each unordered pair `(card_a < card_b)` with non-empty table overlap."
  []
  (t2/reducible-query
   {:with [[:card-tables
            {:select-distinct [:qt.card_id :qt.table_id]
             :from   [[:query_table :qt]]
             :join   [[:report_card :c] [:= :c.id :qt.card_id]]
             :where  [:and
                      [:not= :qt.table_id nil]
                      [:= :c.archived false]]}]
           [:card-size
            {:select   [:card_id [[:count :*] :n]]
             :from     [:card-tables]
             :group-by [:card_id]}]]
    :select   [[:a.card_id :card_a]
               [:b.card_id :card_b]
               [[:count :*] :intersection_size]
               [:sa.n :size_a]
               [:sb.n :size_b]]
    :from     [[:card-tables :a]]
    :join     [[:card-tables :b] [:and
                                  [:= :a.table_id :b.table_id]
                                  [:< :a.card_id :b.card_id]]
               [:card-size :sa]  [:= :sa.card_id :a.card_id]
               [:card-size :sb]  [:= :sb.card_id :b.card_id]]
    :group-by [:a.card_id :b.card_id :sa.n :sb.n]
    :having   [:>= [:count :*] [:inline intersection-min]]}))

(defn- ->edges [{:keys [card_a card_b intersection_size size_a size_b]} now]
  (let [union   (- (+ size_a size_b) intersection_size)
        jaccard (/ (double intersection_size) union)]
    (when (>= jaccard jaccard-min)
      (scorer/symmetric-edges
       {:from-type         :card :from-id card_a
        :to-type           :card :to-id   card_b
        :view              :source-table-jaccard
        :score             jaccard
        :contributing-data {:source "query_table"
                            :metric {:intersection intersection_size
                                     :union        union
                                     :size-a       size_a
                                     :size-b       size_b}}
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

(scorer/register-view! :source-table-jaccard
                       {:typed-pairs #{[:card :card]}
                        :compute!    compute!})
