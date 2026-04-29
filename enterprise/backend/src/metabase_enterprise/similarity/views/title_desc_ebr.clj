(ns metabase-enterprise.similarity.views.title-desc-ebr
  "Lexical/semantic similarity from the active semantic-search pgvector index.

   For each indexed `model = card AND archived = false` row, fetch its top-K
   nearest neighbors by HNSW cosine distance over the indexed `embeddable_text`
   (name + description + collection name + ...). Emits asymmetric `(seed →
   neighbor)` edges with `score = 1 - cosine_distance`.

   The neighbor lookup runs against pgvector — a different database from the
   appdb. Reads are independent (no transactional binding); the runner's
   `t2/with-transaction` wraps only the appdb-side `delete!` + `insert!` work.

   Cannot run without an active semantic-search index — registers a
   `:density-check` so the runner short-circuits cleanly to `:skipped` when
   pgvector is unreachable, the feature is off, or no card rows are indexed."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.semantic-search.core :as semantic.core]
   [metabase-enterprise.similarity.scorer :as scorer]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private k-neighbors
  "Number of nearest neighbors per seed card. Phase 5 eval will sweep this."
  20)

(def ^:private density-thresholds
  "Minima below which the view is skipped. The card-count floor is what
   distinguishes a useful kNN run from one that just emits noise on a handful
   of seeds."
  {:min-indexed-cards 50})

;; -- density check --------------------------------------------------------

(defn- density-check [_opts]
  (try
    (let [model         (semantic.core/active-embedding-model)
          indexed-cards (when model (semantic.core/indexed-row-count "card"))
          {:keys [min-indexed-cards]} density-thresholds
          metrics       {:embedding-model model
                         :indexed-cards   indexed-cards
                         :thresholds      density-thresholds}]
      (cond
        (nil? model)
        {:passed? false
         :reason  "no active semantic-search index"
         :metrics metrics}

        (< (or indexed-cards 0) min-indexed-cards)
        {:passed? false
         :reason  "active index has too few card rows"
         :metrics metrics}

        :else
        {:passed?      true
         :compute-opts {:embedding-model model}
         :metrics      metrics}))
    (catch Throwable t
      {:passed? false
       :reason  (str "pgvector probe error: " (.getMessage t))
       :metrics {}})))

;; -- compute --------------------------------------------------------------

(defn- ->edges
  "Convert one seed's kNN result into a vector of asymmetric SimilarEdge rows.
   Rows whose `:model_id` doesn't parse as a long are dropped."
  [seed-id neighbors embedding-model now]
  (->> neighbors
       (map-indexed
        (fn [idx {:keys [model_id distance]}]
          (when-let [to-id (parse-long (str model_id))]
            {:from_entity_type  :card
             :from_entity_id    seed-id
             :to_entity_type    :card
             :to_entity_id      to-id
             :view              :title-desc-ebr
             :score             (- 1.0 (double distance))
             :contributing_data {:source          :semantic-index
                                 :embedding-model embedding-model
                                 :metric          {:distance (double distance)
                                                   :rank     (inc idx)}}
             :last_computed_at  now})))
       (remove nil?)))

(defn- compute! [{:keys [batch-size embedding-model]
                  :or   {batch-size 500}}]
  (let [now      (t/offset-date-time)
        accum    (volatile! [])
        inserted (volatile! 0)
        flush!   (fn []
                   (when (seq @accum)
                     (t2/insert! :model/SimilarEdge @accum)
                     (vswap! inserted + (count @accum))
                     (vreset! accum [])))]
    (semantic.core/reduce-indexed-ids
     "card"
     (fn [_acc {:keys [model_id]}]
       (when-let [seed-id (parse-long (str model_id))]
         (when-let [neighbors (semantic.core/neighbors-of
                               "card" model_id k-neighbors
                               :target-model "card")]
           (let [edges (->edges seed-id neighbors embedding-model now)]
             (when (seq edges)
               (vswap! accum into edges)
               (when (>= (count @accum) batch-size)
                 (flush!))))))
       nil)
     nil)
    (flush!)
    @inserted))

(scorer/register-view! :title-desc-ebr
                       {:phase         :base
                        :typed-pairs   #{[:card :card]}
                        :density-check density-check
                        :compute!      compute!})
