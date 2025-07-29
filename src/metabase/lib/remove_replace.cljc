(ns metabase.lib.remove-replace
  (:require
   [clojure.set :as set]
   [clojure.walk :as walk]
   [medley.core :as m]
   [metabase.lib.common :as lib.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.join :as lib.join]
   [metabase.lib.join.util :as lib.join.util]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.join :as lib.schema.join]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

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
(declare remove-join)
(declare rename-join)
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

(defn- update-stale-references-in-stage
  "Fix stale references in `stage-number` stage of `query-modfied`.

  `stage-number` should not be 0; [[update-stale-references]] is about fixing subsequent stages."
  [query-modified stage-number query-original]
  (let [old-columns (lib.metadata.calculation/visible-columns query-original stage-number)
        new-columns (lib.metadata.calculation/visible-columns query-modified stage-number)
        source-uuid->new-column (m/index-by :lib/source-uuid new-columns)]
    (lib.util/update-query-stage
     query-modified stage-number
     #(lib.util.match/replace
        %
        #{:field}
        (let [old-matching-column (lib.equality/find-matching-column &match old-columns)]
          (if-let [new-column (some-> old-matching-column :lib/source-uuid source-uuid->new-column)]
            (assoc &match 2 ((some-fn :lib/desired-column-alias :name) new-column))
            (do
              (log/warnf "Failed to match downstream ref %s against visible columns, ref is on stage %d at %s"
                         &match stage-number &parents)
              &match)))))))

(defn update-stale-references
  "Update stale refs in query after clause removal.

  ## Gist
  For stages that follow `previous-stage-number` match existing on-stage refs to new visible columns, generated for
  the modified query. Swap these refs with fresh refs created using new visible columns, but use the original column
  options.

  ## Problem

  Let's have a query with 2 `:sum` aggregations in stage 0, and custom expressions based on these aggregations
  in stage 1.

  These aggregation columns have same `:name`. Field refs, intended for use in stage 1, generated out of those
  columns, are then identified by `:lib/desired-column-alias`. Stage 1 will be using ref
  `[:field <opts> \"sum_2\"]` for the second aggregation.

  Removing the first from the stage 0, will remove clauses refeencing it in further stages. So far so good.

  But removal only is not sufficient -- _with the first aggregation `[:field <opts> \"sum\"]` removed
  the `[:field <opts> \"sum_2\"]` reference became stale_, because stage 0 has now no _returned column_ with
  desired alias \"sum_2\"."
  [query-with-modified-refs previous-stage-number unmodified-query-for-stage]
  (if-let [this-stage-number (lib.util/next-stage-number query-with-modified-refs
                                                         previous-stage-number)]
    (recur (update-stale-references-in-stage query-with-modified-refs
                                             this-stage-number
                                             unmodified-query-for-stage)
           this-stage-number
           unmodified-query-for-stage)
    query-with-modified-refs))

(defn- remove-replace-location
  [query stage-number unmodified-query-for-stage location target-clause remove-replace-fn]
  ;; We may see missing idents during the remove/replace process, so disable the assertions.
  (let [result (lib.util/update-query-stage query stage-number
                                            remove-replace-fn location target-clause)
        target-uuid (lib.options/uuid target-clause)]
    (if (not= query result)
      (lib.util.match/match-lite location
        [:expressions]
        (-> result
            (remove-local-references
             stage-number
             unmodified-query-for-stage
             :expression
             {}
             (lib.util/expression-name target-clause))
            (remove-stage-references stage-number unmodified-query-for-stage target-uuid)
            (update-stale-references stage-number unmodified-query-for-stage))

        [:aggregation]
        (-> result
            (remove-local-references
             stage-number
             unmodified-query-for-stage
             :aggregation
             {}
             target-uuid)
            (remove-stage-references stage-number unmodified-query-for-stage target-uuid)
            (update-stale-references stage-number unmodified-query-for-stage))

        (q :guard (and (vector? q)
                       (or (= q [:breakout])
                           (= q [:fields])
                           (and (= (nth q 0) :joins) (= (nth q 2) :fields) (= (count q) 3)))))
        (-> (remove-stage-references result stage-number unmodified-query-for-stage target-uuid)
            (update-stale-references stage-number unmodified-query-for-stage))

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
                                    (lib.util.match/match-lite-recursive clause
                                      [(op :guard (= op target-op))
                                       (_ :guard #(or (empty? target-opts)
                                                      (set/subset? (set target-opts) (set %))))
                                       (id :guard (= id target-ref-id))] [location clause]))))))
                   (stage-paths query stage-number))
        dead-joins (volatile! (transient []))]
    (as-> query q
      (reduce
       (fn [query [location target-clause]]
         (remove-replace-location
          query stage-number unmodified-query-for-stage location target-clause
          #(try (lib.util/remove-clause %1 %2 %3 stage-number)
                (catch #?(:clj Exception :cljs js/Error) e
                  (let [{:keys [error join]} (ex-data e)]
                    (if (= error :metabase.lib.util/cannot-remove-final-join-condition)
                        ;; Return the stage unchanged, but keep track of the dead joins.
                      (do (vswap! dead-joins conj! join)
                          %1)
                      (throw e)))))))
       q
       to-remove)
      (reduce #(remove-join %1 stage-number %2) q (persistent! @dead-joins)))))

(defn- remove-stage-references
  [query previous-stage-number unmodified-query-for-stage target-uuid]
  (if-let [stage-number (lib.util/next-stage-number unmodified-query-for-stage previous-stage-number)]
    (let [stage (lib.util/query-stage unmodified-query-for-stage stage-number)
          target-ref-id (->> (lib.metadata.calculation/visible-columns unmodified-query-for-stage stage-number stage)
                             (some (fn [{:keys [lib/source lib/source-uuid] :as column}]
                                     (when (and (= :source/previous-stage source) (= target-uuid source-uuid))
                                       (:lib/desired-column-alias column)))))]
      (cond-> query
        ;; We are moving to the next stage, so pass the current query as the unmodified-query-for-stage
        target-ref-id
        (remove-local-references stage-number query :field {} target-ref-id)))
    query))

(defn- find-location
  [query stage-number target-clause]
  (let [stage (lib.util/query-stage query stage-number)]
    (m/find-first
     (fn [possible-location]
       (when-let [clauses (get-in stage possible-location)]
         (let [target-uuid (lib.options/uuid target-clause)]
           (when (some (comp #{target-uuid} :lib/uuid second) clauses)
             possible-location))))
     (stage-paths query stage-number))))

(defn- remove-replace* [query stage-number target-clause remove-or-replace replacement]
  (mu/disable-enforcement
    (let [target-clause (lib.common/->op-arg target-clause)
          location (find-location query stage-number target-clause)
          replace? (= :replace remove-or-replace)
          replacement-clause (when replace?
                               (lib.common/->op-arg replacement))
          remove-replace-fn (if replace?
                              #(lib.util/replace-clause %1 %2 %3 replacement-clause)
                              #(lib.util/remove-clause %1 %2 %3 stage-number))
          changing-breakout? (= [:breakout] location)
          sync-breakout-ordering? (and replace?
                                       changing-breakout?
                                       (= (first target-clause)
                                          (first replacement-clause))
                                       (= (last target-clause)
                                          (last replacement-clause)))
          new-query (cond
                      sync-breakout-ordering?
                      (sync-order-by-options-with-breakout
                       query
                       stage-number
                       target-clause
                       (dissoc (second replacement-clause) :lib/uuid))

                      changing-breakout?
                      (remove-breakout-order-by query stage-number target-clause)

                      :else
                      query)
          new-query (if location
                      (-> new-query
                          (remove-replace-location stage-number new-query location target-clause remove-replace-fn)
                          (normalize-fields-clauses location))
                      new-query)
          new-stage (lib.util/query-stage new-query stage-number)]
      (if (or (not changing-breakout?) (lib.schema.util/distinct-refs? (:breakout new-stage)))
        new-query
        query))))

(mu/defn remove-clause :- ::lib.schema/query
  "Removes the `target-clause` from the stage specified by `stage-number` of `query`.
  If `stage-number` is not specified, the last stage is used."
  ([query :- ::lib.schema/query
    target-clause]
   (remove-clause query -1 target-clause))
  ([query :- ::lib.schema/query
    stage-number :- :int
    target-clause]
   (if (and (map? target-clause) (= (:lib/type target-clause) :mbql/join))
     (remove-join query stage-number target-clause)
     (remove-replace* query stage-number target-clause :remove nil))))

(defn- fresh-ref
  [reference]
  (lib.options/update-options reference assoc :lib/uuid (str (random-uuid))))

(defn- local-replace-expression-references [stage target-ref-id replacement-ref]
  (let [replace-embedded-refs (fn replace-refs [stage]
                                (lib.util.match/replace stage
                                  [:expression _ target-ref-id]
                                  (-> replacement-ref
                                      fresh-ref)))]
    (replace-embedded-refs stage)))

(defn- local-replace-expression
  [stage target replacement]
  (let [replacement-name (or (lib.util/expression-name replacement)
                             (-> replacement lib.options/options :name))
        top-level-replacement (-> replacement
                                  (lib.util/top-level-expression-clause replacement-name)
                                  fresh-ref)
        replaced (update stage :expressions (fn [exprs] (mapv #(if (= % target) top-level-replacement %) exprs)))
        target-name (lib.util/expression-name target)
        replacement-type (-> replacement lib.options/options :effective-type)
        replacement-ref [:expression {:effective-type replacement-type} replacement-name]]
    (local-replace-expression-references replaced target-name replacement-ref)))

(defn- local-replace
  [stage target replacement]
  (->> (if (lib.util/expression-name target)
         (local-replace-expression stage target replacement)
         (walk/postwalk #(if (= % target) replacement %) stage))
       (walk/postwalk #(if (= % (lib.options/uuid target)) (lib.options/uuid replacement) %))))

(defn- returned-columns-at-stage
  [query stage-number]
  (->> (lib.util/query-stage query stage-number)
       (lib.metadata.calculation/returned-columns query stage-number)))

(defn- replaced-columns
  [query stage-number replaced]
  (let [cols (returned-columns-at-stage query stage-number)
        replaced-cols (returned-columns-at-stage replaced stage-number)]
    (->> (map vector cols replaced-cols)
         (filter #(not= (first %) (second %))))))

(defn- next-stage-replacement
  [query next-stage-number [col replaced-col]]
  (let [target-ref-id (:lib/desired-column-alias col)
        replaced-ref (lib.ref/ref (assoc replaced-col :lib/source :source/previous-stage))]
    (map (fn [target-ref] [target-ref (fresh-ref replaced-ref)])
         (lib.util.match/match (lib.util/query-stage query next-stage-number)
           [:field _ target-ref-id] &match))))

(defn- typed-expression
  [query stage-number expression]
  (if (or (-> expression lib.options/options :effective-type)
          (not (lib.expression/expression-clause? expression))
          (not (lib.util/clause? expression)))
    expression
    (let [t (lib.metadata.calculation/type-of query stage-number expression)]
      (lib.options/update-options expression assoc :effective-type t))))

(def ^:private expression-validator (mr/validator ::lib.schema.expression/expression))

(defn- expression-replacement?
  "Returns if `an-expression` and `new-expression` are both expressions."
  [an-expression new-expression]
  (and (expression-validator an-expression)
       (expression-validator new-expression)))

(defn- with-default-name
  [target replacement]
  (let [target-name (lib.util/expression-name target)]
    (cond-> replacement
      (and target-name
           (not (lib.util/expression-name replacement))
           (not (-> replacement lib.options/options :name)))
      (lib.util/top-level-expression-clause target-name))))

(defn- tweak-expression
  "Return `query` with `target` replaced by `replacement` at stage `stage-number`.

  This function can make changes that produce an invalid query. It is expected that the
  caller checks the result and removes invalid parts or uses an other way to make the
  replacement happen."
  [query stage-number target replacement]
  (let [unmodified-query query
        replacement (->> replacement
                         (with-default-name target)
                         (typed-expression query stage-number))]
    (loop [query (lib.util/update-query-stage query stage-number local-replace target replacement)
           stage-number stage-number]
      (if-let [next-stage-number (lib.util/next-stage-number query stage-number)]
        (let [next-replacements (->> (replaced-columns unmodified-query stage-number query)
                                     (mapcat #(next-stage-replacement query next-stage-number %)))]
          (recur (reduce (fn [query [target replacement]]
                           (lib.util/update-query-stage query next-stage-number local-replace target replacement))
                         query
                         next-replacements)
                 next-stage-number))
        query))))

(defn- prefix
  [part whole]
  (when (every? true? (map = part whole))
    part))

(defn- on-stage-path
  "Given a Malli `error` in `query`, return the a path to the erroneous part of the query we can remove
  to fix the problem or nil if there is no such path."
  [query error]
  (let [in (:in error)]
    ;; We can only fix problems in stages.
    (when (= (first in) :stages)
      (let [stage-number (second in)
            path-in-stage (nnext in)]
        ;; The path should point at least to a top level clause in the stage,
        ;; e.g., a specific expression or an order-by clause, and
        ;; it should have a stage-path as its prefix.
        (when-let [p (and (next path-in-stage)
                          (some #(prefix % path-in-stage) (stage-paths query stage-number)))]
          ;; We keep the prefix of `in` that's pointing to a specific element on the stage path.
          ;; 2 accounts for [:stages stage-number] and 1 for the key of the element on the path.
          (subvec in 0 (+ (count p) 2 1)))))))

(defn- conditions-changed-for-aliases?
  "Checks if two sets of join conditions are the same. We ignore the current join-aliases as those may be changing,
   and we ignore effective-type since `tweak-expression` above may have already added it, and in this case it will be irrelevant."
  [new-join-alias new-join-conditions join-alias-b join-conditions-b]
  (let [a-conds (lib.util.match/replace
                  new-join-conditions
                  (_ :guard (every-pred map? (comp #{new-join-alias} :join-alias)))
                  (dissoc &match :join-alias :effective-type)
                  (_ :guard (every-pred map? :effective-type))
                  (dissoc &match :effective-type))
        b-conds (lib.util.match/replace
                  join-conditions-b
                  (_ :guard (every-pred map? (comp #{join-alias-b} :join-alias)))
                  (dissoc &match :join-alias :effective-type)
                  (_ :guard (every-pred map? :effective-type))
                  (dissoc &match :effective-type))]
    (not (lib.equality/= a-conds b-conds))))

(mu/defn- replace-expression-removing-erroneous-parts :- ::lib.schema/query
  [unmodified-query :- ::lib.schema/query
   stage-number     :- :int
   target           :- ::lib.schema.expression/expression
   replacement      :- ::lib.schema.expression/expression]
  (mu/disable-enforcement
    (let [location (find-location unmodified-query stage-number target)
          query (loop [query (tweak-expression unmodified-query stage-number target replacement)]
                  (let [explanation (mr/explain ::lib.schema/query query)
                        error-paths (->> (:errors explanation)
                                         (keep #(on-stage-path query %))
                                         distinct)]
                    (if (seq error-paths)
                      (recur (reduce (fn [q path]
                                       (try
                                         (remove-clause q (second path) (get-in q path))
                                         (catch #?(:clj Exception :cljs js/Error) e
                                           (let [{:keys [error join]} (ex-data e)]
                                             (if (= error :metabase.lib.util/cannot-remove-final-join-condition)
                                               ;; remove the dangling join
                                               (remove-join q (second path) join)
                                               (throw e))))))
                                     query
                                     error-paths))
                      (if explanation
                        ;; there is an error we cannot fix, fall back to old way,
                        ;; i.e., remove all dependent parts
                        (remove-replace* unmodified-query stage-number target :replace replacement)
                        query))))]
      (if (and (= :joins (first location))
               (= :conditions (last location)))
        (let [join-loc (pop location)
              join-idx (peek join-loc)
              join (get (lib.join/joins query stage-number) join-idx)
              old-join (get (lib.join/joins unmodified-query stage-number) join-idx)
              new-name (lib.join/default-alias query stage-number (dissoc join :alias))]
          (if (and (not= new-name (:alias join))
                   (conditions-changed-for-aliases? (:alias join) (:conditions join)
                                                    (:alias old-join) (:conditions old-join)))
            (rename-join query stage-number join new-name)
            query))
        query))))

(declare replace-join)

(mu/defn replace-clause :- ::lib.schema/query
  "Replaces the `target-clause` with `new-clause` in the `query` stage specified by `stage-number`.
  If `stage-number` is not specified, the last stage is used.

  This should perhaps be called `update-clause` or `edit-clause` - semantically it is replacing an existing clause
  with an updated version of itself. For example, changing the name or details of an expression; `SUM(subtotal)`
  changed to `SUM(total)`.

  Of course you can completely change the clause - `Created At by month` into `User->Latitude by 0.1 degrees`, say -
  but the *identity* of the clause is retained. That means the `:ident` of the `target-clause` is always retained,
  even if the `new-clause` has a different one! If you want to drop the old clause and replace it, that's
  [[remove-clause]] plus adding the new one with [[lib.expression/expression]] and similar."
  ([query :- ::lib.schema/query
    target-clause
    new-clause]
   (replace-clause query -1 target-clause new-clause))
  ([query :- ::lib.schema/query
    stage-number :- :int
    target-clause
    new-clause]
   (cond
     (and (map? target-clause) (= (:lib/type target-clause) :mbql/join))
     (replace-join query stage-number target-clause new-clause)

     (expression-replacement? target-clause new-clause)
     (replace-expression-removing-erroneous-parts query stage-number target-clause new-clause)

     :else
     (remove-replace* query stage-number target-clause :replace new-clause))))

(defn- field-clause-with-join-alias?
  [field-clause join-alias]
  (and (lib.util/field-clause? field-clause)
       (= (lib.join.util/current-join-alias field-clause) join-alias)))

(defn- replace-join-alias
  [a-join old-name new-name]
  (lib.util.match/replace a-join
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

(defn- join-spec->index
  [query stage-number join-spec]
  (if (integer? join-spec)
    join-spec
    (let [pred (cond-> #{join-spec}
                 (string? join-spec) (comp :alias))]
      (some (fn [[idx a-join]]
              (when (pred a-join)
                idx))
            (m/indexed (:joins (lib.util/query-stage query stage-number)))))))

(mu/defn rename-join :- ::lib.schema/query
  "Rename the join specified by `join-spec` in `query` at `stage-number` to `new-name`.
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If `stage-number` is not provided, the last stage is used.
  If the specified join cannot be found, then `query` is returned as is.
  If renaming the join to `new-name` would clash with an existing join, a
  suffix is appended to `new-name` to make it unique."
  ([query join-spec new-name]
   (rename-join query -1 join-spec new-name))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    join-spec    :- [:or ::lib.schema.join/join ::lib.schema.join/alias :int]
    new-name     :- ::lib.schema.join/alias]
   (if-let [idx (join-spec->index query stage-number join-spec)]
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

(defn- dependent-join? [join join-alias]
  (or (= (:alias join) join-alias)
      (field-clause-with-join-alias? join join-alias)))

(mu/defn remove-join :- ::lib.schema/query
  "Remove the join specified by `join-spec` in `query` at `stage-number`.
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If `stage-number` is not provided, the last stage is used.
  If the specified join cannot be found, then `query` is returned as is.
  Top level clauses containing references to the removed join are removed too."
  ([query join-spec]
   (remove-join query -1 join-spec))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    join-spec    :- [:or ::lib.schema.join/join :string :int]]
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

(mu/defn replace-join :- ::lib.schema/query
  "Replace the join specified by `join-spec` in `query` at `stage-number` with `new-join`.
  If `new-join` is nil, the join is removed as if by [[remove-join]].
  The join can be specified either by itself (as returned by [[joins]]), by its alias
  or by its index in the list of joins as returned by [[joins]].
  If `stage-number` is not provided, the last stage is used.
  If the specified join cannot be found, then `query` is returned as is.
  Top level clauses containing references to the removed join are removed too."
  ([query join-spec new-join]
   (replace-join query -1 join-spec new-join))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    join-spec    :- [:or ::lib.schema.join/join :string :int]
    new-join]
   (if (nil? new-join)
     (remove-join query stage-number join-spec)
     (update-joins query stage-number join-spec
                   (fn [joins join-alias]
                     (mapv #(if (= (:alias %) join-alias)
                              (let [should-rename? (or (conditions-changed-for-aliases?
                                                        (:alias new-join)
                                                        (:conditions new-join)
                                                        (:alias %)
                                                        (:conditions %))
                                                       (not= (:source-table new-join)
                                                             (:source-table %))
                                                       (not= (:source-card new-join)
                                                             (:source-card %)))]
                                (cond-> new-join
                                  ;; We need to tag the join so that add-default-alias knows to replace this alias
                                  should-rename? (assoc ::lib.join/replace-alias true)))
                              %)
                           joins))))))

(defn- specifies-default-fields? [query stage-number]
  (let [fields (:fields (lib.util/query-stage query stage-number))]
    (and fields
         ;; Quick first check: if there are any implicitly-joined fields, it's not the default list.
         (not (some (comp :source-field lib.options/options) fields))
         (lib.equality/matching-column-sets? query stage-number fields
                                             (lib.metadata.calculation/default-columns-for-stage query stage-number)))))

(defn- normalize-fields-for-join [query stage-number removed-location join]
  (cond
    ;; Nothing to do if it's already a keyword.
    (#{:none :all} (:fields join)) join

    ;; If it's missing, treat it as `:all` unless we just removed a field.
    ;; TODO: This really should be a different function called by `remove-field`; it also needs to filter on the stage.
    (and (or (= removed-location [:aggregation])
             (= removed-location [:breakout]))
         (not (contains? join :fields)))
    (assoc join :fields :all)

    (lib.equality/matching-column-sets?
     query stage-number (:fields join)
     (lib.join/join-fields-to-add-to-parent-stage query stage-number (assoc join :fields :all) nil))
    (assoc join :fields :all)

    :else join))

(defn- normalize-fields-for-stage [query stage-number removed-location]
  (let [stage (lib.util/query-stage query stage-number)]
    (cond-> query
      (specifies-default-fields? query stage-number)
      (lib.util/update-query-stage stage-number dissoc :fields)

      (and (empty? (:aggregation stage))
           (empty? (:breakout stage))
           (:joins stage))
      (lib.util/update-query-stage stage-number update :joins
                                   (partial mapv #(normalize-fields-for-join query stage-number removed-location %))))))

(mu/defn normalize-fields-clauses :- ::lib.schema/query
  "Check all the `:fields` clauses in the query - on the stages and any joins - and drops them if they are equal to the
  defaults.
  - For stages, if the `:fields` list is identical to the default fields for this stage.
  - For joins, replace it with `:all` if it's all the fields that are in the join by default.
  - For joins, remove it if the list is empty (the default for joins is no fields)."
  ([query :- ::lib.schema/query]
   (normalize-fields-clauses query nil))
  ([query            :- ::lib.schema/query
    removed-location :- [:maybe [:sequential :any]]]
   (reduce #(normalize-fields-for-stage %1 %2 removed-location)
           query
           (range (count (:stages query))))))
