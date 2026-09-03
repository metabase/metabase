(ns metabase.xrays.related
  "Related entities recommendations."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.models.interface :as mi]
   [metabase.query-processor.util :as qp.util]
   [metabase.segments.schema :as segments.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.db :as xrays.db]))

(def ^:private ^Long max-best-matches        3)
(def ^:private ^Long max-serendipity-matches 2)
(def ^:private ^Long max-matches             (+ max-best-matches
                                                max-serendipity-matches))

(mr/def ::context-bearing-form
  [:cat
   [:and
    [:or :string :keyword]
    [:fn
     {:error/message "field, metric, or segment"}
     (comp #{:field :metric :segment}
           keyword)]]
   [:* :any]])

(defn- collect-context-bearing-forms
  [form]
  (into #{}
        (comp (filter (mr/validator ::context-bearing-form))
              (map #(update % 0 qp.util/normalize-token)))
        (tree-seq sequential? identity form)))

(defmulti definition
  "Return the relevant parts of a given entity's definition. Relevant parts are those that carry semantic meaning, and
  especially context-bearing forms."
  {:arglists '([instance])}
  mi/model)

(mu/defmethod definition :xrays/Metric
  [metric :- ::ads/metric]
  (-> metric :xrays/aggregation))

(defmethod definition :model/Card
  [card]
  ;; The schema permits an empty or otherwise unparseable stored `dataset_query`. Treat such a Card as having
  ;; no context-bearing forms so it does not break related-entity computation for every Card and x-ray.
  (try
    (-> card
        :dataset_query
        ((juxt lib/breakouts lib/aggregations lib/expressions lib/fields)))
    (catch Exception e
      ;; Runs for every candidate Card while ranking, so keep it quiet.
      (log/debugf "Ignoring Card %s while finding related entities because its query could not be parsed: %s"
                  (:id card) (ex-message e))
      nil)))

(mu/defmethod definition :model/Segment
  [segment :- [:map [:definition ::segments.schema/definition]]]
  (-> segment :definition :stages first :filters not-empty))

(defmethod definition :model/Field
  [field]
  [[:field {:lib/uuid (str (random-uuid))} (:id field)]])

(defn- similarity
  "How similar are entities `a` and `b` based on a structural comparison of their
   definition (MBQL).
   For the purposes of finding related entities we are only interested in
   context-bearing subforms (field, segment, and metric references). We also
   don't care about generalizations (less context-bearing forms) and refinements
   (more context-bearing forms), so we just check if the less specific form is a
   subset of the more specific one."
  [a b]
  (let [context-a (-> a definition collect-context-bearing-forms lib.schema.util/remove-lib-uuids)
        context-b (-> b definition collect-context-bearing-forms lib.schema.util/remove-lib-uuids)
        overlap (set/intersection (set context-a) (set context-b))
        min-overlap (min (count context-a) (count context-b))]
    (/ (count overlap)
       (max min-overlap 1))))

(defn- rank-by-similarity
  [reference entities]
  (->> entities
       (remove #{reference})
       (map #(assoc % :similarity (similarity reference %)))
       (sort-by :similarity >)))

(defn- interesting-mix
  "Create an interesting mix of matches. The idea is to have a balanced mix
   between close (best) matches and more diverse matches to cover a wider field
   of intents."
  [matches]
  (let [[best rest] (split-at max-best-matches matches)]
    (concat best (->> rest shuffle (take max-serendipity-matches)))))

(def ^:private ^{:arglists '([instances])} filter-visible
  (partial filter (fn [{:keys [archived visibility_type active] :as instance}]
                    (and (some? instance)
                         (or (nil? visibility_type)
                             (= (qp.util/normalize-token visibility_type) :normal))
                         (not archived)
                         (not= active false)
                         (mi/can-read? instance)))))

(defn- metrics-for-table
  [table]
  (filter-visible (xrays.db/unarchived-metrics-for-table (:id table))))

(defn- segments-for-table
  [table]
  (filter-visible (xrays.db/unarchived-segments-for-table (:id table))))

(defn- linking-to
  [table]
  (->> (xrays.db/fk-target-field-ids-for-table (:id table))
       (map (comp xrays.db/table
                  :table_id
                  xrays.db/field))
       distinct
       filter-visible
       (take max-matches)))

(defn- linked-from
  [table]
  (if-let [fields (not-empty (xrays.db/active-field-ids-for-table (:id table)))]
    (->> (xrays.db/table-ids-of-fields-targeting fields)
         (map xrays.db/table)
         filter-visible
         (take max-matches))
    []))

(defn- cards-sharing-dashboard
  [card]
  (if-let [dashboards (not-empty (xrays.db/dashboard-ids-for-card (:id card)))]
    (->> (xrays.db/other-card-ids-on-dashboards dashboards (:id card))
         (map xrays.db/card)
         filter-visible
         (take max-matches))
    []))

(defn- similar-questions
  [card]
  (->> (xrays.db/unarchived-cards-for-table-of-types (:table_id card) [:model :question])
       filter-visible
       (rank-by-similarity card)
       (filter (comp pos? :similarity))))

(defn- similar-metrics
  [card]
  (->> (xrays.db/unarchived-cards-for-table-of-types (:table_id card) [:metric])
       filter-visible
       (rank-by-similarity card)
       (filter (comp pos? :similarity))))

(defn- recently-modified-dashboards
  []
  (when-let [dashboard-ids (not-empty (xrays.db/recently-edited-dashboard-ids-for-user api/*current-user-id*))]
    (->> (xrays.db/dashboards dashboard-ids)
         filter-visible
         (take max-serendipity-matches))))

(defn- recommended-dashboards
  [cards]
  (let [recent                   (recently-modified-dashboards)
        card-id->dashboard-cards (->> (xrays.db/dashcard-card-and-dashboard-ids
                                       (map :id cards)
                                       (map :id recent))
                                      (group-by :card_id))
        dashboard-ids (->> (map :id cards)
                           (mapcat card-id->dashboard-cards)
                           (map :dashboard_id)
                           distinct)
        best          (when (seq dashboard-ids)
                        (->> (xrays.db/dashboards dashboard-ids)
                             filter-visible
                             (take max-best-matches)))]
    (concat best recent)))

(defn- recommended-collections
  [cards]
  (->> cards
       (m/distinct-by :collection_id)
       interesting-mix
       (keep (comp xrays.db/collection :collection_id))
       filter-visible))

(defmulti related
  "Return related entities."
  {:arglists '([entity])}
  mi/model)

(defmethod related :model/Card
  [card]
  (let [table             (xrays.db/table (:table_id card))
        similar-questions (similar-questions card)
        similar-metrics   (similar-metrics card)]
    {:table             table
     :metrics           (interesting-mix similar-metrics)
     :segments          (->> table
                             segments-for-table
                             (rank-by-similarity card)
                             interesting-mix)
     :dashboard-mates   (cards-sharing-dashboard card)
     :dashboards        (recommended-dashboards similar-questions)
     :collections       (recommended-collections similar-questions)}))

(defmethod related :model/Query
  [query]
  (related (mi/instance :model/Card query)))

(defmethod related :xrays/Metric
  [metric]
  (let [table (xrays.db/table (:table_id metric))]
    {:table    table
     :segments (->> table
                    segments-for-table
                    (rank-by-similarity metric)
                    interesting-mix)}))

(defmethod related :model/Segment
  [segment]
  (let [table (xrays.db/table (:table_id segment))]
    {:table       table
     :metrics     (metrics-for-table table)
     :segments    (->> table
                       segments-for-table
                       (rank-by-similarity segment)
                       interesting-mix)
     :linked-from (linked-from table)}))

(defmethod related :model/Table
  [table]
  (let [linking-to  (linking-to table)
        linked-from (linked-from table)]
    {:segments    (segments-for-table table)
     :metrics     (metrics-for-table table)
     :linking-to  linking-to
     :linked-from linked-from
     :tables      (->> (xrays.db/sibling-tables (:db_id table) (:schema table) (:id table))
                       (remove (set (concat linking-to linked-from)))
                       filter-visible
                       interesting-mix)}))

(defmethod related :model/Field
  [field]
  (let [table (xrays.db/table (:table_id field))]
    {:table    table
     :segments (->> table
                    segments-for-table
                    (rank-by-similarity field)
                    interesting-mix)
     :metrics  (->> table
                    metrics-for-table
                    (rank-by-similarity field)
                    (filter (comp pos? :similarity))
                    interesting-mix)
     :fields   (->> (xrays.db/other-visible-fields-in-table (:id table) (:id field))
                    filter-visible
                    interesting-mix)}))

(defmethod related :model/Dashboard
  [dashboard]
  (let [cards (map xrays.db/card (xrays.db/card-ids-for-dashboard (:id dashboard)))]
    {:cards (->> cards
                 (mapcat similar-questions)
                 (remove (set cards))
                 distinct
                 filter-visible
                 interesting-mix)}))
