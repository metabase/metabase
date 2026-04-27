(ns metabase-enterprise.similarity.views.co-execution
  "Behavioral similarity from user-driven `query_execution` rows.

   Sessionize each user's executions (30-min idle gap), then weight per pair
   by sum-over-sessions of `1/log(1 + session_size)`, normalized by
   `sqrt(n_sessions_a * n_sessions_b)` (popularity correction).

   Symmetric — emits `(A, B)` and `(B, A)` per `scorer/symmetric-edges`.
   Filtered to user-driven contexts (`question`, `ad-hoc`) so the signal is
   distinct from `co-dashboard` (which captures the systematic 'open dashboard
   → all cards execute' co-occurrence).

   Cannot run on a cold instance — registers a `:density-check` so the runner
   short-circuits to `:skipped` rather than recording a green zero-row build."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.similarity.scorer :as scorer]
   [metabase.app-db.core :as app-db]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private session-gap-seconds
  "Idle gap defining a session boundary. 30 minutes."
  1800)

(def ^:private min-co-sessions
  "Pairs co-occurring in fewer than this many sessions are dropped. Default `2`
   tracks the stats-DB projection band; calibrate at Phase 5 eval."
  2)

(def ^:private density-thresholds
  "Minima below which the view is skipped. All three must pass."
  {:min-rows              1000
   :min-distinct-sessions 50
   :min-distinct-cards    20})

(def ^:private user-driven-contexts
  "Contexts where the executor *chose* to run the card. `dashboard` and
   `dashboard-subscription` are excluded — those are systematic firings already
   covered by `co-dashboard` and Phase 11's `pulse-co-membership`."
  ["question" "ad-hoc"])

(defn- seconds-between
  "Driver-portable HoneySQL: seconds(later - earlier). Returns NULL when
   `earlier` is NULL (the LAG-of-first-row case)."
  [later earlier]
  (case (app-db/db-type)
    :postgres [:case [:= earlier nil] nil
               :else [:raw "EXTRACT(EPOCH FROM (" [:- later earlier] [:raw "))"]]]
    :mysql    [:case [:= earlier nil] nil
               :else [:timestampdiff [:raw "SECOND"] earlier later]]
    :h2       [:case [:= earlier nil] nil
               :else [:datediff [:raw "SECOND"] earlier later]]))

;; -- density check --------------------------------------------------------

(defn- probe-counts
  "Single-row probe: rows / distinct executors / distinct cards in the
   user-driven slice. Distinct-executors is a coarse lower bound for distinct
   sessions (an executor with any user-driven exec contributes ≥1 session);
   exact session count would require running the LAG window query, which we
   don't want to pay for twice."
  []
  (t2/query-one
   {:select [[[:count :*] :rows]
             [[:count [:distinct :executor_id]] :distinct_executors]
             [[:count [:distinct :card_id]] :distinct_cards]]
    :from   [:query_execution]
    :where  [:and
             [:not= :card_id nil]
             [:not= :executor_id nil]
             [:= :error nil]
             [:in :context user-driven-contexts]]}))

(defn- density-check [_opts]
  (let [{:keys [rows distinct_executors distinct_cards]} (probe-counts)
        {:keys [min-rows min-distinct-sessions min-distinct-cards]} density-thresholds
        ;; Each user contributes at least one session, so distinct_executors
        ;; is a conservative proxy for distinct sessions in the probe — scale
        ;; the session threshold down by 10× to keep the proxy meaningful.
        min-executors (long (Math/ceil (/ min-distinct-sessions 10.0)))
        passes?       (and (>= rows min-rows)
                           (>= distinct_executors min-executors)
                           (>= distinct_cards min-distinct-cards))
        metrics       {:rows               rows
                       :distinct-executors distinct_executors
                       :distinct-cards     distinct_cards
                       :thresholds         density-thresholds}]
    (if passes?
      {:passed? true
       :compute-opts {:source :query-execution}
       :metrics metrics}
      {:passed? false
       :reason  "user-driven query_execution data below threshold"
       :metrics metrics})))

;; -- compute --------------------------------------------------------------

(defn- pair-query
  "HoneySQL query producing one row per surviving unordered pair:
   `{:card_a :card_b :co_session_count :n_sessions_a :n_sessions_b :score}`.

   Seven CTEs do all the work:
     user_driven   — predicate-filter `query_execution`
     gapped        — annotate each row with seconds-since-prev (LAG)
     sessionized   — running SUM(CASE) flips on each large gap → session_idx
     session_cards — DISTINCT (executor, session, card) so a card re-run
                     within a session counts once
     session_size  — |cards in session|, denominator of 1/log(1+s)
     card_sessions — n_sessions per card, denominator of popularity correction
     pairs         — self-join session_cards, keep card_a < card_b for symmetry
     pair_raw      — group by pair, sum score, threshold by min-co-sessions
   The final SELECT divides by sqrt(n_a * n_b) to normalize popularity."
  []
  {:with [[:user_driven
           {:select [:executor_id :card_id :started_at]
            :from   [:query_execution]
            :where  [:and
                     [:not= :card_id nil]
                     [:not= :executor_id nil]
                     [:= :error nil]
                     [:in :context user-driven-contexts]]}]
          [:gapped
           {:select [:executor_id :card_id :started_at
                     [(seconds-between
                       :started_at
                       [:over [[:lag :started_at]
                               {:partition-by [:executor_id]
                                :order-by     [[:started_at :asc]]}]])
                      :gap_sec]]
            :from   [:user_driven]}]
          [:sessionized
           {:select [:executor_id :card_id
                     [[:over
                       [[:sum [:case
                               [:or [:> :gap_sec [:inline session-gap-seconds]]
                                [:= :gap_sec nil]]
                               [:inline 1]
                               :else [:inline 0]]]
                        {:partition-by [:executor_id]
                         :order-by     [[:started_at :asc]]}]]
                      :session_idx]]
            :from   [:gapped]}]
          [:session_cards
           {:select-distinct [:executor_id :session_idx :card_id]
            :from            [:sessionized]}]
          [:session_size
           {:select   [:executor_id :session_idx [[:count :*] :sz]]
            :from     [:session_cards]
            :group-by [:executor_id :session_idx]}]
          [:card_sessions
           {:select   [:card_id [[:count :*] :n_sessions]]
            :from     [:session_cards]
            :group-by [:card_id]}]
          [:pairs
           {:select [[:a.card_id :card_a]
                     [:b.card_id :card_b]
                     [:ss.sz     :session_size]]
            :from   [[:session_cards :a]]
            :join   [[:session_cards :b]
                     [:and
                      [:= :a.executor_id :b.executor_id]
                      [:= :a.session_idx :b.session_idx]
                      [:< :a.card_id :b.card_id]]
                     [:session_size :ss]
                     [:and
                      [:= :ss.executor_id :a.executor_id]
                      [:= :ss.session_idx :a.session_idx]]]}]
          [:pair_raw
           {:select   [:card_a :card_b
                       [[:count :*] :co_session_count]
                       [[:sum [:/ [:inline 1.0]
                               [:ln [:+ [:inline 1] :session_size]]]]
                        :raw_score]]
            :from     [:pairs]
            :group-by [:card_a :card_b]
            :having   [:>= [:count :*] [:inline min-co-sessions]]}]]
   :select [[:pr.card_a :card_a]
            [:pr.card_b :card_b]
            [:pr.co_session_count :co_session_count]
            [:ca.n_sessions :n_sessions_a]
            [:cb.n_sessions :n_sessions_b]
            [[:/ :pr.raw_score
              [:sqrt [:* :ca.n_sessions :cb.n_sessions]]]
             :score]]
   :from   [[:pair_raw :pr]]
   :join   [[:card_sessions :ca] [:= :ca.card_id :pr.card_a]
            [:card_sessions :cb] [:= :cb.card_id :pr.card_b]]})

(defn- ->edges [{:keys [card_a card_b co_session_count n_sessions_a n_sessions_b score]}
                source now]
  (scorer/symmetric-edges
   {:from-type         :card :from-id card_a
    :to-type           :card :to-id   card_b
    :view              :co-execution
    :score             (double score)
    :contributing-data {:source source
                        :metric {:co-session-count co_session_count
                                 :n-sessions-a     n_sessions_a
                                 :n-sessions-b     n_sessions_b}}
    :last-computed-at  now}))

(defn- compute! [{:keys [batch-size source]
                  :or   {batch-size 500
                         source     :query-execution}}]
  (let [now (t/offset-date-time)]
    (transduce (comp (mapcat #(->edges % source now))
                     (partition-all batch-size))
               (completing
                (fn [total batch]
                  (t2/insert! :model/SimilarEdge batch)
                  (+ total (count batch))))
               0
               (t2/reducible-query (pair-query)))))

(scorer/register-view! :co-execution
                       {:phase         :base
                        :typed-pairs   #{[:card :card]}
                        :density-check density-check
                        :compute!      compute!})
