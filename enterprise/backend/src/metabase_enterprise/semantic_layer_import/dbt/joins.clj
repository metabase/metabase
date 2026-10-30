(ns metabase-enterprise.semantic-layer-import.dbt.joins
  "dbt entities as the IR's joins (see `::ir/join`) and aliases.

  dbt joins semantic models by entity: a foreign or unique entity of one semantic model joins to the other semantic
  model that is keyed by an entity of the same name, as its primary entity or as a unique one, either of which
  identifies one row. These are the joins MetricFlow itself allows, except that a model's primary entity is not
  followed to another model keyed by it: it names the model's own dimensions in a filter
  (`Dimension('<primary entity>__<dimension>')`), so it is an alias of the table instead (see `aliases` on
  `::ir/table`). An entity more than one other model is keyed by joins to the one the option `:entity-models` names.

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

(mu/defn- entity-join :- ::ir/join
  "The join through the foreign or unique `entity` of `model` to the one model keyed by it, or the one
  `entity-models` names when several are. Unsupported when there is none, when there are several that
  `entity-models` does not choose between, when the model it names is not one of them, when the model joined to has
  no entity of that name to join on (a `primary_entity` naming none of its own: dbt's virtual primary entity), or when
  the entity is SQL on either side. A model keyed by none, but with the entity as a natural one, is a slowly changing
  dimension, and the join is reported once, under the entity's name."
  [models                          :- [:sequential ::model]
   entity-models                   :- [:map-of :string :string]
   model                           :- ::model
   {entity-name :name, :as entity} :- ::entity]
  (b/cond
    :let [candidates  (keyed-models models model entity-name)
          chosen      (get entity-models entity-name)
          unreachable (for [candidate candidates
                            dimension (-> candidate :table :dimensions)]
                        (:name dimension))
          unsupported (fn [reason & args]
                        (unsupported-join entity-name (apply format reason args) unreachable))]

    (and (empty? candidates) (seq (natural-models models model entity-name)))
    (unsupported-join entity-name
                      (format (str "entity %s is the natural entity of semantic model %s, a slowly changing dimension;"
                                   " a join to it needs the validity window of its time dimensions, which an implicit"
                                   " join cannot express")
                              (pr-str entity-name) (model-names (natural-models models model entity-name)))
                      [entity-name])

    (empty? candidates)
    (unsupported "no semantic model has entity %s as its primary or a unique entity" (pr-str entity-name))

    (and (next candidates) (not chosen))
    (unsupported (str "more than one semantic model has entity %s as its primary or a unique entity: %s; name the"
                      " one to join to in :entity-models")
                 (pr-str entity-name) (model-names candidates))

    (and (next candidates) (not (some #(= chosen (-> % :table :name)) candidates)))
    (unsupported (str ":entity-models names semantic model %s for entity %s, but the models with it as their primary"
                      " or a unique entity are %s")
                 (pr-str chosen) (pr-str entity-name) (model-names candidates))

    :let [target        (if (next candidates)
                          (m/find-first #(= chosen (-> % :table :name)) candidates)
                          (first candidates))
          target-name   (-> target :table :name)
          target-entity (m/find-first #(= entity-name (:name %)) (:entities target))]

    (not target-entity)
    (unsupported "semantic model %s names %s as its primary_entity but has no entity of that name to join on"
                 (pr-str target-name) (pr-str entity-name))

    :let [source-column (column-name (:expr entity))]

    (not source-column)
    (unsupported "entity %s is the SQL expression %s, not a column; an implicit join needs a column"
                 (pr-str entity-name) (pr-str (:expr entity)))

    (not (column-name (:expr target-entity)))
    (unsupported (str "entity %s on semantic model %s is the SQL expression %s, not a column; an implicit join needs"
                      " a column")
                 (pr-str entity-name) (pr-str target-name) (pr-str (:expr target-entity)))

    :else
    {:name entity-name, :table target-name, :source-column source-column}))

(mu/defn- natural-entity-join :- ::ir/join.unsupported
  "The join through the natural `entity` of `model`. A natural entity is the key of a slowly changing dimension, and a
  join from it needs the validity window of `model`'s time dimensions: reported once, under the entity's name, when
  another model is keyed by it. A natural entity no other model is keyed by is just a key, and reports nothing in the
  dimension set; a filter through it is reported as through any entity that joins nowhere."
  [models                          :- [:sequential ::model]
   entity-models                   :- [:map-of :string :string]
   model                           :- ::model
   {entity-name :name, :as entity} :- ::entity]
  (if-let [targets (seq (keyed-models models model entity-name))]
    (unsupported-join entity-name
                      (format (str "entity %s is a natural entity, the key of a slowly changing dimension; a join"
                                   " from it to %s needs the validity window of this model's time dimensions, which"
                                   " an implicit join cannot express")
                              (pr-str entity-name) (model-names targets))
                      [entity-name])
    (assoc (entity-join models entity-models model entity) :unreachable [])))

(mu/defn table-joins :- [:sequential ::ir/join]
  "The joins of `model`'s table among `models`, one per entity in the order the model declares them, but for its
  primary entity, which is an alias of the table (see the namespace docstring)."
  [models                       :- [:sequential ::model]
   entity-models                :- [:map-of :string :string]
   {:keys [entities] :as model} :- ::model]
  (into []
        (keep (fn [{entity-type :type, :as entity}]
                (case entity-type
                  (:foreign :unique) (entity-join models entity-models model entity)
                  :natural           (natural-entity-join models entity-models model entity)
                  :primary           nil)))
        entities))
