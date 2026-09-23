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

(defn digest-candidates
  "Ranked digest candidates for `user-id`, best first, truncated to
  [[metabase.metabot.settings/metabot-digest-candidate-limit]].

  Each candidate carries `:reasons` — why it is here — which is what the model reads. `:score` is
  returned for debugging and tests; [[metabase.metabot.digest.shape]] drops it before the prompt."
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
         (take (metabot.settings/metabot-digest-candidate-limit)))))

(defn digest-selection
  "The items the digest actually renders: the top [[metabase.metabot.settings/metabot-digest-surface-target]]
  candidates.

  Selection is deterministic and server-owned. The model annotates this list — it does not choose it, and cannot
  add to or drop from it. Both the prompt and `render_digest` read the selection from here so they cannot disagree
  about which items are in play."
  [user-id]
  (vec (take (metabot.settings/metabot-digest-surface-target)
             (digest-candidates user-id))))
