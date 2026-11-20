(ns metabase.xrays.related
  "Related entities recommendations."
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.models.interface :as mi]
   [metabase.query-processor.util :as qp.util]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.automagic-dashboards.schema :as ads]
   [metabase.xrays.db :as xrays.db]
   [metabase.xrays.spec :as xrays.spec]))

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

(defn- spec-fn
  [entity k]
  (let [model (mi/model entity)]
    (or (k (xrays.spec/spec model))
        (throw (ex-info (format "No x-rays %s for model %s" (name k) model) {:model model, :key k})))))

(defn definition
  "The relevant parts of the definition of `entity`: those that carry semantic meaning, and especially context-bearing
  forms."
  [entity]
  ((spec-fn entity :definition) entity))

(defn related
  "The related entities of `entity`."
  [entity]
  ((spec-fn entity :related) entity))

(defn table-of
  "The Table of `entity`, or nil."
  [entity]
  (xrays.db/table (:table_id entity)))

(defn sibling-tables
  "The Tables in the schema of `table`, but `table`."
  [table]
  (xrays.db/sibling-tables (:db_id table) (:schema table) (:id table)))

(defn fields-beside
  "The Fields of `table` but `field`, that are visible."
  [table field]
  (xrays.db/other-visible-fields-in-table (:id table) (:id field)))

(defn dashboard-cards
  "The Cards on `dashboard`."
  [dashboard]
  (map xrays.db/card (xrays.db/card-ids-for-dashboard (:id dashboard))))

(defn similarity
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

(defn rank-by-similarity
  "The `entities` but `reference`, each with its `:similarity` to `reference`, most similar first."
  [reference entities]
  (->> entities
       (remove #{reference})
       (map #(assoc % :similarity (similarity reference %)))
       (sort-by :similarity >)))

(defn interesting-mix
  "Create an interesting mix of matches. The idea is to have a balanced mix
   between close (best) matches and more diverse matches to cover a wider field
   of intents."
  [matches]
  (let [[best rest] (split-at max-best-matches matches)]
    (concat best (->> rest shuffle (take max-serendipity-matches)))))

(defn filter-visible
  "The `instances`, all of one model, that are present, visible, unarchived, active, and readable by the current user."
  [instances]
  (let [visible (filter (fn [{:keys [archived visibility_type active] :as instance}]
                          (and (some? instance)
                               (or (nil? visibility_type)
                                   (= (qp.util/normalize-token visibility_type) :normal))
                               (not archived)
                               (not= active false)))
                        instances)]
    (mi/readable visible)))

(defn metrics-for-table
  "The visible metrics of `table`."
  [table]
  (filter-visible (xrays.db/unarchived-metrics-for-table (:id table))))

(defn segments-for-table
  "The visible segments of `table`."
  [table]
  (filter-visible (xrays.db/unarchived-segments-for-table (:id table))))

(defn linking-to
  "The visible tables that `table` has foreign keys to, at most a few."
  [table]
  (->> (xrays.db/fk-target-field-ids-for-table (:id table))
       (map (comp xrays.db/table
                  :table_id
                  xrays.db/field))
       distinct
       filter-visible
       (take max-matches)))

(defn linked-from
  "The visible tables that have foreign keys to `table`, at most a few."
  [table]
  (if-let [fields (not-empty (xrays.db/active-field-ids-for-table (:id table)))]
    (->> (xrays.db/table-ids-of-fields-targeting fields)
         (map xrays.db/table)
         filter-visible
         (take max-matches))
    []))

(defn cards-sharing-dashboard
  "The visible cards on the dashboards of `card`, at most a few."
  [card]
  (if-let [dashboards (some-> (:id card) xrays.db/dashboard-ids-for-card not-empty)]
    (->> (xrays.db/other-card-ids-on-dashboards dashboards (:id card))
         (map xrays.db/card)
         filter-visible
         (take max-matches))
    []))

(defn similar-questions
  "The visible questions and models on the table of `card`, similar to it, most similar first."
  [card]
  (->> (xrays.db/unarchived-cards-for-table-of-types (:table_id card) [:model :question])
       filter-visible
       (rank-by-similarity card)
       (filter (comp pos? :similarity))))

(defn similar-metrics
  "The visible metrics on the table of `card`, similar to it, most similar first."
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

(defn recommended-dashboards
  "The dashboards that the `cards` are on and those that the current user edited recently."
  [cards]
  (let [recent                   (recently-modified-dashboards)
        card-id->dashboard-cards (->> (xrays.db/dashcard-card-and-dashboard-ids
                                       (map :id cards)
                                       (map :id recent))
                                      (group-by :card_id))
        dashboard-ids (->> (map :id cards)
                           (mapcat card-id->dashboard-cards)
                           (into #{} (map :dashboard_id)))
        best          (when (seq dashboard-ids)
                        (->> (xrays.db/dashboards dashboard-ids)
                             filter-visible
                             (take max-best-matches)))]
    (concat best recent)))

(defn recommended-collections
  "The visible collections of the `cards`, a mix of them."
  [cards]
  (->> cards
       (m/distinct-by :collection_id)
       interesting-mix
       (keep (comp xrays.db/collection :collection_id))
       filter-visible))

(defn related-metric
  "The related entities of the x-ray `metric`."
  [metric]
  (let [table (xrays.db/table (:table_id metric))]
    {:table    table
     :segments (->> table
                    segments-for-table
                    (rank-by-similarity metric)
                    interesting-mix)}))

(mu/defn metric-definition
  "The aggregation of the x-ray `metric`."
  [metric :- ::ads/metric]
  (-> metric :xrays/aggregation))

(defmethod xrays.spec/spec :xrays/Metric [_model]
  {:related    related-metric
   :definition metric-definition})
