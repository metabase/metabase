(ns metabase.xrays.domain-entities.core
  (:require
   [clojure.walk :as walk]
   [metabase.lib.card :as lib.card]
   [metabase.lib.core :as lib]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.xrays.domain-entities.schema :as domain-entities.schema]
   [metabase.xrays.domain-entities.specs :refer [domain-entity-specs]]))

(mu/defn- field->dimension-type :- ::domain-entities.schema/dimension-type
  "Return the most specific type of a given field."
  [col :- ::lib.schema.metadata/column]
  ((some-fn :semantic-type :base-type) col))

(mu/defn resolve-dimension-clauses :- ::domain-entities.schema/no-unresolved-dimension-placeholders
  "Instantiate all dimension reference in given (nested) structure"
  [form
   dimensions :- [:maybe ::domain-entities.schema/reified-dimensions]]
  (if (empty? dimensions)
    form
    (walk/postwalk
     (fn [form]
       (or (when (= (:lib/type form) :xrays/unresolved-dimension)
             (when (seq (:options form))
               (assert (map? (:options form))
                       "WTF"))
             (let [dimension-name (:xrays/dimension-name form)
                   resolved       (or (get dimensions dimension-name)
                                      (throw (ex-info (format "Failed to resolve dimension %s" (pr-str dimension-name))
                                                      {:form form, :dimensions dimensions})))]
               (merge resolved (some-> form :options not-empty lib.field.resolution/options-metadata))))
           form))
     form)))

(mu/defn- has-attribute?
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   entity                :- [:or
                             ::lib.schema.metadata/table
                             ::lib.schema.metadata/card]
   {field :domain-entity.attribute/field, :as _attribute} :- ::domain-entities.schema/attribute]
  (some (fn [col]
          (when (or (isa? (field->dimension-type col) field)
                    (= (:name col) (name field)))
            col))
        (case (:lib/type entity)
          :metadata/card  (lib.card/card-returned-columns metadata-providerable entity)
          :metadata/table (lib.metadata/active-fields metadata-providerable (:id entity)))))

(mu/defn satisfies-requirements?
  "Does source entity satisfies requirements of given spec?"
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   entity                :- [:or
                             ::lib.schema.metadata/table
                             ::lib.schema.metadata/card]
   {:domain-entity/keys [required-attributes], :as _domain-entity-spec} :- ::domain-entities.schema/domain-entity-spec]
  (every? (partial has-attribute? metadata-providerable entity) required-attributes))

(defn- best-match
  [candidates]
  (->> candidates
       (sort-by (juxt (comp count ancestors :domain-entity/type) (comp count :domain-entity/required-attributes)))
       last))

(mu/defn- instantiate-domain-entity :- ::domain-entities.schema/reified-domain-entity
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   table                 :- ::lib.schema.metadata/table
   domain-entity-spec    :- ::domain-entities.schema/domain-entity-spec]
  (let [dimensions (into {}
                         (map (juxt #(name (field->dimension-type %)) identity))
                         (lib.metadata/active-fields metadata-providerable (u/the-id table)))]
    (-> domain-entity-spec
        (update :domain-entity/metrics  update-vals #(resolve-dimension-clauses % dimensions))
        (update :domain-entity/segments update-vals #(resolve-dimension-clauses % dimensions))
        (update :domain-entity/breakout-dimensions resolve-dimension-clauses dimensions)
        (assoc :domain-entity/dimensions   dimensions
               :domain-entity/source-table table)
        (dissoc :domain-entity/required-attributes :domain-entity/optional-attributes))))

(mu/defn domain-entity-for-table :- [:maybe ::domain-entities.schema/reified-domain-entity]
  "Find the best fitting domain entity for given table."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   table                 :- ::lib.schema.metadata/table]
  (some->> (domain-entity-specs)
           vals
           (filter (partial satisfies-requirements? metadata-providerable table))
           best-match
           (instantiate-domain-entity metadata-providerable table)))

(mu/defn with-domain-entity :- [:sequential ::domain-entities.schema/table-with-domain-entity]
  "Fake hydration function."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   tables                :- [:sequential ::lib.schema.metadata/table]]
  (for [table tables]
    (assoc table :xrays/domain-entity (domain-entity-for-table metadata-providerable table))))
