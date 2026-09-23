(ns metabase.metabot.digest.signals
  "Per-user interest signals for a Metabot digest.

  Collects the signals that say an entity matters to *this* user — bookmarks, content they authored,
  recent views, and standing alerts/subscriptions — merges them per entity so one entity carries every
  reason it surfaced, scores the merged set, and truncates to
  [[metabase.metabot.settings/metabot-digest-candidate-limit]].

  The score exists only to rank and truncate here. It is deliberately not handed to the model (see
  [[metabase.metabot.digest.shape]]): the model sees the reasons and decides what is worth saying.
  Rank generously, let the model cut narrowly.

  Every collector is permission-filtered, and every collector is individually guarded — one failing
  signal degrades the digest rather than losing it."
  (:require
   [metabase.activity-feed.core :as activity-feed]
   [metabase.bookmarks.db :as bookmarks.db]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.digest.news :as news]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.models.interface :as mi]
   [metabase.notification.api :as notification.api]
   [metabase.permissions.core :as perms]
   [metabase.pulse.core :as pulse]
   [metabase.util.log :as log])
  (:import
   (java.time Duration Instant OffsetDateTime)))

(set! *warn-on-reflection* true)

(def ^:private authored-scan-limit
  "Most-recently-updated authored entities to consider, per model. A prolific author would otherwise
  pull their whole library into the candidate pool before scoring ever runs."
  200)

(def ^:private card-backed-models
  "Recent-view models that are all rows in `report_card`, so they merge with a `card` bookmark."
  #{:card :dataset :metric})

(defn- merge-model
  "Normalize a model to its merge identity: everything card-backed merges as `:card`."
  [model]
  (if (card-backed-models model) :card model))

;;; ------------------------------------------------ Timestamps -------------------------------------------------

(defn- ->instant
  "Best-effort coercion of the assorted timestamp shapes these sources return. Returns nil on anything
  unparseable rather than throwing — a missing timestamp costs warmth, not the candidate."
  [t]
  (try
    (cond
      (nil? t)                 nil
      (instance? Instant t)    t
      (instance? OffsetDateTime t) (.toInstant ^OffsetDateTime t)
      (string? t)              (.toInstant (OffsetDateTime/parse t))
      ;; java.time.temporal.Temporal from the appdb (ZonedDateTime, OffsetDateTime, ...)
      :else                    (Instant/from t))
    (catch Exception _ nil)))

(defn- days-since
  [^Instant t ^Instant now]
  (when t
    (.toDays (Duration/between t now))))

;;; ------------------------------------------------- Collectors ------------------------------------------------

(defn- bookmark->candidate
  "One `::bookmarks.db/bookmark-row` as a candidate. The row is left-joined against every bookmarkable
  table, so each type reads only its own columns — unqualifying the keys would let `collection.name`
  shadow the card's name."
  [{:keys [type item_id created_at] :as row}]
  (let [reason {:signal :bookmark :bookmarked-at (->instant created_at)}
        base   {:id item_id :reasons [reason]}]
    (case (keyword type)
      :card        (assoc base :model :card
                          :name        (get row :report_card.name)
                          :description (get row :report_card.description)
                          :card-type   (get row :report_card.card_type))
      :dashboard   (assoc base :model :dashboard
                          :name        (get row :report_dashboard.name)
                          :description (get row :report_dashboard.description))
      :collection  (assoc base :model :collection
                          :name        (get row :collection.name)
                          :description (get row :collection.description))
      :document    (assoc base :model :document
                          :name (get row :document.name))
      :exploration (assoc base :model :exploration
                          :name        (get row :exploration.name)
                          :description (get row :exploration.description))
      nil)))

(defn- bookmark-candidates
  "The user's bookmarks. [[bookmarks.db/bookmark-rows-for-user]] already drops archived items and
  re-checks readability at read time (SEC-669), so nothing further is needed here."
  [user-id]
  (let [user-scope {:current-user-id user-id
                    :is-superuser?   (perms/is-superuser? user-id)}]
    (keep bookmark->candidate (bookmarks.db/bookmark-rows-for-user user-id user-scope))))

(defn- authored-candidates
  "Cards and dashboards the user created. `view_count` rides along for free — it is the instance-wide
  count, so it feeds the popularity term rather than the personal-engagement one."
  [user-id]
  (letfn [(scan [model model-kw]
            ;; Whole rows, not a column subset: `can-read?` reads collection state to decide, and Card
            ;; additionally refuses any select missing :card_schema. A permission check that fails
            ;; closed on a missing column would silently empty this signal.
            (->> (metabot.db/authored-entities model user-id authored-scan-limit)
                 (filter mi/can-read?)
                 (map (fn [row]
                        (cond-> {:model      model-kw
                                 :id         (:id row)
                                 :name       (:name row)
                                 :description (:description row)
                                 :view-count (:view_count row)
                                 :reasons    [{:signal :authored}]}
                          (:type row) (assoc :card-type (name (:type row))))))))]
    (concat (scan :model/Card :card)
            (scan :model/Dashboard :dashboard))))

(defn- recent-view-candidates
  "What the user has looked at lately. Backed by `recent_views`, which is capped per user per model —
  this gives recency (\"last opened 3 days ago\"), not frequency. Frequency needs `view_log`."
  [user-id]
  (->> (:recents (activity-feed/get-recents user-id [:views :selections]
                                            {:models [:card :dataset :metric :dashboard :table]}))
       (keep (fn [{:keys [id name description model timestamp]}]
               (when (and model id)
                 {:model       (merge-model model)
                  :id          id
                  :name        name
                  :description description
                  :card-type   (when (card-backed-models model) (clojure.core/name model))
                  :reasons     [{:signal :recent-view :viewed-at (->instant timestamp)}]})))))

(defn- notification->candidate
  [user-id {:keys [payload payload_type creator_id] :as _notification}]
  (let [[model id] (case payload_type
                     :notification/card      [:card (:card_id payload)]
                     :notification/dashboard [:dashboard (:dashboard_id payload)]
                     [nil nil])]
    (when id
      {:model   model
       :id      id
       :reasons [{:signal      (if (= :notification/card payload_type) :alert :subscription)
                  ;; one of :has_result, :goal_above, :goal_below — coarse, but it is the user's own
                  ;; statement of which direction they care about
                  :condition   (:send_condition payload)
                  :mine?       (= user-id creator_id)}]})))

(defn- notification-candidates
  "Standing alerts and subscriptions the user created or receives. [[notification.api/list-notifications]]
  filters by `can-read?` itself.

  In practice this yields alerts only: dashboard subscriptions have not migrated off `pulse` yet (see
  the note at `metabase.notification.send`), so they arrive via [[pulse-candidates]]. The
  `:notification/dashboard` branch is kept for when they do."
  [user-id]
  (keep (partial notification->candidate user-id)
        (notification.api/list-notifications {:creator_or_recipient_id user-id})))

(defn- pulse-candidates
  "Dashboard subscriptions, which still live in `pulse`. [[pulse/retrieve-pulses]] scopes to pulses the
  user created or receives, but says nothing about whether they can still read the dashboard — a
  subscription outlives the permission that created it, so re-check before surfacing it."
  [user-id]
  (let [pulses     (pulse/retrieve-pulses {:user-id user-id :archived? false})
        dash-ids   (into #{} (keep :dashboard_id) pulses)
        readable   (when (seq dash-ids)
                     (into #{} (comp (filter mi/can-read?) (map :id))
                           (metabot.db/dashboards-by-ids (vec dash-ids))))]
    (for [{:keys [dashboard_id creator_id]} pulses
          :when (contains? readable dashboard_id)]
      {:model   :dashboard
       :id      dashboard_id
       :reasons [{:signal :subscription :mine? (= user-id creator_id)}]})))

(defn- guarded
  "Run a collector, logging and swallowing failures so one dead signal does not cost the whole digest."
  [signal-name f user-id]
  (try
    (vec (f user-id))
    (catch Exception e
      (log/errorf "Metabot digest: %s signal failed: %s" signal-name (ex-message e))
      [])))

;;; --------------------------------------------- Merge and score -----------------------------------------------

(defn- merge-candidates
  "Collapse per-signal candidates into one per entity, carrying every reason it surfaced. This is the
  point of the whole namespace: an entity that is bookmarked *and* authored *and* alerted is one strong
  candidate, not three weak ones, and the model should never have to infer that."
  [candidates]
  (for [[[model id] group] (group-by (juxt :model :id) candidates)]
    {:model       model
     :id          id
     :name        (some :name group)
     :description (some :description group)
     :card-type   (some :card-type group)
     :view-count  (some :view-count group)
     :reasons     (into [] (mapcat :reasons) group)}))

(defn- attach-view-counts
  "Fill in the instance-wide `view_count` for merged candidates that did not already carry one (only the
  authored collector selects it). One query per model, not one per candidate."
  [candidates]
  (let [missing   (fn [model] (->> candidates
                                   (filter #(and (= model (:model %)) (nil? (:view-count %))))
                                   (map :id)
                                   set))
        counts-of (fn [model t2-model]
                    (let [ids (missing model)]
                      (when (seq ids)
                        (into {} (map (juxt (fn [r] [model (:id r)]) :view_count))
                              (metabot.db/entity-view-counts t2-model (vec ids))))))
        counts    (merge (counts-of :card :model/Card)
                         (counts-of :dashboard :model/Dashboard))]
    (map (fn [c]
           (cond-> c
             (nil? (:view-count c)) (assoc :view-count (get counts [(:model c) (:id c)]))))
         candidates)))

(def ^:private signal-weights
  "An alert outranks everything: it is the one signal where the user stated outright that this matters."
  {:alert        4.0
   :subscription 2.5
   :bookmark     3.0
   :authored     2.0
   :recent-view  2.0})

(defn- warmth
  "How alive a standing signal is, from when the user last looked at the entity.

  Never zero, deliberately. A straight product of bookmark x engagement would delete the freshly
  bookmarked item the user has not revisited yet — the highest-intent thing in the set — so a bookmark
  made in the last fortnight keeps its own floor."
  [viewed-at bookmarked-at now]
  (let [since-view     (days-since viewed-at now)
        since-bookmark (days-since bookmarked-at now)]
    (max (cond
           (nil? since-view)   0.35
           (<= since-view 7)   1.0
           (<= since-view 30)  0.75
           (<= since-view 90)  0.5
           :else               0.4)
         (if (and since-bookmark (<= since-bookmark 14)) 0.9 0.0))))

(defn- popularity-bonus
  "Instance-wide `view_count`, log-scaled and capped at 1.0. This is global across all users, so it says
  the entity matters to the instance — never that it matters to this user. Kept small for that reason."
  [view-count]
  (if (and view-count (pos? view-count))
    (min 1.0 (/ (Math/log10 (double (inc view-count))) 3.0))
    0.0))

(defn- score
  "Rank a merged candidate. Bookmarks and authorship decay with warmth — a bookmark you never revisit is
  stale intent. Alerts and subscriptions do not decay: they are standing requests, not old enthusiasm."
  [{:keys [reasons view-count]} now]
  (let [signals   (into #{} (map :signal) reasons)
        reason-of (fn [s] (first (filter #(= s (:signal %)) reasons)))
        w         (warmth (:viewed-at (reason-of :recent-view))
                          (:bookmarked-at (reason-of :bookmark))
                          now)
        weight-of (fn [s] (if (signals s) (signal-weights s) 0.0))]
    (+ (* w (+ (weight-of :bookmark) (weight-of :authored)))
       (weight-of :alert)
       (weight-of :subscription)
       (weight-of :recent-view)
       (popularity-bonus view-count))))

;;; --------------------------------------------------- API -----------------------------------------------------

(defn- scored-candidates
  "Every entity the user has any relationship with, merged and scored on relevance, best first. Untruncated: news
  is applied downstream and has to be able to reach past the relevance cut-off, or something the user barely
  touches can never be promoted no matter what its numbers did."
  [user-id]
  (let [now (Instant/now)]
    (->> (concat (guarded "bookmarks"     bookmark-candidates     user-id)
                 (guarded "authored"      authored-candidates     user-id)
                 (guarded "recent-views"  recent-view-candidates  user-id)
                 (guarded "notifications" notification-candidates user-id)
                 (guarded "pulses"        pulse-candidates        user-id))
         merge-candidates
         attach-view-counts
         (map (fn [candidate] (assoc candidate :score (score candidate now))))
         (sort-by :score >)
         vec)))

(defn digest-candidates
  "Ranked digest candidates for `user-id`, best first, truncated to
  [[metabase.metabot.settings/metabot-digest-candidate-limit]].

  Each candidate carries `:reasons` — why it is here — which is what the model reads. `:score` is
  returned for debugging and tests; [[metabase.metabot.digest.shape]] drops it before the prompt."
  [user-id]
  (vec (take (metabot.settings/metabot-digest-candidate-limit)
             (scored-candidates user-id))))

;;; ---------------------------------------------------- News -------------------------------------------------------

(defn- direct-news
  "News found by analysing each candidate card's own query, as `{card-id news}`."
  [candidates]
  (let [card-ids (into [] (comp (filter #(= :card (:model %))) (map :id)) candidates)]
    (into {}
          (keep (fn [card]
                  (when-let [news (try
                                    (news/news-for card)
                                    (catch Exception e
                                      (log/warnf "Digest news failed for card %s: %s" (:id card) (ex-message e))
                                      nil))]
                    [(:id card) news])))
          (when (seq card-ids) (metabot.db/cards-by-ids card-ids)))))

(defn- metric-sourced-news
  "News obtainable from one scan of the metric library, as `{[model id] {:news .. :via ..}}` — covering both the
  anomalous metrics themselves and everything built on them.

  This is the inversion that makes the expensive half affordable. Scanning the library is O(metrics) for the whole
  instance rather than O(candidates) per user, and it reaches entities the per-card path cannot analyse at all: a
  card broken out only by category has no time axis of its own, but the metric it is built on does. The claim
  stays honest because the metric *is* the card's definition, not an approximation of it.

  A metric carries no `:via` — the movement is in its own numbers. Its dependents do, so narration can attribute
  the movement to the metric rather than implying the dependent displays it."
  []
  (let [metrics   (filterv mi/can-read? (metabot.db/metric-cards))
        by-metric (news/news-by-metric metrics)
        names     (into {} (map (juxt :id :name)) metrics)]
    (when (seq by-metric)
      (reduce (fn [acc {:keys [from_entity_type from_entity_id to_entity_id]}]
                (let [k [(keyword from_entity_type) from_entity_id]]
                  ;; first metric wins: an entity built on two anomalous metrics is reported once, not twice
                  (cond-> acc
                    (not (contains? acc k))
                    (assoc k {:news (get by-metric to_entity_id)
                              :via  {:metric-id to_entity_id :metric-name (names to_entity_id)}}))))
              ;; seed with the metrics themselves. The scan already ran, so this is free — and without it a metric
              ;; the user barely touches is culled by the relevance cut-off before its own news is ever consulted.
              (into {} (map (fn [[metric-id news]] [[:card metric-id] {:news news}])) by-metric)
              (metabot.db/dependents-of-cards (vec (keys by-metric)))))))

(defn- with-news
  "Attach data-anomaly news to `candidates` and re-score, given a precomputed `inherited` map.

  Two sources, in precedence order. Analysing a candidate's own query is the stronger claim, so it wins; news
  inherited through a metric fills in for everything that has no analysable query of its own. An entity never
  carries both, because they would be describing the same movement twice."
  [candidates inherited]
  (let [direct (direct-news candidates)]
    (for [candidate candidates
          :let [own      (get direct (:id candidate))
                borrowed (when-not own (get inherited [(:model candidate) (:id candidate)]))
                news     (or own (:news borrowed))]]
      ;; `:score` is deliberately left alone. Having news decides which *tier* an item lands in, and the tier does
      ;; all the promoting; within a tier the user's own relationship decides the order. Folding an interestingness
      ;; number into the score as well would let anomaly strength quietly drive ordering again.
      (cond-> candidate
        news (-> (assoc :news news)
                 (update :reasons conj (cond-> {:signal          :data-anomaly
                                                :interestingness (:interestingness news)
                                                :outliers        (:recent-outliers news)}
                                         borrowed (assoc :via (:via borrowed)))))))))

(defn digest-selection
  "The items the digest actually renders: the top [[metabase.metabot.settings/metabot-digest-surface-target]]
  candidates, after news has had a chance to reorder them.

  News is applied across the whole candidate pool rather than to an already-chosen handful, so something newsworthy
  can be promoted past something merely relevant — which is the entire point of computing it.

  Ordering is in two tiers: everything with a data anomaly, then everything without. Within each tier, items are
  ordered by relevance alone — how much this user actually engages with the thing — never by how large the anomaly
  is. Statistical size is a poor proxy for what someone wants to read first: of two things that both moved, the
  one they bookmarked matters more than the one with the bigger z-score.

  Selection is deterministic and server-owned. The model annotates this list — it does not choose it, and cannot
  add to or drop from it. Both the prompt and `render_digest` read the selection from here so they cannot disagree
  about which items are in play."
  [user-id]
  (let [all       (scored-candidates user-id)
        limit     (metabot.settings/metabot-digest-candidate-limit)
        inherited (metric-sourced-news)
        ;; The relevance cut-off bounds how many queries the per-card path runs. Inherited news costs nothing
        ;; extra per candidate — the metric scan already happened — so anything below the cut-off that a metric
        ;; reaches is pulled back in. Without this, something you rarely open can never be promoted by news,
        ;; which is exactly the case metric propagation exists to serve.
        rescued   (filterv #(contains? inherited [(:model %) (:id %)]) (drop limit all))]
    (->> (concat (take limit all) rescued)
         (#(with-news % inherited))
         (sort-by (fn [{:keys [news score]}] [(if news 0 1) (- score)]))
         (take (metabot.settings/metabot-digest-surface-target))
         vec)))
