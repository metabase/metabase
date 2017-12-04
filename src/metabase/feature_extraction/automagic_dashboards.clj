(ns metabase.feature-extraction.automagic-dashboards
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
  [pattern {:keys [name]}]
  (when (s/includes? (s/upper-case name) (s/upper-case pattern))
    (/ (count pattern)
       (count name))))

(defn- type-is?
  [t {:keys [base_type special_type]}]
  (let [t (keyword "type" t)]
    (or (isa? base_type t)
        (isa? special_type t))))

(defmulti constraint
  ^{:doc ""
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
  [rules model]
  (reduce (fn [p-joint [pred pattern]]
            (let [p (apply-rule pred pattern model)]
              (if (pos? p)
                (* p p-joint)
                (reduced 0))))
          1
          rules))

(defn- best-match
  [rules models]
  (when (not-empty models)
    (let [rules        (remove (comp nil? second)
                               [[name-contains? (:named rules)]
                                [type-is?       (:type rules)]
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
  [database {:keys [fields tables]}]
  (let [tables (into {}
                 (map (fn [table]
                        (some->> (if database
                                   (db/select Table :db_id database)
                                   (Table))
                                 (best-match table)
                                 (vector (:as table)))))
                 tables)
        fields (into {}
                 (keep (fn [field]
                         (some->> (or (some->> field
                                               :table
                                               (unify-var tables)
                                               :id
                                               (db/select Field :table_id))
                                      (->> field
                                           :table
                                           IllegalArgumentException.
                                           throw))
                                  (best-match field)
                                  (vector (:as field)))))
                 fields)]
    [tables fields]))

(defmulti ->reference
  ^{:doc ""
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

(defn- lay-next-card
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
      (dashboard/add-dashcard! dashboard card (merge (lay-next-card dashboard)
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
  [database]
  (->> (load-rules)
       (mapcat (fn [{:keys [bindings cards]}]
                 (let [[tables fields] (bind-models database bindings)
                       database        (-> tables first val :db_id)]
                   (keep (fn [card]
                           (when-let [query (unify-vars (merge tables fields)
                                                        (:query card))]
                             (create-card! database (assoc card :query query))))
                         cards))))
       (map :id)
       distinct))
