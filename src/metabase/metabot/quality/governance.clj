(ns metabase.metabot.quality.governance
  "Layer 0 of the conversation-quality pipeline: batched governance lookup
  for the entity-refs that appear across CONV_P/D/Q/I/H.

  See `notes/bot-1569/quality-score-impl.md` §C for the contract. Two
  things to keep in mind when reading this namespace:

  - **Sparse return map.** [[resolve]] returns `{[type id-str] facts}`
    where each facts map carries only the keys that are populated for
    that entity type. Cards get `:verified? :lives-in-personal? :name
    :source-card-id`; tables get `:schema :db-id :name`; dashboards /
    databases / transforms get `:name` only. An entity that the appdb
    can't find is absent from the map — downstream readers must
    tolerate `nil`.

  - **Memoization is the caller's job.** [[walk-source-card-ancestry]]
    issues one query per chain hop; per the impl plan, the
    `compute-conversation-score` entry point wraps it in a local
    `memoize` so a deeply-nested model lineage shared across multiple
    starting cards costs one query per *distinct* ancestor across the
    whole scoring invocation, not one per walk."
  (:refer-clojure :exclude [resolve])
  (:require
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------
;;; Entity-type partitioning
;;; ---------------------------------------------------------------------------

(def ^:private card-types
  "Entity-usage `:type` values that all live in `report_card`. The four
  share a query but stay distinct in the returned `[type id-str]` key so
  the join with extract.clj's set construction is symmetric."
  #{"card" "question" "model" "metric"})

(defn- coerce-int
  "Coerce an entity-usage `:id` (which may be int or numeric string) to
  Long, or return `nil` if it doesn't parse. Refs with non-numeric ids
  (e.g. aggregation aliases) are not real database rows and are dropped
  before any query runs."
  [id]
  (cond
    (integer? id) (long id)
    (string?  id) (try (Long/parseLong id) (catch NumberFormatException _ nil))
    :else         nil))

(defn- partition-refs
  "Bucket the input refs by entity type, dropping refs whose id doesn't
  coerce to Long. Returns `{type-group #{long-id ...}}` where
  `type-group` is the bucket name used inside this namespace
  (`:card`, `:table`, `:dashboard`, `:database`, `:transform`).
  Types not consumed by Phase-3 governance (e.g. `field`, `collection`,
  `document`) bucket out and are silently ignored."
  [refs]
  (reduce
   (fn [acc {:keys [type id]}]
     (let [n (coerce-int id)]
       (if (nil? n)
         acc
         (cond
           (contains? card-types type) (update acc :card     (fnil conj #{}) n)
           (= "table" type)            (update acc :table    (fnil conj #{}) n)
           (= "dashboard" type)        (update acc :dashboard (fnil conj #{}) n)
           (= "database" type)         (update acc :database (fnil conj #{}) n)
           (= "transform" type)        (update acc :transform (fnil conj #{}) n)
           :else                       acc))))
   {}
   refs))

;;; ---------------------------------------------------------------------------
;;; Card batch query
;;; ---------------------------------------------------------------------------

(defn- card-rows
  "Issue the batched card query. LEFT JOIN to `collection` (for
  `personal_owner_id`) and `moderation_review` (filtered to
  `most_recent = true`). Same card appears N times in the result iff N
  `most_recent` rows exist for it — [[fold-card-rows]] folds those."
  [card-ids]
  (when (seq card-ids)
    (t2/query
     {:select    [[:c.id :card-id]
                  [:c.type :card-type]
                  [:c.name :card-name]
                  [:c.source_card_id :source-card-id]
                  [:col.personal_owner_id :personal-owner-id]
                  [:mr.status :review-status]]
      :from      [[:report_card :c]]
      :left-join [[:collection :col]
                  [:= :col.id :c.collection_id]
                  [:moderation_review :mr]
                  [:and
                   [:= :mr.moderated_item_id :c.id]
                   [:= :mr.moderated_item_type "card"]
                   [:= :mr.most_recent true]]]
      :where     [:in :c.id card-ids]})))

(defn- fold-card-rows
  "Reduce the (possibly duplicated-per-card) card rows into one facts map
  per card-id. `:verified?` is the disjunction across moderation rows so
  a pathological multi-`most_recent` state still resolves cleanly. The
  returned map is keyed by `card-id` (Long), not the public
  `[type id-str]` — that re-keying happens in [[index-cards]]."
  [rows]
  (reduce
   (fn [acc {:keys [card-id card-name source-card-id personal-owner-id review-status]}]
     (let [existing (get acc card-id)
           verified-here? (= "verified" review-status)]
       (assoc acc card-id
              {:name               card-name
               :source-card-id     source-card-id
               :lives-in-personal? (some? personal-owner-id)
               :verified?          (or verified-here? (:verified? existing false))})))
   {}
   rows))

(defn- index-cards
  "Re-key the per-card facts map to the public `[type id-str]` shape. A
  single card-id explodes into one key per requested type (e.g. if the
  same card-id appears in CONV_Q as both `card` and `question`, both
  keys land in the result with the same facts). The `report_card.type`
  column is intentionally not part of the public key — extract.clj
  records the type as it appeared in the entity-usage stream, and
  governance keys must mirror that for join symmetry."
  [card-facts types-by-id]
  (reduce-kv
   (fn [acc card-id facts]
     (reduce (fn [acc' t]
               (assoc acc' [t (str card-id)] facts))
             acc
             (get types-by-id card-id #{})))
   {}
   card-facts))

(defn- requested-card-types-by-id
  "Invert the partitioned refs back into `{card-id #{requested-types}}` so
  [[index-cards]] knows which `[type id-str]` keys to emit for each
  card-id. Refs whose id didn't coerce are absent (matched
  [[partition-refs]] earlier)."
  [refs]
  (reduce
   (fn [acc {:keys [type id]}]
     (let [n (coerce-int id)]
       (if (and n (contains? card-types type))
         (update acc n (fnil conj #{}) type)
         acc)))
   {}
   refs))

;;; ---------------------------------------------------------------------------
;;; Per-type single-key lookups
;;; ---------------------------------------------------------------------------

(defn- table-rows
  [table-ids]
  (when (seq table-ids)
    (t2/query
     {:select [[:id :table-id] :name :schema :db_id]
      :from   [:metabase_table]
      :where  [:in :id table-ids]})))

(defn- index-tables
  [rows]
  (reduce
   (fn [acc {:keys [table-id name schema db_id]}]
     (assoc acc ["table" (str table-id)]
            {:name name :schema schema :db-id db_id}))
   {}
   rows))

(defn- name-only-rows
  "Generic `:name`-only lookup against `table-kw` keyed by integer `:id`.
  Used for dashboards / databases / transforms — types the per-turn
  attribution layer needs only to render a human-readable label for."
  [table-kw ids]
  (when (seq ids)
    (t2/query
     {:select [[:id :row-id] :name]
      :from   [table-kw]
      :where  [:in :id ids]})))

(defn- index-name-only
  [rows public-type]
  (reduce
   (fn [acc {:keys [row-id name]}]
     (assoc acc [public-type (str row-id)] {:name name}))
   {}
   rows))

;;; ---------------------------------------------------------------------------
;;; Public surface — batched resolve
;;; ---------------------------------------------------------------------------

(defn resolve
  "Resolve governance facts for a seq of entity-refs across all sets.
  Returns `{[type id-str] facts-map}` per the §Sparse return map note
  in the ns docstring. Issues at most five small `IN` queries — one per
  bucket — so the appdb cost stays bounded regardless of conversation
  shape.

  Refs whose `:type` is outside the governance-consumed vocabulary
  (today: card-types, table, dashboard, database, transform) are
  silently ignored; their attribution displays without a governance
  label. Refs with non-numeric `:id` (aggregation aliases, etc.) are
  also dropped before any query runs."
  [entity-refs]
  (let [{:keys [card table dashboard database transform]} (partition-refs entity-refs)
        types-by-card-id                                  (requested-card-types-by-id entity-refs)]
    (merge
     (-> (card-rows  card)
         fold-card-rows
         (index-cards types-by-card-id))
     (-> (table-rows table)
         index-tables)
     (-> (name-only-rows :report_dashboard dashboard) (index-name-only "dashboard"))
     (-> (name-only-rows :metabase_database database)  (index-name-only "database"))
     (-> (name-only-rows :transform        transform)  (index-name-only "transform")))))

;;; ---------------------------------------------------------------------------
;;; Source-card ancestry
;;; ---------------------------------------------------------------------------

(defn- source-card-id-of
  "Single-row lookup for `report_card.source_card_id`. Returns `nil` for a
  root card or for a card-id that doesn't exist."
  [card-id]
  (t2/select-one-fn :source_card_id :model/Card :id card-id))

(defn walk-source-card-ancestry
  "Walk `report_card.source_card_id` upward from `card-id` and return the
  ordered seq of ancestor card-ids (excluding `card-id` itself). Stops
  at a root card (`source_card_id IS NULL`) or on cycle detection (id
  already visited along the chain). The chain is at most the depth of
  the model lineage, so cycle detection just guards against pathological
  appdb states — not expected in production.

  N+1 queries per call by design; per the impl plan,
  `compute-conversation-score` wraps this in `memoize` so a shared
  lineage costs one query per *distinct* ancestor across the whole
  scoring invocation."
  [card-id]
  (loop [current   card-id
         visited   #{card-id}
         ancestors []]
    (let [parent (source-card-id-of current)]
      (cond
        (nil? parent)
        ancestors

        (contains? visited parent)
        (do (log/warnf "source-card ancestry cycle detected at card-id %d (parent %d)" current parent)
            ancestors)

        :else
        (recur parent (conj visited parent) (conj ancestors parent))))))

;;; ---------------------------------------------------------------------------
;;; REPL helpers
;;; ---------------------------------------------------------------------------

(comment
  ;; Sample resolve against a small ref list — verify shape locally.
  (resolve [{:type "card"  :id 1}
            {:type "model" :id 2}
            {:type "table" :id 3}])

  ;; Walk ancestry of a model id.
  (walk-source-card-ancestry 99)

  ;; Quick check: do any card-ids in the appdb actually carry source_card_id?
  (->> (t2/query {:select [:id :source_card_id]
                  :from   [:report_card]
                  :where  [:not= :source_card_id nil]
                  :limit  5})
       (map (juxt :id :source_card_id))
       sort))
