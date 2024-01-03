(ns metabase.lib.remove-replace
  (:require
   [clojure.set :as set]
   [malli.core :as mc]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.util.match :as mbql.match]
   [metabase.types :as types]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(defn- stage-paths
  [query stage-number]
  (let [joins (lib.join/joins query stage-number)
        join-indices (range (count joins))
        join-condition-paths (for [idx join-indices]
                               [:joins idx :conditions])
        join-field-paths (for [idx join-indices
                               :let [join (nth joins idx)]
                               ;; :fields in a join can be just :all or :none (#31858)
                               :when (not (keyword? (:fields join)))]
                           [:joins idx :fields])]
    (concat [[:order-by] [:breakout] [:filters] [:fields] [:aggregation] [:expressions]]
            join-field-paths
            join-condition-paths)))

(declare remove-local-references)
(declare remove-stage-references)
(declare normalize-fields-clauses)

(defn- find-matching-order-by-index
  [query stage-number [target-op {:keys [temporal-unit binning]} target-ref-id]]
  (->> (lib.util/query-stage query stage-number)
       :order-by
       m/indexed
       (m/find-first (fn [[_idx [_dir _ ordered-clause]]]
                       (and (= (first ordered-clause) target-op)
                            (= (:temporal-unit (second ordered-clause)) temporal-unit)
                            (= (:binning (second ordered-clause)) binning)
                            (= (last ordered-clause) target-ref-id))))
       first))

(defn- sync-order-by-options-with-breakout
  [query stage-number target-clause new-options]
  (if-let [order-by-idx (find-matching-order-by-index query stage-number target-clause)]
    (lib.util/update-query-stage
      query stage-number
      update-in [:order-by order-by-idx 2 1]
      (comp #(m/remove-vals nil? %) merge)
      new-options)
    query))

(defn- remove-breakout-order-by
  [query stage-number target-clause]
  (if-let [order-by-idx (find-matching-order-by-index query stage-number target-clause)]
    (lib.util/update-query-stage
      query
      stage-number
      lib.util/remove-clause
      [:order-by]
      (get-in (lib.util/query-stage query stage-number) [:order-by order-by-idx])
      stage-number)
    query))

(defn- remove-replace-location
  [query stage-number unmodified-query-for-stage location target-clause remove-replace-fn]
  (let [result (lib.util/update-query-stage query stage-number
                                            remove-replace-fn location target-clause)
        target-uuid (lib.options/uuid target-clause)]
    (if (not= query result)
      (mbql.match/match-one location
        [:expressions]
        (-> result
            (remove-local-references
              stage-number
              unmodified-query-for-stage
              :expression
              {}
              (lib.util/expression-name target-clause))
            (remove-stage-references stage-number unmodified-query-for-stage target-uuid))

        [:aggregation]
        (-> result
            (remove-local-references
              stage-number
              unmodified-query-for-stage
              :aggregation
              {}
              target-uuid)
            (remove-stage-references stage-number unmodified-query-for-stage target-uuid))

        #_{:clj-kondo/ignore [:invalid-arity]}
        (:or
          [:breakout]
          [:fields]
          [:joins _ :fields])
        (remove-stage-references result stage-number unmodified-query-for-stage target-uuid)

        _
        result)
      result)))

(defn- remove-local-references [query stage-number unmodified-query-for-stage target-op target-opts target-ref-id]
  (let [stage (lib.util/query-stage query stage-number)
        to-remove (mapcat
                   (fn [location]
                     (when-let [clauses (get-in stage location)]
                       (->> clauses
                            (keep (fn [clause]
                                    (mbql.match/match-one clause
                                      [target-op
                                       (_ :guard #(or (empty? target-opts)
                                                      (set/subset? (set target-opts) (set %))))
                                       target-ref-id] [location clause]))))))
                   (stage-paths query stage-number))]
    (reduce
     (fn [query [location target-clause]]
       (remove-replace-location query stage-number unmodified-query-for-stage location target-clause #(lib.util/remove-clause %1 %2 %3 stage-number)))
     query
     to-remove)))

(defn- remove-stage-references
  [query previous-stage-number unmodified-query-for-stage target-uuid]
  (if-let [stage-number (lib.util/next-stage-number unmodified-query-for-stage previous-stage-number)]
    (let [stage (lib.util/query-stage unmodified-query-for-stage stage-number)
          target-ref-id (->> (lib.metadata.calculation/visible-columns unmodified-query-for-stage stage-number stage)
                             (some (fn [{:keys [lib/source lib/source-uuid] :as column}]
                                     (when (and (= :source/previous-stage source) (= target-uuid source-uuid))
                                       (:lib/desired-column-alias column)))))]
      (if target-ref-id
        ;; We are moving to the next stage, so pass the current query as the unmodified-query-for-stage
        (remove-local-references query stage-number query :field {} target-ref-id)
        query))
    query))

(defn- remove-replace* [query stage-number target-clause remove-or-replace replacement]
  (mu/disable-enforcement
    (let [target-clause (lib.common/->op-arg target-clause)
          stage (lib.util/query-stage query stage-number)
          location (m/find-first
                    (fn [possible-location]
                      (when-let [clauses (get-in stage possible-location)]
                        (let [target-uuid (lib.options/uuid target-clause)]
                          (when (some (comp #{target-uuid} :lib/uuid second) clauses)
                            possible-location))))
                    (stage-paths query stage-number))
          replace? (= :replace remove-or-replace)
          replacement-clause (when replace?
                               (lib.common/->op-arg replacement))
          remove-replace-fn (if replace?
                              #(lib.util/replace-clause %1 %2 %3 replacement-clause)
                              #(lib.util/remove-clause %1 %2 %3 stage-number))
          changing-breakout? (= [:breakout] location)
          sync-breakout-ordering? (and replace?
                                       changing-breakout?
                                       (and (= (first target-clause)
                                               (first replacement-clause))
                                            (= (last target-clause)
                                               (last replacement-clause))))
          query (cond
                  sync-breakout-ordering?
                  (sync-order-by-options-with-breakout
                   query
                   stage-number
                   target-clause
                   (select-keys (second replacement-clause) [:binning :temporal-unit]))

                  changing-breakout?
                  (remove-breakout-order-by query stage-number target-clause)

                  :else
                  query)]
      (if location
        (-> query
            (remove-replace-location stage-number query location target-clause remove-replace-fn)
            normalize-fields-clauses)
        query))))

(declare remove-join)

(mu/defn remove-clause :- :metabase.lib.schema/query
  "Removes the `target-clause` from the stage specified by `stage-number` of `query`.
  If `stage-number` is not specified, the last stage is used."
  ([query :- :metabase.lib.schema/query
    target-clause]
   (remove-clause query -1 target-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause]
   (if (and (map? target-clause) (= (:lib/type target-clause) :mbql/join))
     (remove-join query stage-number target-clause)
     (remove-replace* query stage-number target-clause :remove nil))))

(defn- expression-role
  [an-expression]
  (if (-> an-expression lib.options/options :lib/expression-name)
    :custom-column
    :custom-aggregation))

(def ^:private expression-validator (mc/validator :metabase.lib.schema.expression/expression))

(defn- tweak?
  "Returns if replacing `an-expression` with `new-expression` in `query` at stage `stage-number` is a tweak.
  A tweak changes a top level expression or an aggregation while preserving its name and type."
  [query stage-number an-expression new-expression]
  (and (expression-validator an-expression)
       (expression-validator new-expression)
       (= (lib.metadata.calculation/display-name query stage-number new-expression)
          (lib.metadata.calculation/display-name query stage-number an-expression))
       (types/assignable? (lib.metadata.calculation/type-of query stage-number new-expression)
                          (lib.metadata.calculation/type-of query stage-number an-expression))))

(mu/defn tweak-expression :- :metabase.lib.schema/query
  "Return `query` with `an-exprssion` replaced by `new-expression` at stage `stage-number`.
  If `an-expression` and `new-expressions` are of different type of have different names or roles,
  an exception is thrown.

  This function exists to make trival edits in the FE possible without losing parts of the query
  depending on `an-expression`."
  [query          :- :metabase.lib.schema/query
   stage-number   :- :int
   an-expression  :- :metabase.lib.schema.expression/expression
   new-expression :- :metabase.lib.schema.expression/expression]
  (let [role (expression-role an-expression)
        path (if (= role :custom-column)
               [:expressions]
               [:aggregation])
        expr-name (lib.metadata.calculation/display-name query stage-number an-expression)
        new-expression (if (= role :custom-column)
                         (lib.options/update-options new-expression dissoc :display-name)
                         (lib.options/update-options new-expression #(-> %
                                                                         (dissoc :lib/expression-name)
                                                                         (assoc :name expr-name
                                                                                :display-name expr-name))))]
    (lib.util/update-query-stage query stage-number lib.util/replace-clause path an-expression new-expression)))

(declare replace-join)

(mu/defn replace-clause :- :metabase.lib.schema/query
  "Replaces the `target-clause` with `new-clause` in the `query` stage specified by `stage-number`.
  If `stage-number` is not specified, the last stage is used."
  ([query :- :metabase.lib.schema/query
    target-clause
    new-clause]
   (replace-clause query -1 target-clause new-clause))
  ([query :- :metabase.lib.schema/query
    stage-number :- :int
    target-clause
    new-clause]
   (cond
     (and (map? target-clause) (= (:lib/type target-clause) :mbql/join))
     (replace-join query stage-number target-clause new-clause)

     (tweak? query stage-number target-clause new-clause)
     (tweak-expression query stage-number target-clause new-clause)

     :else
     (remove-replace* query stage-number target-clause :replace new-clause))))

(defn- field-clause-with-join-alias?
  [field-clause join-alias]
  (and (lib.util/field-clause? field-clause)
       (= (lib.join.util/current-join-alias field-clause) join-alias)))

(defn- replace-join-alias
  [a-join old-name new-name]
  (mbql.match/replace a-join
    (field :guard #(field-clause-with-join-alias? % old-name))
    (lib.join/with-join-alias field new-name)))

(defn- rename-join-in-stage
  [stage idx new-name]
  (let [the-joins      (:joins stage)
        [idx old-name] (when (< -1 idx (count the-joins))
                         [idx (get-in the-joins [idx :alias])])]
    (if (and idx (not= old-name new-name))
      (let [unique-name-fn (lib.util/unique-name-generator)
            _              (run! unique-name-fn (map :alias the-joins))
            unique-name    (unique-name-fn new-name)]
        (-> stage
            (assoc-in [:joins idx :alias] unique-name)
            (replace-join-alias old-name unique-name)))
      stage)))

(defn- join-spec->clause
  [query stage-number join-spec]
  (if (integer? join-spec)
    join-spec
    (let [pred (cond-> #{join-spec}
                 (string? join-spec) (comp :alias))]
      (some (fn [[idx a-join]]
              (when (pred a-join)
                idx))
            (m/indexed (:joins (lib.util/query-stage query stage-number)))))))

(mu/defn rename-join :- :metabase.lib.schema/query
  "Rename the join specified by `join-spec` in `query` at `stage-number` to `new-name`.
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If `stage-number` is not provided, the last stage is used.
  If the specified join cannot be found, then `query` is returned as is.
  If renaming the join to `new-name` would clash with an existing join, a
  suffix is appended to `new-name` to make it unique."
  ([query join-spec new-name]
   (rename-join query -1 join-spec new-name))

  ([query        :- :metabase.lib.schema/query
    stage-number :- :int
    join-spec    :- [:or :metabase.lib.schema.join/join :string :int]
    new-name     :- :metabase.lib.schema.common/non-blank-string]
   (if-let [idx (join-spec->clause query stage-number join-spec)]
     (lib.util/update-query-stage query stage-number rename-join-in-stage idx new-name)
     query)))

(defn- remove-matching-missing-columns
  [query-after query-before stage-number match-spec]
  (let [removed-cols (set/difference
                       (set (lib.metadata.calculation/visible-columns query-before stage-number (lib.util/query-stage query-before stage-number)))
                       (set (lib.metadata.calculation/visible-columns query-after stage-number (lib.util/query-stage query-after stage-number))))]
    (reduce
      #(apply remove-local-references %1 stage-number query-after (match-spec %2))
      query-after
      removed-cols)))

(defn- remove-invalidated-refs
  [query-after query-before stage-number]
  (let [query-without-local-refs (remove-matching-missing-columns
                                   query-after
                                   query-before
                                   stage-number
                                   (fn [column] [:field {:join-alias (::lib.join/join-alias column)} (:id column)]))]
    ;; Because joins can use :all or :none, we cannot just use `remove-local-references` we have to manually look at the next stage as well
    (if-let [stage-number (lib.util/next-stage-number query-without-local-refs stage-number)]
      (remove-matching-missing-columns
        query-without-local-refs
        query-before
        stage-number
        (fn [column] [:field {} (:lib/desired-column-alias column)]))
      query-without-local-refs)))

(defn- join-spec->alias
  [query stage-number join-spec]
  (cond
    (integer? join-spec) (get-in (lib.util/query-stage query stage-number) [:joins join-spec :alias])
    (map? join-spec) (:alias join-spec)
    :else join-spec))

(defn- update-joins
  ([query stage-number join-spec f]
   (if-let [join-alias (join-spec->alias query stage-number join-spec)]
     (mu/disable-enforcement
       (let [query-after (as-> query $q
                           (lib.util/update-query-stage
                            $q
                            stage-number
                            (fn [stage]
                              (u/assoc-dissoc stage :joins (f (:joins stage) join-alias))))
                           (lib.util/update-query-stage
                            $q
                            stage-number
                            (fn [stage]
                              (m/update-existing
                               stage
                               :joins
                               (fn [joins]
                                 (mapv #(lib.join/add-default-alias $q stage-number %) joins))))))]
         (-> query-after
             (remove-invalidated-refs query stage-number)
             normalize-fields-clauses)))
     query)))

(defn- has-field-from-join? [form join-alias]
  (some? (mbql.match/match-one form
           (field :guard #(field-clause-with-join-alias? % join-alias)))))

(defn- dependent-join? [join join-alias]
  (or (= (:alias join) join-alias)
      (has-field-from-join? join join-alias)))

(mu/defn remove-join :- :metabase.lib.schema/query
  "Remove the join specified by `join-spec` in `query` at `stage-number`.
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If `stage-number` is not provided, the last stage is used.
  If the specified join cannot be found, then `query` is returned as is.
  Top level clauses containing references to the removed join are removed too."
  ([query join-spec]
   (remove-join query -1 join-spec))

  ([query        :- :metabase.lib.schema/query
    stage-number :- :int
    join-spec    :- [:or :metabase.lib.schema.join/join :string :int]]
   (try
     (update-joins query stage-number join-spec (fn [joins join-alias]
                                                  (not-empty (filterv #(not (dependent-join? % join-alias))
                                                                      joins))))
     (catch #?(:clj Exception :cljs :default) e
       (let [{:keys [error join] error-stage-number :stage-number} (ex-data e)]
         (if (= error ::lib.util/cannot-remove-final-join-condition)
           (-> query
               (remove-join error-stage-number join)
               (remove-join stage-number join-spec))
           (throw e)))))))

(mu/defn replace-join :- :metabase.lib.schema/query
  "Replace the join specified by `join-spec` in `query` at `stage-number` with `new-join`.
  If `new-join` is nil, the join is removed as if by [[remove-join]].
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If `stage-number` is not provided, the last stage is used.
  If the specified join cannot be found, then `query` is returned as is.
  Top level clauses containing references to the removed join are removed too."
  ([query join-spec new-join]
   (replace-join query -1 join-spec new-join))

  ([query        :- :metabase.lib.schema/query
    stage-number :- :int
    join-spec    :- [:or :metabase.lib.schema.join/join :string :int]
    new-join]
   (if (nil? new-join)
     (remove-join query stage-number join-spec)
     (update-joins query stage-number join-spec (fn [joins join-alias]
                                                  (mapv #(if (= (:alias %) join-alias)
                                                           new-join
                                                           %)
                                                        joins))))))

(defn- specifies-default-fields? [query stage-number]
  (let [fields (:fields (lib.util/query-stage query stage-number))]
    (and fields
         ;; Quick first check: if there are any implicitly-joined fields, it's not the default list.
         (not (some (comp :source-field lib.options/options) fields))
         (lib.equality/matching-column-sets? query stage-number fields
                                             (lib.metadata.calculation/default-columns-for-stage query stage-number)))))

(defn- normalize-fields-for-join [query stage-number join]
  (if (#{:none :all} (:fields join))
    ;; Nothing to do if it's already a keyword.
    join
    (cond-> join
      (lib.equality/matching-column-sets?
        query stage-number (:fields join)
        (lib.metadata.calculation/returned-columns query stage-number (assoc join :fields :all)))
      (assoc :fields :all))))

(defn- normalize-fields-for-stage [query stage-number]
  (let [stage (lib.util/query-stage query stage-number)]
    (cond-> query
      (specifies-default-fields? query stage-number)
      (lib.util/update-query-stage stage-number dissoc :fields)

      (:joins stage)
      (lib.util/update-query-stage stage-number update :joins
                                   (partial mapv #(normalize-fields-for-join query stage-number %))))))

(mu/defn normalize-fields-clauses :- :metabase.lib.schema/query
  "Check all the `:fields` clauses in the query - on the stages and any joins - and drops them if they are equal to the
  defaults.
  - For stages, if the `:fields` list is identical to the default fields for this stage.
  - For joins, replace it with `:all` if it's all the fields that are in the join by default.
  - For joins, remove it if the list is empty (the default for joins is no fields)."
  [query :- :metabase.lib.schema/query]
  (reduce normalize-fields-for-stage query (range (count (:stages query)))))
