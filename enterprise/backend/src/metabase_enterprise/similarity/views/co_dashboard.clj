(ns metabase-enterprise.similarity.views.co-dashboard
  "Pairwise Jaccard over the dashboards each card appears on. Two cards co-occur
   on a dashboard ⇒ they are similar, weighted by `|D_a ∩ D_b| / |D_a ∪ D_b|`.

   Symmetric — emits `(A → B)` and `(B → A)` for each undirected pair so the
   query API can look up neighbors by `from_entity_*` alone."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.similarity.scorer :as scorer]
   [toucan2.core :as t2]))

(def ^:private intersection-min
  "Minimum dashboard overlap to emit an edge. Any shared dashboard is real signal
   for co-dashboard, so the threshold is `1`."
  1)

(def ^:private jaccard-min
  "Minimum Jaccard coefficient to emit an edge. Co-dashboard is high-precision
   already; let RRF handle ranking. Loose threshold by design."
  0.05)

(defn- compute-pairs
  "Reducible of `{:card_a :card_b :intersection_size :size_a :size_b}` rows for
   each unordered pair `(card_a < card_b)` with non-empty dashboard overlap."
  []
  (t2/reducible-query
   {:with [[:card-dashboards
            {:select-distinct [:dc.card_id :dc.dashboard_id]
             :from   [[:report_dashboardcard :dc]]
             :join   [[:report_card :c] [:= :c.id :dc.card_id]]
             :where  [:and
                      [:not= :dc.card_id nil]
                      [:= :c.archived false]]}]
           [:card-size
            {:select   [:card_id [[:count :*] :n]]
             :from     [:card-dashboards]
             :group-by [:card_id]}]]
    :select   [[:a.card_id :card_a]
               [:b.card_id :card_b]
               [[:count :*] :intersection_size]
               [:sa.n :size_a]
               [:sb.n :size_b]]
    :from     [[:card-dashboards :a]]
    :join     [[:card-dashboards :b] [:and
                                      [:= :a.dashboard_id :b.dashboard_id]
                                      [:< :a.card_id :b.card_id]]
               [:card-size :sa]      [:= :sa.card_id :a.card_id]
               [:card-size :sb]      [:= :sb.card_id :b.card_id]]
    :group-by [:a.card_id :b.card_id :sa.n :sb.n]
    :having   [:>= [:count :*] [:inline intersection-min]]}))

(defn- ->edges [{:keys [card_a card_b intersection_size size_a size_b]} now]
  (let [union   (- (+ size_a size_b) intersection_size)
        jaccard (/ (double intersection_size) union)]
    (when (>= jaccard jaccard-min)
      (scorer/symmetric-edges
       {:from-type         :card :from-id card_a
        :to-type           :card :to-id   card_b
        :view              :co-dashboard
        :score             jaccard
        :contributing-data {:source "report_dashboardcard"
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

(scorer/register-view! :co-dashboard
                       {:phase       :base
                        :typed-pairs #{[:card :card]}
                        :compute!    compute!})
