(ns metabase.xrays.transforms.core
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.driver :as driver]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.xrays.domain-entities.core :as de]
   [metabase.xrays.domain-entities.schema :as domain-entities.schema]
   [metabase.xrays.domain-entities.specs :refer [domain-entity-specs]]
   [metabase.xrays.transforms.materialize :as tf.materialize]
   [metabase.xrays.transforms.schema :as transforms.schema]
   [metabase.xrays.transforms.specs :refer [transform-specs]]))

(mu/defn- resolve-dimension-clauses :- ::domain-entities.schema/no-unresolved-dimension-placeholders
  "Instantiate all dimension reference in given (nested) structure"
  [form
   source   :- [:or
                ::domain-entities.schema/domain-entity.name
                ::transforms.schema/step.name]
   bindings :- ::transforms.schema/bindings]
  (walk/postwalk
   (fn [form]
     (or (when (= (:lib/type form) :xrays/unresolved-dimension)
           (when (seq (:options form))
             (throw (ex-info "OPTIONS SUPPORT NOT YET IMPLEMENTED" {:form form})))
           (let [dimension-name (:xrays/dimension-name form)
                 [x y]                             (str/split dimension-name #"\." 2)
                 [dimension-source dimension-name] (if y
                                                     [x y]
                                                     [source x])
                 dimensions                        (get-in bindings [dimension-source :transform.binding/dimensions])]
             (or (get dimensions dimension-name)
                 (throw (ex-info (format "Failed to resolve dimension %s in %s; found: %s"
                                         (pr-str dimension-name)
                                         (pr-str dimension-source)
                                         (pr-str (update-vals bindings (comp keys :transform.binding/dimensions))))
                                 {:form form, :bindings bindings})))))
         form))
   form))

(mu/defn- add-bindings :- ::transforms.schema/bindings
  [bindings     :- ::transforms.schema/bindings
   source       :- ::domain-entities.schema/domain-entity.name
   new-bindings :- [:maybe [:map-of
                            ::domain-entities.schema/dimension-name
                            [:or
                             ::lib.schema.metadata/column
                             ::domain-entities.schema/mbql-placeholder]]]]
  (update-in bindings [source :transform.binding/dimensions]
             merge
             (update-vals new-bindings #(resolve-dimension-clauses % source bindings))))

(mu/defn- infer-resulting-dimensions :- ::domain-entities.schema/reified-dimensions
  [bindings                            :- ::transforms.schema/bindings
   {:transform.step/keys [joins name]} :- ::transforms.schema/step
   query                               :- ::lib.schema/query]
  (let [flattened-bindings (merge (apply merge (map (comp :transform.binding/dimensions bindings :transform.join/source) joins))
                                  (get-in bindings [name :transform.binding/dimensions]))]
    (assert (some? flattened-bindings))
    (into {}
          (map (mu/fn [{desired-column-alias :lib/desired-column-alias, :as col} :- :metabase.lib.metadata.calculation/returned-column]
                 (let [k (if (flattened-bindings desired-column-alias)
                           desired-column-alias
                           ;; If the col is not one of our own we have to reconstruct to what it refers in
                           ;; our parlance
                           (or (some (fn [[k v]]
                                       (when (= ((some-fn :lib/desired-column-alias :name) v) desired-column-alias)
                                         k))
                                     flattened-bindings)
                               ;; If that doesn't work either, it's a duplicated col from a join
                               desired-column-alias))]
                   [k (lib/update-keys-for-col-from-previous-stage col)])))
          (lib/returned-columns query))))

(mu/defn- maybe-add-fields :- ::lib.schema/query
  [query :- ::lib.schema/query
   bindings :- ::transforms.schema/bindings
   {:transform.step/keys [aggregations source], :as _step} :- ::transforms.schema/step]
  (cond-> query
    (not aggregations) (lib/with-fields (vals (get-in bindings [source :transform.binding/dimensions])))))

(mu/defn- maybe-add-expressions :- ::lib.schema/query
  [query :- ::lib.schema/query
   bindings :- ::transforms.schema/bindings
   {step-name :transform.step/name, :transform.step/keys [expressions], :as step} :- ::transforms.schema/step]
  (transduce
   (map (fn [[expression-name]]
          [expression-name (or (get-in bindings [step-name :transform.binding/dimensions expression-name])
                               (throw (ex-info (pr-str "Failed to resolve expression %s" (pr-str expression-name))
                                               {:step step, :expression-name expression-name})))]))
   (completing
    (fn [query [expression-name expression]]
      (lib/expression query expression-name expression)))
   query
   expressions))

(mu/defn- maybe-add-aggregation :- ::lib.schema/query
  [query :- ::lib.schema/query
   bindings :- ::transforms.schema/bindings
   {step-name :transform.step/name, :transform.step/keys [aggregations], :as step} :- ::transforms.schema/step]
  (transduce
   (map (mu/fn :- ::lib.schema.common/external-op
          [[ag-name _ag]]
          (-> (or (get-in bindings [step-name :transform.binding/dimensions ag-name])
                  (throw (ex-info (format "Failed to resolve aggregation %s" (pr-str ag-name))
                                  {:step step, :aggregation ag-name})))
              (assoc-in [:options :name] ag-name)
              (->> (lib/normalize ::lib.schema.common/external-op)))))
   (completing lib/aggregate)
   query
   aggregations))

(mu/defn- maybe-add-breakout :- ::lib.schema/query
  [query    :- ::lib.schema/query
   bindings :- ::transforms.schema/bindings
   {step-name :transform.step/name, :transform.step/keys [breakouts], :as _step} :- ::transforms.schema/step]
  (transduce
   (map (mu/fn :- ::lib.schema.metadata/column
          [breakout]
          (resolve-dimension-clauses breakout step-name bindings)))
   (completing lib/breakout)
   query
   breakouts))

(mu/defn- maybe-add-joins :- ::lib.schema/query
  [query                                    :- ::lib.schema/query
   bindings                                 :- ::transforms.schema/bindings
   {joins :transform.step/joins, :as _step} :- ::transforms.schema/step]
  (letfn [(add-join [query {:transform.join/keys [source condition strategy], :as _join}]
            (let [source-entity (-> source bindings :transform.binding/entity)
                  condition     (resolve-dimension-clauses condition source bindings)
                  join-clause   (-> (lib/join-clause source-entity)
                                    (lib/with-join-alias source)
                                    (lib/with-join-fields :all)
                                    (lib/with-join-conditions [condition])
                                    (cond-> strategy
                                      (lib/with-join-strategy strategy)))]
              (lib/join query join-clause)))]
    (reduce add-join query joins)))

(mu/defn- maybe-add-filter :- ::lib.schema/query
  [query :- ::lib.schema/query
   bindings :- ::transforms.schema/bindings
   {step-name :transform.step/name, step-filter :transform.step/filter, :as _step} :- ::transforms.schema/step]
  (let [filter-clause (resolve-dimension-clauses step-filter step-name bindings)]
    (cond-> query
      filter-clause
      (lib/filter filter-clause))))

(mu/defn- maybe-add-limit :- ::lib.schema/query
  [query :- ::lib.schema/query
   {:transform.step/keys [limit], :as _step} :- ::transforms.schema/step]
  (cond-> query
    limit
    (lib/limit limit)))

(mu/defn- transform-step! :- ::transforms.schema/bindings
  [bindings :- ::transforms.schema/bindings
   {source-name          :transform.step/source
    step-name            :transform.step/name
    :transform.step/keys [aggregations expressions] :as step} :- ::transforms.schema/step]
  (let [source-entity  (get-in bindings [source-name :transform.binding/entity])
        local-bindings (-> bindings
                           (add-bindings step-name (get-in bindings [source-name :transform.binding/dimensions]))
                           (add-bindings step-name expressions)
                           (add-bindings step-name aggregations))
        database-id    (or ((some-fn :db-id :database-id) source-entity)
                           (throw (ex-info "Source entity is missing Database ID" {:source-entity source-entity})))
        mp             (lib-be/application-database-metadata-provider database-id)
        query          (-> (lib/query mp source-entity)
                           (maybe-add-fields      local-bindings step)
                           (maybe-add-expressions local-bindings step)
                           (maybe-add-aggregation local-bindings step)
                           (maybe-add-breakout    local-bindings step)
                           (maybe-add-joins       local-bindings step)
                           (maybe-add-filter      local-bindings step)
                           (maybe-add-limit step))]
    (assoc bindings step-name {:transform.binding/entity     (tf.materialize/make-card-for-step! step query)
                               :transform.binding/dimensions (infer-resulting-dimensions local-bindings step query)})))

(mr/def ::table-set
  [:sequential ::domain-entities.schema/table-with-domain-entity])

(mu/defn- find-tables-with-domain-entity :- ::table-set
  [tableset           :- ::table-set
   domain-entity-spec :- ::domain-entities.schema/domain-entity-spec]
  (filter #(-> % :xrays/domain-entity :domain-entity/type (isa? (:domain-entity/type domain-entity-spec)))
          tableset))

(mu/defn- tableset->bindings :- ::transforms.schema/bindings
  [tableset :- ::table-set]
  (into {}
        (map (fn [{{domain-entity-name :domain-entity/name
                    dimensions         :domain-entity/dimensions
                    :as                _reified-domain-entity} :xrays/domain-entity
                   :as                                         table}]
               [domain-entity-name
                #:transform.binding{:dimensions dimensions
                                    :entity     table}]))
        tableset))

(mu/defn- apply-transform-to-tableset! :- ::transforms.schema/bindings
  [metadata-providerable     :- ::lib.schema.metadata/metadata-providerable
   tableset                  :- ::table-set
   {:transform/keys [steps]} :- ::transforms.schema/transform-spec]
  (driver/with-driver (:engine (lib.metadata/database metadata-providerable))
    (reduce transform-step! (tableset->bindings tableset) (vals steps))))

(mu/defn- resulting-cards :- [:sequential {:min 1} ::lib.schema.metadata/card]
  [bindings                     :- ::transforms.schema/bindings
   {:transform/keys [provides]} :- ::transforms.schema/transform-spec]
  (map (comp :transform.binding/entity val) (select-keys bindings provides)))

(mu/defn- validate-results :- ::transforms.schema/bindings
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   bindings              :- ::transforms.schema/bindings
   {:keys [provides]}    :- ::transforms.schema/transform-spec]
  (doseq [domain-entity-name provides]
    (assert (de/satisfies-requirements? metadata-providerable
                                        (get-in bindings [domain-entity-name :transform.binding/entity])
                                        ((domain-entity-specs) domain-entity-name))
            (str (tru "Resulting transforms do not conform to expectations.\nExpected: {0}"
                      domain-entity-name))))
  bindings)

(mu/defn- tables-matching-requirements :- [:maybe ::table-set]
  [tableset                     :- ::table-set
   {:transform/keys [requires]} :- ::transforms.schema/transform-spec]
  (let [matches (map (comp (partial find-tables-with-domain-entity tableset)
                           (domain-entity-specs))
                     requires)]
    (when (every? (comp #{1} count) matches)
      (map first matches))))

(mu/defn- tableset :- ::table-set
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   schema                :- [:maybe :string]]
  (->> (lib.metadata/tables metadata-providerable)
       (filter #(= (:schema %) schema))
       (de/with-domain-entity metadata-providerable)))

(mu/defn apply-transform! :- [:maybe [:sequential {:min 1} ::lib.schema.metadata/card]]
  "Apply transform defined by transform spec `spec` to schema `schema` in database `db-id`.

  The algorithm is as follows:
  1) Try to find a set of tables in the given schema that have required domain entities.
  2) If found, use these tables and their fields as the initial bindings.
  3) Go through the transform steps, materialize them as cards, and accure these and their result
     cols to the bindings.
  4) Check that all output cards have the expected result shape.
  5) Return the output cards."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   schema                :- [:maybe :string]
   spec                  :- ::transforms.schema/transform-spec]
  (tf.materialize/fresh-collection-for-transform! spec)
  (some-> (tableset metadata-providerable schema)
          (tables-matching-requirements spec)
          (as-> $bindings (apply-transform-to-tableset! metadata-providerable $bindings spec))
          (as-> $bindings (validate-results metadata-providerable $bindings spec))
          (resulting-cards spec)))

(mu/defn candidates
  "Return a list of candidate transforms for a given table."
  [metadata-providerable :- ::lib.schema.metadata/metadata-providerable
   table                 :- ::lib.schema.metadata/table]
  (filter (comp (partial some (comp #{(u/the-id table)} u/the-id))
                (partial tables-matching-requirements (tableset metadata-providerable (:schema table))))
          (transform-specs)))
