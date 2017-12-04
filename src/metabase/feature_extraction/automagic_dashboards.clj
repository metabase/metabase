(ns metabase.feature-extraction.automagic-dashboards
  "Automatically generate questions and dashboards based on predefined
   heuristics."
  (:require [clojure
             [string :as s]
             [walk :refer [postwalk]]]
            [metabase.api
             [common :as api]
             [card :as card.api]]
            [metabase.events :as events]
            [metabase.feature-extraction.core :as fe]
            [metabase.models
             [card :as card :refer [Card]]
             [dashboard :as dashboard :refer [Dashboard]]
             [field :refer [Field]]
             [interface :as mi]
             [permissions :as perms]
             [table :refer [Table]]]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]
            [yaml.core :as yaml]))

(defn- boolean->probability
  [x]
  (cond
    (number? x) x
    x           1
    :else       0))

(defn- apply-rule
  "Apply rule `pattern` using `pred` to model `model`.
   If multiple alternatives apply, pick the highest ranking one.

   pattern can be either:
   * a literal,
   * a vector of literals,
   * a vector of [literal, probability] pairs.

   If probability is not given, 1 is assumed."
  [pred pattern model]
  (reduce (fn [best [pattern weight]]
            (-> pattern
                (pred model)
                boolean->probability
                (* weight)
                (max best)))
          0
          (if (vector? pattern)
            (map #(if (vector? %)
                    %
                    [% 1.0])
                 pattern)
            [[pattern 1.0]])))

(defn- name-contains?
  "Fuzzy (partial) name (string) match. If field `:name` contains `pattern`,
   return overlap %, else return nil."
  [pattern {:keys [name]}]
  (when (s/includes? (s/upper-case name) (s/upper-case pattern))
    (/ (count pattern)
       (count name))))

(defn- field-isa?
  "Is field of type `t` (as per `isa?`) within `metabase.types` hierarchy?"
  [t {:keys [base_type special_type]}]
  (let [t (keyword "type" t)]
    (or (isa? base_type t)
        (isa? special_type t))))

(defmulti constraint
  ^{:doc "Match constraint.
          Note: some constraints look at the data and therefore hit the
          underlying warehouse. As such they should be used with care
          (also, they are not optimized: a combination of `:non-nil` and
          `:unique` for instance will cause feature extraction to run twice)."
    :arglists '([op model])
    :private true}
  (fn [op model] op))

(defmethod constraint :not-fk
  [_ {:keys [special_type]}]
  (not= special_type :type/FK))

(defmethod constraint :not-nil
  [_ field]
  (->> field (fe/extract-features {}) :features :has-nils? false?))

(defmethod constraint :unique
  [_ field]
  (->> field (fe/extract-features {}) :features :all-distinct?))

(defn- contains-field?
  [field form]
  (some #{[:field-id (:id field)]
          ["field-id" (:id field)]}
        (tree-seq sequential? identity form)))

(defmethod constraint :breakout-key
  [_ field]
  (some (comp (partial contains-field? field) :breakout :query :dataset_query)
        (Card)))

(defmethod constraint :positive
  [_ {:keys [type] :as field}]
  (if-let [min (-> type :type/Number :min)]
    (not (neg? min))
    (->> field (fe/extract-features {}) :features :positive-definite?)))

(defn- apply-rules
  "Apply all the rules against given model. Abort as soon as one fails."
  [rules model]
  (reduce (fn [p-joint [pred pattern]]
            (let [p (apply-rule pred pattern model)]
              (if (pos? p)
                (* p p-joint)
                (reduced 0))))
          1
          rules))

(defn- best-match
  "Find the model among `models` that best matches (highest probability) given
   rules, if such exists."
  [rules models]
  (when (not-empty models)
    (let [rules        (remove (comp nil? second)
                               [[name-contains? (:named rules)]
                                [field-isa?     (:type rules)]
                                [constraint     (:constraints rules)]])
          [model best] (->> models
                            (map (fn [model]
                                   [model (apply-rules rules model)]))
                            (apply max-key second))]
      (when (pos? best)
        model))))

(defn- template-var?
  [x]
  (and (string? x) (s/starts-with? x "?")))

(defn- unify-var
  [bindings x]
  (-> x (subs 1) bindings))

(defn- bind-models
  "Bind models for a given heuristics.
   First narrows down by table, then searches within that table for matching
   fields. Table candidates can be constrained to a given database or table via
   `scope`."
  [{:keys [scope id]} {:keys [fields tables]}]
  (let [tables (into {}
                 (map (fn [table]
                        (->> (cond
                               (= scope :table) [(Table id)]
                               (nil? id)        (Table)
                               :else            (db/select Table :db_id id))
                             (best-match table)
                             (vector (:as table)))))
                 tables)
        fields (into {}
                 (keep (fn [field]
                         (some->> field
                                  :table
                                  (unify-var tables)
                                  :id
                                  (db/select Field :table_id)
                                  (best-match field)
                                  (vector (:as field)))))
                 fields)]
    [tables fields]))

(defmulti ->reference
  ^{:doc "Get a MBQL reference for a given model."
    :arglists '([model])
    :private true}
  type)

(defmethod ->reference (type Table)
  [table]
  (:id table))

(defmethod ->reference (type Field)
  [{:keys [fk_target_field_id id]}]
  (if fk_target_field_id
    [:fk-> id fk_target_field_id]
    [:field-id id]))

(defn- unify-vars
  "Replace all template vars in `form` with references to corresponding models
   in `context` as returned by `bind-models`.
   `form` can be either a map (MBQL) or string (native SQL).
   Aborts if any of the template vars cannot be matched."
  [context form]
  (try
    (if (map? form)
      (postwalk
       (fn [subform]
         (if (template-var? subform)
           (or (some->> subform
                        (unify-var context)
                        ->reference)
               (throw (Throwable.)))
           subform))
       form)
      (s/replace form #"\?\w+" (fn [token]
                                 (or (some->> token (unify-var context) :name)
                                     (throw (Throwable.))))))
    (catch Throwable _ nil)))

(def ^:private ^Integer grid-width 18)
(def ^:private ^Integer card-width 6)
(def ^:private ^Integer card-height 4)

(defn- next-card-position
  "Return `:row` x `:col` coordinates for the next card to be placed on
   dashboard `dashboard`.
   Assumes a grid `grid-width` cells wide with cards sized
   `card-width` x `card-height`."
  [dashboard]
  (let [num-cards (db/count 'DashboardCard :dashboard_id (:id dashboard))]
    {:row (int (* (Math/floor (/ (* card-width num-cards)
                                 grid-width))
                  card-height))
     :col (int (* (Math/floor (/ (mod (* card-width num-cards) grid-width)
                                 card-width))
                  card-width))}))

(defn- add-to-dashboard!
  [dashboard card]
  (let [dashboard (or (db/select-one Dashboard :name dashboard)
                      (let [dashboard (db/insert! Dashboard
                                        :name        dashboard
                                        :description "Autogenerated dashboard"
                                        :creator_id  api/*current-user-id*
                                        :parameters  [])]
                        (events/publish-event! :dashboard-create dashboard)
                        dashboard))]
    (when (mi/can-write? dashboard)
      (dashboard/add-dashcard! dashboard card
        (merge (next-card-position dashboard)
               {:sizeX card-width
                :sizeY card-height}))
      dashboard)))

(defn- create-card!
  [database {:keys [query description title visualization dashboard]}]
  (let [dataset_query (if (map? query)
                        {:type     :query
                         :query    query
                         :database database}
                        {:type     :native
                         :native   {:query query}
                         :database database})]
    (when (perms/set-has-full-permissions-for-set?
           @api/*current-user-permissions-set*
           (card/query-perms-set dataset_query :write))
      (let [metadata (card.api/result-metadata-for-query dataset_query)
            card     (db/insert! Card
                       :creator_id             api/*current-user-id*
                       :dataset_query          dataset_query
                       :description            description
                       :display                visualization
                       :name                   title
                       :visualization_settings {}
                       :collection_id          nil
                       :result_metadata        metadata)]
        (events/publish-event! :card-create card)
        (hydrate card :creator :dashboard_count :labels :can_write :collection)
        (add-to-dashboard! dashboard card)))))

(def ^:private rules-dir "resources/automagic_dashboards")

(defn- load-rules
  []
  (->> rules-dir
       clojure.java.io/file
       file-seq
       (filter #(.isFile %))
       ; Workaround for https://github.com/owainlewis/yaml/issues/11
       (map (comp yaml/parse-string slurp))))

(defn populate-dashboards
  "Applying heuristics in `rules-dir` to the models in database `database`,
   generate cards and dashboards for all the matching rules.
   If a dashboard with the same name already exists, append to it."
  [scope]
  (->> (load-rules)
       (mapcat (fn [{:keys [bindings cards]}]
                 (let [[tables fields] (bind-models scope bindings)
                       database        (-> tables first val :db_id)]
                   (keep (fn [card]
                           (when-let [query (unify-vars (merge tables fields)
                                                        (:query card))]
                             (create-card! database (assoc card :query query))))
                         cards))))
       (map :id)
       distinct))
