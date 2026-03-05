(ns metabase.lib-be.source-swap
  (:require
   [medley.core :as m]
   [metabase.lib-be.schema.source-swap :as lib-be.schema.source-swap]
   [metabase.lib.card :as lib.card]
   [metabase.lib.field.resolution :as lib.field.resolution]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.parameters :as lib.parameters]
   [metabase.lib.query :as lib.query]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :as perf]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ column matching ---------------------------------------------------

(mu/defn- column-match-key :- :string
  "Gets the column match key from a column. This is used to match columns by name or alias."
  [column :- ::lib.schema.metadata/column]
  (or (:lib/desired-column-alias column) (:name column)))

(mu/defn- column-errors :- [:sequential ::lib-be.schema.source-swap/column-error]
  "Checks for column type mismatches, missing primary keys, extra primary keys, missing foreign keys, and foreign key mismatches."
  [old-column :- ::lib.schema.metadata/column
   new-column :- ::lib.schema.metadata/column]
  (cond-> []
    (not= (:effective-type old-column) (:effective-type new-column))
    (conj :column-type-mismatch)

    (and (lib.types.isa/primary-key? old-column)
         (not (lib.types.isa/primary-key? new-column)))
    (conj :missing-primary-key)

    (and (not (lib.types.isa/primary-key? old-column))
         (lib.types.isa/primary-key? new-column))
    (conj :extra-primary-key)

    (and (lib.types.isa/foreign-key? old-column)
         (not (lib.types.isa/foreign-key? new-column)))
    (conj :missing-foreign-key)

    (and (lib.types.isa/foreign-key? old-column)
         (lib.types.isa/foreign-key? new-column)
         (not= (:fk-target-field-id old-column) (:fk-target-field-id new-column)))
    (conj :foreign-key-mismatch)))

(mu/defn check-column-mappings :- [:sequential ::lib-be.schema.source-swap/column-mapping]
  "Build column mappings between source and target query columns."
  [source-query :- ::lib.schema/query
   target-query :- ::lib.schema/query]
  (let [old-columns    (into [] (remove :remapped-from) (lib.metadata.calculation/returned-columns source-query))
        new-columns    (into [] (remove :remapped-from) (lib.metadata.calculation/returned-columns target-query))
        old-by-name    (m/index-by column-match-key old-columns)
        new-by-name    (m/index-by column-match-key new-columns)
        all-names      (distinct (concat (map column-match-key old-columns)
                                         (map column-match-key new-columns)))]
    (perf/mapv (fn [column-name]
                 (let [old-column (get old-by-name column-name)
                       new-column (get new-by-name column-name)
                       errors     (when (and old-column new-column)
                                    (not-empty (column-errors old-column new-column)))]
                   (cond-> {}
                     old-column (assoc :source old-column)
                     new-column (assoc :target new-column)
                     errors     (assoc :errors errors))))
               all-names)))

;;; ------------------------------------------------ upgrade-field-refs ------------------------------------------------

(mu/defn- same-ref? :- :boolean
  "Checks if two refs are the same. Ignores :lib/uuid, :base-type, and :effective-type."
  [ref-1 :- ::lib.schema.ref/ref
   ref-2 :- ::lib.schema.ref/ref]
  (= (lib.schema.util/mbql-clause-distinct-key ref-1)
     (lib.schema.util/mbql-clause-distinct-key ref-2)))

(mu/defn- walk-clause-field-refs :- :any
  "Walks a clause and applies a function to all `:field` clauses."
  [clause :- :any
   f      :- fn?]
  (lib.walk/walk-clause clause
                        (fn [clause]
                          (cond-> clause
                            (lib.util/field-clause? clause)
                            f))))

(mu/defn- preserve-expression-name :- ::lib.schema.ref/ref
  "Copy the expression name from `old-field-ref` to `new-field-ref`."
  [old-ref :- ::lib.schema.ref/ref
   new-ref :- ::lib.schema.ref/ref]
  (let [expression-name (lib.util/expression-name old-ref)]
    (cond-> new-ref
      expression-name
      (lib.options/update-options assoc :lib/expression-name expression-name))))

(mu/defn- upgrade-field-ref :- ::lib.schema.ref/ref
  "Generate a new ref for a column. Always takes a `:field` ref, may return a `:field` ref or an `:expression` ref."
  [query         :- ::lib.schema/query
   stage-number  :- :int
   field-ref     :- :mbql.clause/field]
  (or (when-let [column (lib.field.resolution/resolve-field-ref query stage-number field-ref)]
        (when-not (::lib.field.resolution/fallback-metadata? column)
          (let [new-field-ref (preserve-expression-name field-ref (lib.ref/ref column))]
            (when-not (same-ref? field-ref new-field-ref)
              new-field-ref))))
      field-ref))

(mu/defn- upgrade-field-refs-in-clauses :- [:sequential :any]
  "Upgrade all field refs in a list of clauses to use name-based field refs when possible."
  [query               :- ::lib.schema/query
   stage-number        :- :int
   clauses             :- [:sequential :any]
   {:keys [distinct?]} :- [:map [:distinct? :boolean]]]
  (into []
        (cond-> (map (fn [clause]
                       (walk-clause-field-refs clause #(upgrade-field-ref query stage-number %))))
          distinct? (comp (m/distinct-by lib.schema.util/mbql-clause-distinct-key)))
        clauses))

(mu/defn- upgrade-field-refs-in-join :- ::lib.schema.join/join
  "Upgrade all field refs in a join. :fields in a join can be a keyword :all or :none, or a list of field refs."
  [query        :- ::lib.schema/query
   stage-number :- :int
   join         :- ::lib.schema.join/join]
  (-> join
      (m/update-existing :fields #(if (keyword? %) % (upgrade-field-refs-in-clauses query stage-number % {:distinct? true})))
      (m/update-existing :conditions #(upgrade-field-refs-in-clauses query stage-number % {:distinct? false}))))

(mu/defn- upgrade-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  "Upgrade all field refs in a list of joins."
  [query        :- ::lib.schema/query
   stage-number :- :int
   joins        :- [:sequential ::lib.schema.join/join]]
  (perf/mapv #(upgrade-field-refs-in-join query stage-number %) joins))

(mu/defn- upgrade-field-refs-in-stage :- ::lib.schema/stage
  "Upgrade all field refs in a stage."
  [query        :- ::lib.schema/query
   stage-number :- :int]
  (let [stage (lib.util/query-stage query stage-number)]
    (-> stage
        (m/update-existing :fields      #(upgrade-field-refs-in-clauses query stage-number % {:distinct? true}))
        (m/update-existing :joins       #(upgrade-field-refs-in-joins query stage-number %))
        (m/update-existing :expressions #(upgrade-field-refs-in-clauses query stage-number % {:distinct? false}))
        (m/update-existing :filters     #(upgrade-field-refs-in-clauses query stage-number % {:distinct? false}))
        (m/update-existing :aggregation #(upgrade-field-refs-in-clauses query stage-number % {:distinct? false}))
        (m/update-existing :breakout    #(upgrade-field-refs-in-clauses query stage-number % {:distinct? true}))
        (m/update-existing :order-by    #(upgrade-field-refs-in-clauses query stage-number % {:distinct? true})))))

(mu/defn upgrade-field-refs-in-query :- ::lib.schema/query
  "Upgrade all field refs in `query` to use name-based field refs when possible."
  [query     :- ::lib.schema/query]
  (update query :stages
          (fn [stages]
            (into []
                  (map-indexed (fn [stage-number _]
                                 (upgrade-field-refs-in-stage query stage-number)))
                  stages))))

(mu/defn- parameter-target-stage-number :- [:maybe :int]
  "Gets the stage number from the parameter target, if it exists and is valid."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (let [stage-number (lib.parameters/parameter-target-stage-number target)
        stage-count  (lib.query/stage-count query)]
    (when (and (>= stage-number -1) (< stage-number stage-count) (pos-int? stage-count))
      stage-number)))

(mu/defn upgrade-field-ref-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, upgrade it to use a name-based field ref when possible."
  [query  :- ::lib.schema/query
   target :- ::lib.schema.parameter/target]
  (or (when (lib.parameters/parameter-target-field-ref target)
        (when-let [stage-number (parameter-target-stage-number query target)]
          (lib.parameters/update-parameter-target-field-ref
           target
           #(upgrade-field-ref query stage-number %))))
      target))

;;; ------------------------------------------------ swap-source -------------------------------------------------------

(mu/defn- swap-source-table-or-card :- ::lib.schema/stage
  "Swaps the source table or card in a stage if the stage uses the old source."
  [{:keys [source-table source-card], :as stage} :- ::lib.schema/stage
   [old-type old-id]                             :- ::lib-be.schema.source-swap/source
   [new-type new-id]                             :- ::lib-be.schema.source-swap/source]
  (if (or (and (= old-type :table) (= old-id source-table))
          (and (= old-type :card) (= old-id source-card)))
    (-> stage
        (dissoc :source-table :source-card)
        (assoc (case new-type :table :source-table :card :source-card) new-id))
    stage))

(mu/defn- swap-source-table-or-card-in-stage :- ::lib.schema/stage
  "Swaps the source table or card in a stage."
  [stage      :- ::lib.schema/stage
   old-source :- ::lib-be.schema.source-swap/source
   new-source :- ::lib-be.schema.source-swap/source]
  (-> (swap-source-table-or-card stage old-source new-source)
      (m/update-existing :joins
                         (fn [joins]
                           (perf/mapv (fn [join]
                                        (m/update-existing join :stages
                                                           (fn [stages]
                                                             (perf/mapv #(swap-source-table-or-card-in-stage % old-source new-source) stages))))
                                      joins)))))

(mu/defn- swap-source-table-or-card-in-query :- ::lib.schema/query
  "Swaps the source table or card in a query."
  [query      :- ::lib.schema/query
   old-source :- ::lib-be.schema.source-swap/source
   new-source :- ::lib-be.schema.source-swap/source]
  (update query :stages (fn [stages] (perf/mapv #(swap-source-table-or-card-in-stage % old-source new-source) stages))))

(mr/def ::field-id-mapping
  [:map
   [:old-id->new-column [:map-of ::lib.schema.id/field ::lib.schema.metadata/column]]
   [:old-source-type ::lib-be.schema.source-swap/source-type]
   [:new-source-type ::lib-be.schema.source-swap/source-type]])

(mu/defn- build-field-id-mapping :- ::field-id-mapping
  "Builds a mapping of old field IDs to new columns."
  [query                                    :- ::lib.schema/query
   [old-source-type old-source-id]          :- ::lib-be.schema.source-swap/source
   [new-source-type new-source-id]          :- ::lib-be.schema.source-swap/source]
  (letfn [(source->columns [source-type source-id]
            (case source-type
              :table (lib.metadata/fields query source-id)
              :card  (lib.card/saved-question-metadata query source-id)))
          (old-column-id->new-column [old-columns new-column-by-key]
            (into {}
                  (keep (fn [old-column]
                          (when-let [new-column (get new-column-by-key (column-match-key old-column))]
                            (when (and (:id old-column))
                              [(:id old-column) new-column]))))
                  old-columns))]
    (let [old-columns (source->columns old-source-type old-source-id)
          new-columns (source->columns new-source-type new-source-id)
          new-column-by-key (m/index-by column-match-key new-columns)]
      {:old-id->new-column (old-column-id->new-column old-columns new-column-by-key)
       :old-source-type old-source-type
       :new-source-type new-source-type})))

(mu/defn- swap-field-ref :- ::lib.schema.ref/ref
  "Swaps a field ref to reference the new source. Assumes that query has been upgraded to use alias-based field refs.

  For ID-based refs:
  - Uses the new field ID when swapping table->table.
  - Uses the new column alias when swapping table->card.

  For implicit joins:
  - Uses the ID of the new column in :source-field.

  Also:
  - Resolves the new field ref and generates a new one based on the resolved column.
  - Always takes a `:field` ref, may return a `:field` ref or an `:expression` ref.
  - Preserves the expression name from the original field ref."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   {:keys [old-id->new-column old-source-type new-source-type]} :- ::field-id-mapping
   field-ref        :- :mbql.clause/field]
  (let [old-id            (lib.ref/field-ref-id field-ref)
        new-id-column     (get old-id->new-column old-id)
        old-fk-id         (-> field-ref lib.options/options :source-field)
        new-fk-id-column  (get old-id->new-column old-fk-id)
        swapped-field-ref (cond-> field-ref
                            (and new-id-column (:id new-id-column) (= :table old-source-type) (= :table new-source-type))
                            (lib.ref/with-field-ref-id (:id new-id-column))

                            ;; base-type is required for name-based refs, make sure it's set
                            (and new-id-column (:base-type new-id-column) (= :table old-source-type) (not= :table new-source-type))
                            (-> (lib.options/update-options assoc :base-type (:base-type new-id-column))
                                (lib.ref/with-field-ref-name (:name new-id-column)))

                            (and new-fk-id-column (:id new-fk-id-column))
                            (lib.options/update-options assoc :source-field (:id new-fk-id-column)))]
    (or (when-let [new-column (lib.field.resolution/resolve-field-ref query stage-number swapped-field-ref)]
          (when-not (::lib.field.resolution/fallback-metadata? new-column)
            (let [new-field-ref (preserve-expression-name field-ref (lib.ref/ref new-column))]
              (when-not (same-ref? field-ref new-field-ref)
                new-field-ref))))
        field-ref)))

(mu/defn- swap-field-refs-in-clauses :- [:sequential :any]
  "Swaps field refs in a list of clauses."
  [query               :- ::lib.schema/query
   stage-number        :- :int
   field-id-mapping    :- ::field-id-mapping
   clauses             :- [:sequential :any]
   {:keys [distinct?]} :- [:map [:distinct? :boolean]]]
  (into []
        (cond-> (map (fn [clause]
                       (walk-clause-field-refs clause #(swap-field-ref query stage-number field-id-mapping %))))
          distinct? (comp (m/distinct-by lib.schema.util/mbql-clause-distinct-key)))
        clauses))

(mu/defn- swap-field-refs-in-join :- ::lib.schema.join/join
  "Swaps field refs in a join."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::field-id-mapping
   join             :- ::lib.schema.join/join]
  (-> join
      (m/update-existing :fields (fn [fields]
                                   (if (keyword? fields)
                                     fields
                                     (swap-field-refs-in-clauses query stage-number field-id-mapping fields {:distinct? true}))))
      (m/update-existing :conditions #(swap-field-refs-in-clauses query stage-number field-id-mapping % {:distinct? false}))))

(mu/defn- swap-field-refs-in-joins :- [:sequential ::lib.schema.join/join]
  "Swaps field refs in a list of joins."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::field-id-mapping
   joins            :- [:sequential ::lib.schema.join/join]]
  (perf/mapv #(swap-field-refs-in-join query stage-number field-id-mapping %) joins))

(mu/defn- swap-field-refs-in-stage :- ::lib.schema/stage
  "Swaps field refs in a stage."
  [query            :- ::lib.schema/query
   stage-number     :- :int
   field-id-mapping :- ::field-id-mapping]
  (-> (lib.util/query-stage query stage-number)
      (m/update-existing :fields      #(swap-field-refs-in-clauses query stage-number field-id-mapping % {:distinct? true}))
      (m/update-existing :joins       #(swap-field-refs-in-joins query stage-number field-id-mapping %))
      (m/update-existing :expressions #(swap-field-refs-in-clauses query stage-number field-id-mapping % {:distinct? false}))
      (m/update-existing :filters     #(swap-field-refs-in-clauses query stage-number field-id-mapping % {:distinct? false}))
      (m/update-existing :aggregation #(swap-field-refs-in-clauses query stage-number field-id-mapping % {:distinct? false}))
      (m/update-existing :breakout    #(swap-field-refs-in-clauses query stage-number field-id-mapping % {:distinct? true}))
      (m/update-existing :order-by    #(swap-field-refs-in-clauses query stage-number field-id-mapping % {:distinct? true}))))

(mu/defn- swap-field-refs-in-query :- ::lib.schema/query
  "Swaps field refs in a query."
  [query            :- ::lib.schema/query
   field-id-mapping :- ::field-id-mapping]
  (m/update-existing query :stages
                     (fn [stages]
                       (into []
                             (map-indexed (fn [stage-number _]
                                            (swap-field-refs-in-stage query stage-number field-id-mapping)))
                             stages))))

(mu/defn swap-source-in-query :- ::lib.schema/query
  "Updates the query to use the new source table or card."
  [query      :- ::lib.schema/query
   old-source :- ::lib-be.schema.source-swap/source
   new-source :- ::lib-be.schema.source-swap/source]
  (swap-field-refs-in-query (swap-source-table-or-card-in-query query old-source new-source)
                            (build-field-id-mapping query old-source new-source)))

(mu/defn swap-source-in-parameter-target :- ::lib.schema.parameter/target
  "If the parameter target is a field ref, swap it to reference the new source."
  [query      :- ::lib.schema/query
   target     :- ::lib.schema.parameter/target
   old-source :- ::lib-be.schema.source-swap/source
   new-source :- ::lib-be.schema.source-swap/source]
  (or (when (lib.parameters/parameter-target-field-ref target)
        (when-let [stage-number (parameter-target-stage-number query target)]
          (let [new-query (swap-source-table-or-card-in-query query old-source new-source)
                field-id-mapping (build-field-id-mapping query old-source new-source)]
            (lib.parameters/update-parameter-target-field-ref
             target
             #(swap-field-ref new-query stage-number field-id-mapping %)))))
      target))
