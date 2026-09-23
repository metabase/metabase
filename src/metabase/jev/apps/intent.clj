(ns metabase.jev.apps.intent
  "Predict what a user is about to do next from their action trail.

  Two halves, kept deliberately separate:

    1. DETERMINISTIC (the bulk of the value) — [[metabase.jev.apps.intent.store]] records a compact event per
       action off the event bus and derives counts: recency, frequency, and transitions (what follows
       what). Predicting the next target is, most of the time, just \"the target that most often follows
       where you are now.\" No model involved.

    2. SELECTION (Jev, only when counts can't decide) — when the deterministic step yields several
       comparably-likely candidates, we hand Jev {trail, candidate targets + their meanings} and let it
       pick the one that matches intent. Jev's calibrated confidence gates whether we act on it.

  We tap the existing event bus (same pattern as `activity-feed.events.recent-views`) so no new tracking
  is added — the signal is already flowing; we just accumulate and read it."
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.jev.client :as jev]
   [metabase.jev.apps.intent.features :as features]
   [metabase.jev.apps.intent.store :as store]
   [metabase.util.log :as log]
   [methodical.core :as m]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------------------------------------------------------
;;; Ingestion — tap the bus, record a compact event
;;; ---------------------------------------------------------------------------------------------------

(defn- record-view! [model object-id user-id action]
  (let [user-id (or user-id api/*current-user-id*)]
    (when (and user-id object-id)
      (store/record! (store/current) user-id
                     {:action action
                      :model  (name model)
                      :target (store/target-key model object-id)}))))

(events/derive! ::card-read :metabase/event)
(events/derive! :event/card-read ::card-read)
(m/defmethod events/publish-event! ::card-read
  [_topic {:keys [object-id user-id]}]
  (try (record-view! :model/Card object-id user-id :view)
       (catch Throwable e (log/debug e "intent: card-read tap failed"))))

(events/derive! ::dashboard-read :metabase/event)
(events/derive! :event/dashboard-read ::dashboard-read)
(m/defmethod events/publish-event! ::dashboard-read
  [_topic {:keys [object-id user-id]}]
  (try (record-view! :model/Dashboard object-id user-id :view)
       (catch Throwable e (log/debug e "intent: dashboard-read tap failed"))))

(events/derive! ::table-read :metabase/event)
(events/derive! :event/table-read ::table-read)
(m/defmethod events/publish-event! ::table-read
  [_topic {:keys [object object-id user-id]}]
  (try (record-view! :model/Table (or object-id (:id object)) user-id :view)
       (catch Throwable e (log/debug e "intent: table-read tap failed"))))

(events/derive! ::card-query :metabase/event)
(events/derive! :event/card-query ::card-query)
(m/defmethod events/publish-event! ::card-query
  [_topic {:keys [card-id user-id]}]
  (try (record-view! :model/Card card-id user-id :query)
       (catch Throwable e (log/debug e "intent: card-query tap failed"))))

(defn observe-query!
  "Record the faceted preferences from an MBQL inner-query the user just ran/built, into BOTH scopes:

    user:<id>    — personalization (\"Dan likes temporal filters\")
    table:<id>   — collective intelligence (\"people filter created_at on this table\")

  One query teaches both. [[features/query-facts]] decomposes it into `[facet value]` pairs counted
  independently, so type/op preferences accrue across tables. Safe on partial queries."
  ([query] (observe-query! api/*current-user-id* query))
  ([user-id query]
   (when query
     (try
       (let [facts    (features/query-facts query)
             table-id (features/source-table-id query)
             s        (store/current)]
         (when (seq facts)
           (when user-id  (store/observe-facts! s (str "user:" user-id) facts))
           (when table-id (store/observe-facts! s (str "table:" table-id) facts))))
       (catch Throwable e (log/debug e "intent: observe-query failed"))))))

;;; ---------------------------------------------------------------------------------------------------
;;; Prediction
;;; ---------------------------------------------------------------------------------------------------

(defn- top-pref
  "The most-preferred value for a facet, or nil if nothing learned yet."
  [user-id facet]
  (let [counts (store/prefs (store/current) user-id facet)]
    (when (seq counts)
      (key (apply max-key val counts)))))

(defn suggest-for-table
  "Answer \"what is this person likely to want on `table-id`?\" — even a table they've never opened.

  Consults the abstraction ladder most-specific-first: if they have table-specific history it wins; if
  not, their transferable type/operation preferences still predict. Returns the preferred filter field
  type, aggregation, and breakout unit, tagged with whether the evidence was table-specific or general."
  ([table-id] (suggest-for-table api/*current-user-id* table-id))
  ([user-id table-id]
   (let [table-facts    (store/prefs (store/current) user-id :table)
         seen-table?    (contains? table-facts table-id)
         fields         (t2/select [:model/Field :id :name :base_type :semantic_type]
                                   :table_id table-id :active true)
         ;; the person's general preferences (transfer across tables)
         pref-filter    (top-pref user-id :filter-type)
         pref-agg       (top-pref user-id :agg)
         pref-bunit     (top-pref user-id :breakout-unit)
         ;; concretize the general preference onto THIS table's fields
         match-type     (fn [type-class]
                          (->> fields
                               (filter #(= type-class (features/field-type-class (:base_type %))))
                               (map #(select-keys % [:id :name :base_type]))))]
     {:table_id          table-id
      :evidence          (if seen-table? :table-specific :transferred)
      :preferred_filter  {:type-class pref-filter
                          :fields    (when pref-filter (match-type pref-filter))}
      :preferred_agg     pref-agg
      :preferred_breakout {:unit  pref-bunit
                           :fields (match-type :temporal)}})))

;;; ---------------------------------------------------------------------------------------------------
;;; Collective "what do people do on this table?" — the notebook starter-chips surface
;;; ---------------------------------------------------------------------------------------------------

(def ^:private shape-verb
  "Human verb for each value-free filter shape."
  {:date-range        "Filter a date range"
   :date-threshold    "Filter by date"
   :date-exact        "Filter by date"
   :point-lookup      "Look up"
   :category-select   "Filter by category"
   :numeric-threshold "Filter by amount"
   :text-search       "Search text"
   :presence-check    "Filter by presence"
   :range             "Filter a range"
   :equality          "Filter by value"})

(defn- best-field-for
  "Pick the table field whose type-class matches a filter shape, so a generic shape becomes a concrete
  chip. Returns `{:id :name}` or nil."
  [fields shape]
  (let [want (cond
               (#{:date-range :date-threshold :date-exact} shape) :temporal
               (#{:numeric-threshold} shape)                      :number
               (#{:text-search :category-select} shape)           :text
               :else                                              nil)
        pk-fk? (#{:point-lookup} shape)]
    (some (fn [f]
            (cond
              pk-fk? (when (#{:type/PK :type/FK} (:semantic_type f)) (select-keys f [:id :name]))
              want   (when (= want (features/field-type-class (:base_type f))) (select-keys f [:id :name]))))
          fields)))

(defn table-shape-chips
  "What people typically DO on `table-id`, as UI-ready starter chips — learned collectively, value-free.
  Each chip: `{:kind :filter|:aggregation|:breakout :shape :count :label :field {:id :name}?}`. Empty when
  the table is cold."
  [table-id]
  (let [scope   (str "table:" table-id)
        s       (store/current)
        fields  (t2/select [:model/Field :id :name :base_type :semantic_type]
                           :table_id table-id :active true)
        filters (->> (store/prefs s scope :filter-shape)
                     (sort-by val >)
                     (map (fn [[shape n]]
                            (let [field (best-field-for fields shape)]
                              {:kind  :filter :shape shape :count n
                               :field field
                               :label (str (get shape-verb shape (name shape))
                                           (when field
                                             (str (if (= shape :point-lookup) " by " " on ")
                                                  (:name field))))}))))
        aggs    (->> (store/prefs s scope :agg)
                     (sort-by val >)
                     (map (fn [[op n]] {:kind :aggregation :shape op :count n
                                        :label (case op :count "Count rows" :sum "Sum a column"
                                                     :avg "Average a column" (str (name op)))})))
        bunits  (->> (store/prefs s scope :breakout-unit)
                     (sort-by val >)
                     (map (fn [[unit n]] {:kind :breakout :shape unit :count n
                                          :label (str "Group by " (name unit))})))]
    {:table_id table-id
     :chips    (vec (concat (take 3 filters) (take 2 aggs) (take 1 bunits)))}))

(def ^:private tie-ratio
  "If the top deterministic candidate outweighs the runner-up by at least this factor, the counts have
  decided and we skip Jev. Otherwise it's a genuine tie and Jev picks by meaning."
  1.5)

(defn- candidates
  "Deterministic candidate next-targets after `from-target`: the transition counts, most-frequent first."
  [user-id from-target]
  (->> (store/transitions (store/current) user-id from-target)
       (sort-by val >)
       (map (fn [[target count]] {:target target :count count}))))

(defn- target->label
  "Human label + kind for a target key like \"card:42\", for Jev state and the response. Best-effort."
  [target]
  (let [[model id-str] (str/split target #":" 2)
        id             (parse-long (or id-str ""))]
    (case model
      "card"      {:kind "question"  :title (when id (t2/select-one-fn :name :model/Card :id id))}
      "dashboard" {:kind "dashboard" :title (when id (t2/select-one-fn :name :model/Dashboard :id id))}
      "table"     {:kind "table"     :title (when id (t2/select-one-fn :name :model/Table :id id))}
      {:kind model :title nil})))

(defn- jev-break-tie
  "Ask Jev which candidate best matches the recent trail. Returns the chosen target or nil."
  [user-id from-target cs]
  (let [trail  (->> (store/recent (store/current) user-id 8)
                    (mapv (fn [e] {:action (:action e) :target (:target e)
                                   :title  (:title (target->label (:target e)))})))
        crit   (into {} (map (fn [{:keys [target]}]
                               (let [{:keys [kind title]} (target->label target)]
                                 [(keyword target) (str kind (when title (str ": " title)))])))
                     cs)
        state  {:where_they_are (let [{:keys [kind title]} (target->label from-target)]
                                  (str kind (when title (str ": " title))))
                :recent_trail   trail}
        result (jev/ask state
                        {:next (jev/choice
                                "Given this person's recent trail and where they are now, which target are they most likely to go to next?"
                                crit)})]
    (some-> (get-in result [:answers :next :choice]) name)))

(defn predict-next
  "Predict the user's next target given `from-target` (their current location, a target key like
  \"card:42\"). Returns `{:prediction target-or-nil :method :deterministic|:jev|:none :candidates [...]}`.

  Deterministic-first: if the top candidate clearly outweighs the rest, return it with no Jev call. Only
  a genuine tie among candidates goes to Jev."
  ([from-target] (predict-next api/*current-user-id* from-target))
  ([user-id from-target]
   (let [cs (candidates user-id from-target)]
     (cond
       (empty? cs)
       {:prediction nil :method :none :candidates []}

       (or (= 1 (count cs))
           (>= (/ (double (:count (first cs))) (:count (second cs))) tie-ratio))
       {:prediction (:target (first cs)) :method :deterministic :candidates cs}

       :else
       (let [top (take 4 cs)
             pick (jev-break-tie user-id from-target top)]
         {:prediction (or pick (:target (first cs)))
          :method     (if pick :jev :deterministic)
          :candidates cs})))))
