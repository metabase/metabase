(ns metabase-enterprise.semantic-layer-import.dbt.joins
  "dbt entities as the IR's joins (see `::ir/join`) and aliases.

  dbt joins semantic models by entity: a foreign or unique entity of one semantic model joins to the other semantic
  model that is keyed by an entity of the same name, as its primary entity or as a unique one, either of which
  identifies one row. These are the joins MetricFlow itself allows, except that a model's primary entity is not
  followed to another model keyed by it: it names the model's own dimensions in a filter
  (`Dimension('<primary entity>__<dimension>')`), so it is an alias of the table instead (see `aliases` on
  `::ir/table`). An entity more than one other model is keyed by joins to each of them, with one join per model, all
  named after the entity: a dimension is then reached through whichever of those models has it, as MetricFlow
  resolves `Dimension('<entity>__<dimension>')`, and a dimension that is on several of them is ambiguous unless the
  option `:entity-models` names the model whose dimension it is, whose join is the `preferred` one (see
  `::ir/join.supported`).

  A natural entity is the key of a slowly changing dimension (dbt's SCD type II), whose rows are versions of one thing
  told apart by the validity window of its time dimensions: MetricFlow joins to and from one through the window, which
  an implicit join cannot express, so such a join is reported. Every join that cannot be made is an
  `::ir/join.unsupported` naming what the dimension set reports for it: the dimensions behind it, the entity itself
  when the models behind it are a slowly changing dimension's, or nothing when no model is keyed by the entity, which
  is then just a key. A filter through it reports the metric with the reason."
  (:require
   [better-cond.core :as b]
   [clojure.string :as str]
   [medley.core :as m]
   [metabase-enterprise.semantic-layer-import.dbt.manifest :as manifest]
   [metabase-enterprise.semantic-layer-import.schemas.ir :as ir]
   [metabase-enterprise.semantic-layer-import.sql :as sql]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::entity
  "An entity of a semantic model, with dbt's default applied: a nil `expr` means the name is the column."
  [:map {:closed true}
   [:name :string]
   [:type ::manifest/entity-type]
   [:expr :string]])

(mr/def ::model
  "A semantic model as the joins see it: the IR table it becomes, its joins not yet known, and its entities."
  [:map {:closed true}
   [:table    ::ir/table]
   [:entities [:sequential ::entity]]])

(mu/defn- keyed-by? :- :boolean
  "Whether a join through `entity-name` can lead to `model`: the entity is the model's primary entity (an alias of its
  table), or one of its unique entities."
  [{:keys [table entities]} :- ::model
   entity-name              :- :string]
  (boolean (or (contains? (:aliases table) entity-name)
               (m/find-first #(and (= entity-name (:name %)) (= :unique (:type %))) entities))))

(mu/defn- other-models :- [:sequential ::model]
  "The models other than `model` that satisfy `pred`, by name."
  [models :- [:sequential ::model]
   model  :- ::model
   pred   :- [:=> [:cat ::model] :any]]
  (->> models
       (filter #(and (not= (-> % :table :name) (-> model :table :name)) (pred %)))
       (sort-by (comp :name :table))))

(mu/defn- keyed-models :- [:sequential ::model]
  "The models other than `model` a join through `entity-name` can lead to (see [[keyed-by?]])."
  [models      :- [:sequential ::model]
   model       :- ::model
   entity-name :- :string]
  (other-models models model #(keyed-by? % entity-name)))

(mu/defn- natural-models :- [:sequential ::model]
  "The models other than `model` that have `entity-name` as a natural entity: slowly changing dimensions, which a join
  through the entity would reach through their validity windows."
  [models      :- [:sequential ::model]
   model       :- ::model
   entity-name :- :string]
  (other-models models model (fn [{:keys [entities]}]
                               (m/find-first #(and (= entity-name (:name %)) (= :natural (:type %))) entities))))

(mu/defn- model-names :- :string
  "`models`' names for a message, quoted and comma-separated."
  [models :- [:sequential ::model]]
  (str/join ", " (map (comp pr-str :name :table) models)))

(mu/defn- column-name :- [:maybe :string]
  "The column `expr` names; nil when it is SQL, which an implicit join has no use for: it needs a column on each
  side."
  [expr :- :string]
  (let [{:keys [kind], the-name :name} (sql/parse-expr expr)]
    (when (= kind :column)
      the-name)))

(mu/defn- unsupported-join :- ::ir/join.unsupported
  [entity-name :- :string
   reason      :- :string
   unreachable :- [:sequential :string]]
  {:name entity-name, :reason reason, :unreachable (vec unreachable)})

(mu/defn- dimension-names :- [:sequential :string]
  "The names of the dimensions of `model`'s table: what the dimension set reports when a join to it cannot be made."
  [model :- ::model]
  (map :name (-> model :table :dimensions)))

(mu/defn- target-join :- ::ir/join
  "The join through `entity-name`, the column `source-column` of the model the join is on, to `target`, a model keyed
  by the entity; `preferred?` when `:entity-models` names it. Unsupported when the target has no entity of that name
  to join on (a `primary_entity` naming none of its own: dbt's virtual primary entity) or its entity is SQL."
  [entity-name   :- :string
   source-column :- :string
   preferred?    :- :boolean
   target        :- ::model]
  (let [target-name   (-> target :table :name)
        target-entity (m/find-first #(= entity-name (:name %)) (:entities target))]
    (cond
      (not target-entity)
      (unsupported-join entity-name
                        (format "semantic model %s names %s as its primary_entity but has no entity of that name to join on"
                                (pr-str target-name) (pr-str entity-name))
                        (dimension-names target))

      (not (column-name (:expr target-entity)))
      (unsupported-join entity-name
                        (format (str "entity %s on semantic model %s is the SQL expression %s, not a column; an implicit"
                                     " join needs a column")
                                (pr-str entity-name) (pr-str target-name) (pr-str (:expr target-entity)))
                        (dimension-names target))

      :else
      (cond-> {:name entity-name, :table target-name, :source-column source-column}
        preferred? (assoc :preferred? true)))))

(mu/defn- entity-joins :- [:sequential ::ir/join]
  "The joins through the foreign or unique `entity` of `model`: one to each model keyed by it (see [[keyed-by?]]), in
  name order, the one `entity-models` names, if it names one, being the preferred join (see [[target-join]] and
  `::ir/join.supported`). One unsupported join standing for them all when no model is keyed by the entity, when
  `entity-models` names a model that is not one of them, or when the entity is SQL on this side. A model keyed by
  none, but with the entity as a natural one, is a slowly changing dimension, and the join is reported once, under
  the entity's name."
  [models                          :- [:sequential ::model]
   entity-models                   :- [:map-of :string :string]
   model                           :- ::model
   {entity-name :name, :as entity} :- ::entity]
  (b/cond
    :let [candidates  (keyed-models models model entity-name)
          chosen      (get entity-models entity-name)
          unreachable (distinct (mapcat dimension-names candidates))
          unsupported (fn [reason & args]
                        [(unsupported-join entity-name (apply format reason args) unreachable)])]

    (and (empty? candidates) (seq (natural-models models model entity-name)))
    [(unsupported-join entity-name
                       (format (str "entity %s is the natural entity of semantic model %s, a slowly changing dimension;"
                                    " a join to it needs the validity window of its time dimensions, which an implicit"
                                    " join cannot express")
                               (pr-str entity-name) (model-names (natural-models models model entity-name)))
                       [entity-name])]

    (empty? candidates)
    (unsupported "no semantic model has entity %s as its primary or a unique entity" (pr-str entity-name))

    (and chosen (not (some #(= chosen (-> % :table :name)) candidates)))
    (unsupported (str ":entity-models names semantic model %s for entity %s, but the models with it as their primary"
                      " or a unique entity are %s")
                 (pr-str chosen) (pr-str entity-name) (model-names candidates))

    :let [source-column (column-name (:expr entity))]

    (not source-column)
    (unsupported "entity %s is the SQL expression %s, not a column; an implicit join needs a column"
                 (pr-str entity-name) (pr-str (:expr entity)))

    :else
    (mapv #(target-join entity-name source-column (= chosen (-> % :table :name)) %) candidates)))

(mu/defn- natural-entity-joins :- [:sequential ::ir/join.unsupported]
  "The join through the natural `entity` of `model`. A natural entity is the key of a slowly changing dimension, and a
  join from it needs the validity window of `model`'s time dimensions: reported once, under the entity's name, when
  another model is keyed by it. A natural entity no other model is keyed by is just a key, and reports nothing in the
  dimension set; a filter through it is reported as through any entity that joins nowhere."
  [models                          :- [:sequential ::model]
   entity-models                   :- [:map-of :string :string]
   model                           :- ::model
   {entity-name :name, :as entity} :- ::entity]
  (if-let [targets (seq (keyed-models models model entity-name))]
    [(unsupported-join entity-name
                       (format (str "entity %s is a natural entity, the key of a slowly changing dimension; a join"
                                    " from it to %s needs the validity window of this model's time dimensions, which"
                                    " an implicit join cannot express")
                               (pr-str entity-name) (model-names targets))
                       [entity-name])]
    ;; no model is keyed by the entity, so these are the unsupported joins through an entity that joins nowhere
    (mapv #(assoc % :unreachable []) (entity-joins models entity-models model entity))))

(mu/defn table-joins :- [:sequential ::ir/join]
  "The joins of `model`'s table among `models`, in the order the model declares its entities: one per model keyed by a
  foreign or unique entity (see [[entity-joins]]), and none for its primary entity, which is an alias of the table
  (see the namespace docstring)."
  [models                       :- [:sequential ::model]
   entity-models                :- [:map-of :string :string]
   {:keys [entities] :as model} :- ::model]
  (into []
        (mapcat (fn [{entity-type :type, :as entity}]
                  (case entity-type
                    (:foreign :unique) (entity-joins models entity-models model entity)
                    :natural           (natural-entity-joins models entity-models model entity)
                    :primary           [])))
        entities))
