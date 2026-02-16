(ns metabase.lib.convert
  (:refer-clojure :exclude [mapv some select-keys not-empty #?(:clj doseq) #?(:clj for)])
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.error :as me]
   [medley.core :as m]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.normalize :as mbql.normalize]
   ^{:clj-kondo/ignore [:discouraged-namespace]} [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.convert.metadata-to-legacy :as lib.convert.metadata-to-legacy]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.unique-name-generator :as lib.util.unique-name-generator]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [mapv some select-keys not-empty #?(:clj doseq) #?(:clj for)]])
  #?@(:cljs [(:require-macros [metabase.lib.convert :refer [with-aggregation-list]])]))

(def ^:private ^:dynamic *pMBQL-uuid->legacy-index*
  {})

(def ^:private ^:dynamic *legacy-index->pMBQL-uuid*
  {})

(defn- clean-location [almost-stage error-type error-location]
  (let [operate-on-parent? #{:malli.core/missing-key :malli.core/end-of-input}
        location (if (operate-on-parent? error-type)
                   (drop-last 2 error-location)
                   (drop-last 1 error-location))
        [location-key] (if (operate-on-parent? error-type)
                         (take-last 2 error-location)
                         (take-last 1 error-location))]
    (if (seq location)
      (update-in almost-stage
                 location
                 (fn [error-loc]
                   (let [result (assoc error-loc location-key nil)]
                     (cond
                       (vector? error-loc) (into [] (remove nil?) result)
                       (map? error-loc) (u/remove-nils result)
                       :else result))))
      (dissoc almost-stage location-key))))

(def ^:private stage-keys
  #{:aggregation :breakout :expressions :fields :filters :order-by :joins})

(defn- clean-stage-schema-errors [almost-stage]
  (binding [lib.schema.expression/*suppress-expression-type-check?* true]
    (loop [almost-stage almost-stage
           removals []]
      (if-let [[error-type error-location] (->> (mr/explain ::lib.schema/stage.mbql almost-stage)
                                                :errors
                                                (filter (comp stage-keys first :in))
                                                (map (juxt :type :in))
                                                first)]
        (let [new-stage  (clean-location almost-stage error-type error-location)
              error-desc (pr-str (or error-type
                                     ;; if `error-type` is missing, which seems to happen sometimes,
                                     ;; fall back to humanizing the entire error.
                                     (me/humanize (mr/explain ::lib.schema/stage.mbql almost-stage))))]
          ;; TODO: Bring this back, for all the idents. We can't enforce this strictly when they're not being added
          ;; by the BE for pre-existing queries.
          #_(when (= (last error-location) :ident)
              (throw (ex-info "Ident error" {:loc error-location
                                             :error-desc error-desc
                                             :diff (first (data/diff almost-stage new-stage))})))
          #?(:cljs (js/console.warn "Clean: Removing bad clause due to error!" error-location error-desc
                                    (u/pprint-to-str (first (data/diff almost-stage new-stage))))
             :clj  (log/warnf "Clean: Removing bad clause in %s due to error %s:\n%s"
                              (u/colorize :yellow (pr-str error-location))
                              (u/colorize :yellow error-desc)
                              (u/colorize :red (u/pprint-to-str (first (data/diff almost-stage new-stage))))))
          (if (= new-stage almost-stage)
            almost-stage
            (recur new-stage (conj removals [error-type error-location]))))
        almost-stage))))

(defn- clean-stage-ref-errors [almost-stage]
  (reduce (fn [almost-stage [loc _]]
            (clean-location almost-stage ::lib.schema/invalid-ref loc))
          almost-stage
          (lib.schema/ref-errors-for-stage almost-stage)))

(defn- clean-stage [almost-stage]
  (-> almost-stage
      clean-stage-schema-errors
      clean-stage-ref-errors))

(def ^:dynamic *clean-query*
  "If true (this is the default), the query is cleaned.
  When converting queries at later stages of the preprocessing pipeline, this cleaning might not be desirable."
  true)

#?(:clj
   (def ^:dynamic *card-clean-hook*
     "Set by [[metabase.lib-be.models.transforms]] to a function which expects to be called like
     `(f pre-cleaning-query post-cleaning-query)`, when [[clean]] makes material changes.

     [[clean]] is expected to be a no-op in general and should not be removing clauses when a query is converted from
     MBQL 4 to 5 on being read from AppDB."
     nil))

(defn without-cleaning
  "Runs the provided function with cleaning of queries disabled.

  This is preferred over directly cleaning the query."
  [f]
  (binding [*clean-query* false]
    (f)))

(defn- clean [almost-query]
  (if-not *clean-query*
    almost-query
    (let [cleaned (loop [almost-query almost-query
                         stage-index 0]
                    (let [current-stage (nth (:stages almost-query) stage-index)
                          new-stage (clean-stage current-stage)]
                      (if (= current-stage new-stage)
                        (if (= stage-index (dec (count (:stages almost-query))))
                          almost-query
                          (recur almost-query (inc stage-index)))
                        (recur (update almost-query :stages assoc stage-index new-stage) stage-index))))]
      #?(:clj
         (when (and *card-clean-hook* (not= almost-query cleaned))
           (*card-clean-hook* almost-query cleaned)))
      cleaned)))

(defmulti ->pMBQL
  "Coerce something to pMBQL (the version of MBQL manipulated by Metabase Lib v2) if it's not already pMBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defn- default-MBQL-clause->pMBQL [[tag & args :as clause]]
  (if (map? (first args))
    ;; already MBQL 5
    clause
    ;; decode from legacy MBQL
    (let [[tag options & args] (case (mbql.s/options-style tag)
                                 ::mbql.s/options-style.none                     (list* tag nil args)
                                 ::mbql.s/options-style.mbql5                    clause
                                 (::mbql.s/options-style.last-always
                                  ::mbql.s/options-style.last-always.snake_case) (list* tag (or (last args) {}) (butlast args))
                                 ::mbql.s/options-style.last-unless-empty        (if (map? (last args))
                                                                                   (list* tag (last args) (butlast args))
                                                                                   (list* tag {} args))
                                 ::mbql.s/options-style.𝕨𝕚𝕝𝕕                     (cond
                                                                                       (> (count args) 2) clause
                                                                                       (map? (last args)) (list* tag (last args) (butlast args))
                                                                                       :else              (list* tag {} args)))]
      (lib.options/ensure-uuid (into [tag options] (map ->pMBQL) args)))))

(defmethod ->pMBQL :default
  [x]
  (if (and (vector? x)
           (keyword? (first x)))
    (default-MBQL-clause->pMBQL x)
    x))

(defmethod ->pMBQL :mbql/query
  [query]
  query)

(def legacy-default-join-alias
  "In legacy MBQL, join `:alias` was optional, and if unspecified, this was the default alias used. In reality all joins
  normally had an explicit `:alias` since the QB would generate one and you generally need one to do useful things
  with the join anyway.

  Since the new pMBQL schema makes `:alias` required, we'll explicitly add the implicit default when we encounter a
  join without an alias, and remove it so we can round-trip without changes."
  "__join")

(defn- deduplicate-join-aliases
  "Join `:alias`es had to be unique in legacy MBQL, but they were optional. Since we add [[legacy-default-join-alias]]
  to each join that doesn't have an explicit `:alias` for pMBQL compatibility now, we need to deduplicate the aliases
  if it is used more than once.

  Only deduplicate the default `__join` aliases; we don't want the [[lib.util/unique-name-generator]] to touch other
  aliases and truncate them or anything like that."
  [joins]
  (let [unique-name-fn (lib.util.unique-name-generator/unique-name-generator)]
    (mapv (fn [join]
            (cond-> join
              (= (:alias join) legacy-default-join-alias) (update :alias unique-name-fn)))
          joins)))

(defn- stage-source-card-id->pMBQL
  "If a query `stage` has a legacy `card__<id>` `:source-table`, convert it to a pMBQL-style `:source-card`."
  [stage]
  (if (string? (:source-table stage))
    (-> stage
        (assoc :source-card (lib.util/legacy-string-table-id->card-id (:source-table stage)))
        (dissoc :source-table))
    stage))

(defn do-with-aggregation-list
  "Impl for [[with-aggregation-list]]."
  [aggregations thunk]
  (let [legacy->pMBQL (into {}
                            (map-indexed (fn [idx [_tag {ag-uuid :lib/uuid}]]
                                           [idx ag-uuid]))
                            aggregations)
        pMBQL->legacy (set/map-invert legacy->pMBQL)]
    (binding [*legacy-index->pMBQL-uuid* legacy->pMBQL
              *pMBQL-uuid->legacy-index* pMBQL->legacy]
      (thunk))))

#?(:clj
   (defmacro with-aggregation-list
     "Macro for capturing the context of a query stage's `:aggregation` list, so any legacy `[:aggregation 0]` indexed
     refs can be converted correctly to UUID-based pMBQL refs."
     [aggregations & body]
     `(do-with-aggregation-list ~aggregations (fn [] ~@body))))

(defn- index-ref-clauses->pMBQL [clauses]
  (letfn [(pass [state]
            (reduce (fn [{:keys [index index->uuid converted] :as state} clause]
                      (-> (if (get converted index)
                            state
                            (try
                              (let [pMBQL (binding [*legacy-index->pMBQL-uuid* index->uuid]
                                            (->pMBQL clause))]
                                (-> state
                                    (update :index->uuid assoc index (lib.options/uuid pMBQL))
                                    (update :converted assoc index pMBQL)))
                              (catch #?(:cljs js/Error :clj clojure.lang.ExceptionInfo) e
                                (if (= (-> e ex-data :error) ::legacy-index->pMBQL-uuid-missing)
                                  state
                                  (throw e)))))
                          (update :index inc)))
                    (assoc state :index 0)
                    clauses))]
    (loop [state {:index->uuid {}, :converted (vec (repeat (count clauses) nil))}]
      (let [{:keys [index->uuid converted] :as state'} (pass state)]
        (cond
          (= (count index->uuid) (count clauses)) converted
          (= converted (:converted state))        (throw (ex-info "Couldn't index clauses" {:clauses clauses}))
          :else                                   (recur state'))))))

(defn- add-source-uuids-to-cols
  "`cols` with `:source/aggregations` and `:source/expressions` should have `:lib/source-uuid`, since it's sorta
  important for matching purposes. Add them to attached `:lib/stage-metadata` when converting from legacy MBQL to MBQL 5."
  [cols expressions]
  (try
    (loop [acc [], aggregation-index 0, [col & more] cols]
      (cond
        (not col)
        acc

        (= (:lib/source col) :source/aggregations)
        (let [ag-uuid (or (get *legacy-index->pMBQL-uuid* aggregation-index)
                          (throw (ex-info (str "Missing UUID for aggregation at index " aggregation-index)
                                          {:legacy-index->pMBQL-uuid *legacy-index->pMBQL-uuid*
                                           :aggregation-index        aggregation-index})))
              col'    (assoc col :lib/source-uuid ag-uuid)]
          (recur (conj acc col') (inc aggregation-index) more))

        (= (:lib/source col) :source/expressions)
        (let [expression-name (or (:lib/expression-name col)
                                  (throw (ex-info "Column with :source/expressions is missing :lib/expression-name"
                                                  {:col col})))
              expression      (or (m/find-first #(= (:lib/expression-name (lib.options/options %)) expression-name)
                                                expressions)
                                  (throw (ex-info (str "Failed to find expression with name " (pr-str expression-name))
                                                  {:expression-name expression-name, :expressions expressions})))
              col'            (assoc col :lib/source-uuid (lib.options/uuid expression))]
          (recur (conj acc col') aggregation-index more))

        :else
        (recur (conj acc col) aggregation-index more)))
    (catch #?(:clj Throwable :cljs :default) e
      (log/error e "Error adding :lib/source-uuid to cols")
      cols)))

(defmethod ->pMBQL :mbql.stage/mbql
  [stage]
  (let [stage       (m/update-existing stage :aggregation index-ref-clauses->pMBQL)
        expressions (->> stage
                         :expressions
                         (mapv (fn [[k v]]
                                 (-> v
                                     ->pMBQL
                                     (lib.util/top-level-expression-clause k))))
                         not-empty)]
    (metabase.lib.convert/with-aggregation-list (:aggregation stage)
      (let [stage (-> stage
                      stage-source-card-id->pMBQL
                      (m/assoc-some :expressions expressions))
            stage (reduce
                   (fn [stage k]
                     (if-not (get stage k)
                       stage
                       (update stage k ->pMBQL)))
                   stage
                   (disj stage-keys :expressions :aggregation))]
        (cond-> stage
          (:joins stage)              (update :joins deduplicate-join-aliases)
          (:lib/stage-metadata stage) (update-in [:lib/stage-metadata :columns] add-source-uuids-to-cols expressions))))))

(defmethod ->pMBQL :mbql.stage/native
  [stage]
  (m/update-existing stage :template-tags update-vals (fn [tag] (m/update-existing tag :dimension ->pMBQL))))

(defmethod ->pMBQL :mbql/join
  [join]
  (let [join (-> join
                 (update :conditions ->pMBQL)
                 (update :stages ->pMBQL))]
    (cond-> join
      (:fields join) (update :fields (fn [fields]
                                       (if (sequential? fields)
                                         (mapv ->pMBQL fields)
                                         (keyword fields))))
      (not (:alias join)) (assoc :alias legacy-default-join-alias)
      ;; MBQL 5 does not support `:parameters` at the top level of a join, so move them to the join's first stage.
      ;;
      ;; TODO (Cam 8/8/25) -- this is not really a 100% correct transformation, parameters that specify
      ;; `:stage-number` should get moved to the corresponding stage. (The first stage is the default tho so this is
      ;; correct if `:stage-number` is unspecified.) We do this in the QP
      ;; in [[metabase.query-processor.middleware.parameters/move-top-level-params-to-stage*]].
      ;;
      ;; IRL parameters are never actually attached to joins at all, and the only reason we're even pretending
      ;; to "support them" (in air quotes) even this much is because we had a few tests that act like this is ok and I
      ;; don't want to fix them. But we don't really need to be serious about actually supporting this.
      (:parameters join) (-> (update-in [:stages 0 :parameters] #(into (vec %) (:parameters join)))
                             (dissoc :parameters)))))

(defmethod ->pMBQL :dispatch-type/sequential
  [xs]
  (mapv ->pMBQL xs))

(defmethod ->pMBQL :dispatch-type/map
  [m]
  (if (:type m)
    (-> (lib.util/pipeline m)
        (update :stages (fn [stages]
                          (mapv ->pMBQL stages)))
        lib.normalize/normalize
        (assoc :lib.convert/converted? true)
        clean)
    (update-vals m ->pMBQL)))

(defmethod ->pMBQL :field
  [[_tag x y]]
  (let [[id-or-name options] (if (map? x)
                               [y x]
                               [x y])]
    (lib.options/ensure-uuid [:field options id-or-name])))

(defmethod ->pMBQL :value
  [[_tag value opts]]
  ;; `:value` uses `:snake_case` keys in legacy MBQL (this was to match the shape of the keys in Field metadata), at
  ;; least for the three type keys enumerated below. See [[metabase.legacy-mbql.schema/ValueTypeInfo]].
  (let [opts (set/rename-keys opts {:base_type     :base-type
                                    :semantic_type :semantic-type
                                    :database_type :database-type})
        ;; in pMBQL, `:effective-type` is a required key for `:value`. `:value` SHOULD have always had `:base-type`,
        ;; but on the off chance it did not, get the type from value so the schema doesn't fail entirely.
        opts (assoc opts :effective-type (or (:effective-type opts)
                                             (:base-type opts)
                                             ;; [[lib.schema.expression/type-of]] can return a set of types in some
                                             ;; cases, e.g. #{:type/Text :type/Date} for date literals. Since
                                             ;; `:effective-type` can be just one value, prefer string, numeric, and
                                             ;; boolean types over others.
                                             (let [types (lib.schema.expression/type-of value)]
                                               (if (set? types)
                                                 (or (m/find-first (fn [t] (some #(isa? t %) [:type/Text :type/Number :type/Boolean])) types)
                                                     (first types))
                                                 types))))]
    (lib.options/ensure-uuid [:value opts value])))

(doseq [tag [:case :if]]
  (defmethod ->pMBQL tag
    [[_tag pred-expr-pairs options]]
    (let [default (:default options)]
      (cond-> [tag (dissoc options :default) (mapv ->pMBQL pred-expr-pairs)]
        :always lib.options/ensure-uuid
        (some? default) (conj (->pMBQL default))))))

(defmethod ->pMBQL :expression
  [[tag value opts]]
  (lib.options/ensure-uuid [tag opts value]))

(defn- get-or-throw!
  [m k]
  (let [result (get m k ::not-found)]
    (if-not (= result ::not-found)
      result
      (throw (ex-info (str "Unable to find key " (pr-str k) " in map.")
                      {:m m
                       :k k})))))

(defmethod ->pMBQL :aggregation
  [[tag aggregation-index opts, :as clause]]
  (lib.options/ensure-uuid
   [tag opts (or (get *legacy-index->pMBQL-uuid* aggregation-index)
                 (throw (ex-info (str "Error converting :aggregation reference: no aggregation at index "
                                      aggregation-index)
                                 {:clause clause
                                  :error ::legacy-index->pMBQL-uuid-missing})))]))

(defmethod ->pMBQL :aggregation-options
  [[_tag aggregation options]]
  (let [[tag opts & args] (->pMBQL aggregation)]
    (into [tag (merge opts options)] args)))

(defmethod ->pMBQL :datetime
  [[_tag value options]]
  (lib.options/ensure-uuid [:datetime (or options {}) (->pMBQL value)]))

(defmethod ->pMBQL :time-interval
  [[_tag field n unit options]]
  (lib.options/ensure-uuid [:time-interval (or options {}) (->pMBQL field) n unit]))

(defmethod ->pMBQL :relative-time-interval
  [[_tag & [_column _value _bucket _offset-value _offset-bucket :as args]]]
  (lib.options/ensure-uuid (into [:relative-time-interval {}] (map ->pMBQL) args)))

(defmethod ->pMBQL :relative-datetime
  [[_tag n unit]]
  (let [normalized-unit (cond-> unit (string? unit) keyword)]
    (lib.options/ensure-uuid
     (if normalized-unit
       [:relative-datetime {} n normalized-unit]
       [:relative-datetime {} n]))))

;; `:offset` is the same in legacy and pMBQL, but we need to update the expr it wraps.
(defmethod ->pMBQL :offset
  [[tag opts expr n, :as clause]]
  {:pre [(= (count clause) 4)]}
  [tag opts (->pMBQL expr) n])

;; These four expressions have a different form depending on the number of arguments.
(doseq [tag [:contains :starts-with :ends-with :does-not-contain]]
  (lib.hierarchy/derive tag ::string-comparison))

(defmethod ->pMBQL ::string-comparison
  [[tag opts & args :as clause]]
  (if (> (count args) 2)
    ;; Multi-arg, pMBQL style: [tag {opts...} x y z ...]
    (lib.options/ensure-uuid (into [tag opts] (map ->pMBQL args)))
    ;; Two-arg, legacy style: [tag x y] or [tag x y opts].
    (let [[tag x y opts] clause]
      (lib.options/ensure-uuid [tag (or opts {}) (->pMBQL x) (->pMBQL y)]))))

(defn legacy-query-from-inner-query
  "Convert a legacy 'inner query' to a full legacy 'outer query' so you can pass it to stuff
  like [[metabase.legacy-mbql.normalize/normalize]], and then probably to [[->pMBQL]]."
  [database-id inner-query]
  (merge {:database database-id, :type :query}
         (if (:native inner-query)
           {:native (set/rename-keys inner-query {:native :query})}
           {:query inner-query})))

(defmulti ->legacy-MBQL
  "Coerce something to legacy MBQL (the version of MBQL understood by the query processor and Metabase Lib v1) if it's
  not already legacy MBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defn- metabase-lib-keyword?
  "Does keyword `k` have a`:lib/`, `:lib.columns/` or a `:metabase.lib.*/` namespace?"
  [k]
  (and (qualified-keyword? k)
       (when-let [symb-namespace (namespace k)]
         (or (= symb-namespace "lib")
             (= symb-namespace "lib.columns")
             (str/starts-with? symb-namespace "metabase.lib.")))))

(defn- disqualify
  "Remove any keys starting with the `:lib/` or `:metabase.lib.*/` namespaces from map `m`.

  No args = return transducer to remove keys from a map. One arg = update a map `m`."
  ([]
   (remove (fn [[k _v]]
             (metabase-lib-keyword? k))))
  ([m]
   (into {} (disqualify) m)))

(mu/defn- options->legacy-MBQL :- [:maybe [:map {:min 1}]]
  "Convert an options map in an MBQL clause to the equivalent shape for legacy MBQL. Remove `:lib/*` keys and
  `:effective-type`, which is not used in options maps in legacy MBQL."
  [m :- [:maybe :map]]
  (->> (cond-> m
         ;; Following construct ensures that transformation mbql -> pmbql -> mbql, does not add base-type where those
         ;; were not present originally. Base types are added in [[metabase.lib.query/add-types-to-fields]].
         (:metabase.lib.query/transformation-added-base-type m)
         (dissoc :metabase.lib.query/transformation-added-base-type :base-type))
       (into {} (comp (disqualify)
                      ;; remove `:effective-type` if `:base-type` is not present OR if it's the same as `:base-type`.
                      (remove (let [keys-to-remove (if (or (nil? (:base-type m))
                                                           (= (:effective-type m) (:base-type m)))
                                                     #{:effective-type :ident}
                                                     #{:ident})]
                                (fn [[k _v]]
                                  (keys-to-remove k))))))
       not-empty))

(defmulti ^:private aggregation->legacy-MBQL
  {:arglists '([aggregation-clause])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defmethod aggregation->legacy-MBQL :default
  [[tag options & args]]
  (let [inner (into [tag] (map ->legacy-MBQL) args)
        ;; the default value of the :case or :if expression is in the options
        ;; in legacy MBQL
        inner (if (and (#{:case :if} tag) (next args))
                (conj (pop inner) {:default (peek inner)})
                inner)]
    (if-let [aggregation-opts (not-empty (options->legacy-MBQL options))]
      [:aggregation-options inner aggregation-opts]
      inner)))

(defmethod aggregation->legacy-MBQL :aggregation
  [clause]
  (->legacy-MBQL clause))

(defmethod aggregation->legacy-MBQL :offset
  [clause]
  (->legacy-MBQL clause))

(defn- clause-with-options->legacy-MBQL
  [[tag & args :as clause]]
  (if-not ((some-fn nil? map?) (first args))
    ;; probably something like `:dimension` which is not a 'real' MBQL clause
    clause
    (let [[options & args] args
          args             (map ->legacy-MBQL args)]
      (loop [style (mbql.s/options-style tag), options options]
        (case style
          ::mbql.s/options-style.none                   (into [tag] args)
          ::mbql.s/options-style.mbql5                  (into [tag (or options {})] args)
          ::mbql.s/options-style.last-always            (-> (into [tag] args)
                                                            (conj (not-empty (options->legacy-MBQL options))))
          ::mbql.s/options-style.last-always.snake_case (recur ::mbql.s/options-style.last-always
                                                               (into (empty options)
                                                                     (map (fn [[k v]]
                                                                            [(cond-> k
                                                                               (simple-keyword? k) u/->snake_case_en)
                                                                             v]))
                                                                     (options->legacy-MBQL options)))
          ::mbql.s/options-style.last-unless-empty      (let [options (options->legacy-MBQL options)]
                                                          (cond-> (into [tag] args)
                                                            (seq options)
                                                            (conj options)))
          ::mbql.s/options-style.𝕨𝕚𝕝𝕕                   (if (> (count args) 2)
                                                              (recur ::mbql.s/options-style.mbql5 (options->legacy-MBQL options))
                                                              (recur ::mbql.s/options-style.last-unless-empty options)))))))

(defmethod ->legacy-MBQL :default
  [x]
  (cond
    (and (vector? x)
         (keyword? (first x))) (clause-with-options->legacy-MBQL x)
    (map? x)                   (-> x
                                   disqualify
                                   (update-vals ->legacy-MBQL))
    :else x))

(doseq [tag [::aggregation ::expression]]
  (lib.hierarchy/derive tag ::aggregation-or-expression))

(doseq [tag [:count :avg :count-where :distinct :distinct-where
             :max :median :min :percentile
             :share :stddev :sum :sum-where
             :cum-sum :cum-count]]
  (lib.hierarchy/derive tag ::aggregation))

(doseq [tag [:+ :- :* :/
             :case :if :coalesce
             :abs :log :exp :sqrt :ceil :floor :round :power :interval
             :relative-datetime :time :absolute-datetime :now :convert-timezone
             :get-week :get-year :get-month :get-day :get-hour
             :get-minute :get-second :get-quarter
             :datetime-add :datetime-subtract :date
             :concat :substring :replace :regex-match-first :split-part :collate
             :length :trim :ltrim :rtrim :upper :lower :text :integer :today]]
  (lib.hierarchy/derive tag ::expression))

;; TODO: aggregation->legacy-MBQL can wrap things in :aggregation-options which only makes sense for aggregations, so
;; why should expression go through that as well?
(defmethod ->legacy-MBQL ::aggregation-or-expression
  [input]
  (aggregation->legacy-MBQL input))

;;; TODO (Cam 7/29/25) -- consider moving into [[lib.convert.metadata-to-legacy]]
(defn- stage-metadata->legacy-metadata [stage-metadata]
  (mapv lib.convert.metadata-to-legacy/lib-metadata-column->legacy-metadata-column
        (:columns stage-metadata)))

(mu/defn- chain-stages
  ([m]
   (chain-stages m nil))

  ([{:keys [stages]}                                       :- [:map [:stages [:sequential :map]]]
    {:keys [top-level?], :or {top-level? true}, :as _opts} :- [:maybe
                                                               [:map
                                                                [:top-level? [:maybe :boolean]]]]]
   ;; :source-metadata aka :lib/stage-metadata is handled differently in the two formats.
   ;; In legacy, an inner query might have both :source-query, and :source-metadata giving the metadata for that nested
   ;; :source-query.
   ;; In pMBQL, the :lib/stage-metadata is attached to the same stage it applies to.
   ;; So when chaining pMBQL stages back into legacy form, if stage n has :lib/stage-metadata, stage n+1 needs
   ;; :source-metadata attached.
   (let [inner-query (first (reduce (fn [[inner stage-metadata] stage]
                                      [(cond-> (->legacy-MBQL stage)
                                         inner          (assoc :source-query inner)
                                         stage-metadata (assoc :source-metadata (stage-metadata->legacy-metadata stage-metadata)))
                                       ;; Get the :lib/stage-metadata off the original pMBQL stage, not the converted one.
                                       (:lib/stage-metadata stage)])
                                    nil
                                    stages))]
     (cond-> inner-query
       ;; If this is a native query, inner query will be used like:
       ;;
       ;;    {:type :native :native #_inner-query {:query ...}}
       ;;
       ;; only applies to the top level!
       (and top-level? (:native inner-query)) (set/rename-keys {:native :query})))))

(defmethod ->legacy-MBQL :dispatch-type/map [m]
  (if (and (:database m)
           (#{:query :native} (:type m)))
    ;; already a legacy query
    m
    (into {}
          (comp (disqualify)
                (map (fn [[k v]]
                       [k (->legacy-MBQL v)])))
          m)))

(defmethod ->legacy-MBQL :aggregation [[_ opts agg-uuid :as ag]]
  (if (map? opts)
    (try
      (let [opts     (options->legacy-MBQL opts)
            base-agg [:aggregation (get-or-throw! *pMBQL-uuid->legacy-index* agg-uuid)]]
        (if (seq opts)
          (conj base-agg opts)
          base-agg))
      (catch #?(:clj Throwable :cljs :default) e
        (throw (ex-info (lib.util/format "Error converting aggregation reference to pMBQL: %s" (ex-message e))
                        {:ref ag}
                        e))))
    ;; Our conversion is a bit too aggressive and we're hitting legacy refs like [:aggregation 0] inside
    ;; source_metadata that are only used for legacy and thus can be ignored
    ag))

(defmethod ->legacy-MBQL :dispatch-type/sequential [xs]
  (mapv ->legacy-MBQL xs))

(defmethod ->legacy-MBQL :field [[_ opts id]]
  ;; Fields are not like the normal clauses - they need that options field even if it's null.
  ;; TODO: Sometimes the given field is in the legacy order - that seems wrong.
  (let [[opts id]        (if ((some-fn nil? map?) opts)
                           [opts id]
                           [id opts])
        ensure-base-type (fn [[tag field-name legacy-opts, :as _legacy-ref]]
                           [tag field-name (merge (select-keys opts [:base-type]) legacy-opts)])
        legacy-ref       (clause-with-options->legacy-MBQL [:field opts id])]
    (cond-> legacy-ref
      (string? id) ensure-base-type)))

(defn- update-list->legacy-boolean-expression
  [m pMBQL-key legacy-key]
  (cond-> m
    (= (count (get m pMBQL-key)) 1) (m/update-existing pMBQL-key (comp ->legacy-MBQL first))
    (> (count (get m pMBQL-key)) 1) (m/update-existing pMBQL-key #(into [:and] (map ->legacy-MBQL) %))
    :always (set/rename-keys {pMBQL-key legacy-key})))

(defmethod ->legacy-MBQL :mbql/join [join]
  (let [base     (cond-> (disqualify join)
                   (and *clean-query*
                        (:alias join)
                        (str/starts-with? (:alias join) legacy-default-join-alias)
                        ;; added by [[metabase.query-processor.middleware.resolve-joins]]
                        (not (:qp/keep-default-join-alias join)))
                   (dissoc :alias))
        metadata (:lib/stage-metadata (last (:stages join)))]
    (merge (-> base
               (dissoc :stages :conditions)
               (update-vals ->legacy-MBQL))
           (-> base
               (select-keys [:conditions])
               (update-list->legacy-boolean-expression :conditions :condition))
           (when (seq (:columns metadata))
             {:source-metadata (stage-metadata->legacy-metadata metadata)})
           (let [inner-query (chain-stages
                              (dissoc base :fields :conditions)
                              {:top-level? false})]
             ;; if [[chain-stages]] returns any additional keys like `:filter` at the top-level then we need to wrap
             ;; it all in `:source-query` (QUE-1566, QUE-1603)
             (if (seq (set/difference (set (keys inner-query)) #{:source-table :source-query :source-metadata}))
               {:source-query inner-query}
               inner-query)))))

(defn- source-card->legacy-source-table
  "If a pMBQL query stage has `:source-card` convert it to legacy-style `:source-table \"card__<id>\"`."
  [stage]
  (if-let [source-card-id (:source-card stage)]
    (-> stage
        (dissoc :source-card)
        (assoc :source-table (str "card__" source-card-id)))
    stage))

(defn- stage-expressions->legacy-MBQL [expressions]
  (into {}
        (for [expression expressions
              :let [legacy-clause (->legacy-MBQL expression)]]
          [(lib.util/expression-name expression)
           ;; there's no way to add an options map to arbitrary clauses like `[:abs ...]` in legacy in `:expressions`
           ;; -- in `:aggregation` we can wrap it in `:aggregation-options` but this is not allowed here. We'll just
           ;; have to toss the extra info.
           (if (#{:aggregation-options} (first legacy-clause))
             (second legacy-clause)
             legacy-clause)])))

(defmethod ->legacy-MBQL :mbql.stage/mbql
  [stage]
  (metabase.lib.convert/with-aggregation-list (:aggregation stage)
    (reduce #(m/update-existing %1 %2 ->legacy-MBQL)
            (-> stage
                disqualify
                source-card->legacy-source-table
                (m/update-existing :aggregation #(mapv aggregation->legacy-MBQL %))
                (m/update-existing :breakout #(mapv ->legacy-MBQL %))
                (m/update-existing :expressions stage-expressions->legacy-MBQL)
                (update-list->legacy-boolean-expression :filters :filter))
            (disj stage-keys :aggregation :breakout :filters :expressions))))

(defmethod ->legacy-MBQL :mbql.stage/native [stage]
  (-> stage
      disqualify
      (update-vals ->legacy-MBQL)
      ;; a native stage becomes
      ;;
      ;;    {:native "SELECT ..."}
      ;;
      ;; IF it is used as a source query. If it's a top-level inner query it's
      ;;
      ;;    {:database 1, :type :native, :native {:query "SELECT ..."}}
      (set/rename-keys {:query :native})))

(defmethod ->legacy-MBQL :mbql/query [query]
  (try
    (let [base        (merge (disqualify (dissoc query :info))
                             (select-keys query [:info]))
          parameters  (:parameters base)
          inner-query (chain-stages base)
          query-type  (if (-> query :stages last :lib/type (= :mbql.stage/native))
                        :native
                        :query)]
      (merge (dissoc base :stages :parameters :lib.convert/converted?)
             (cond-> {:type query-type}
               (seq inner-query) (assoc query-type inner-query)
               (seq parameters)  (assoc :parameters parameters))))
    (catch #?(:clj Throwable :cljs :default) e
      (throw (ex-info (lib.util/format "Error converting MLv2 query to legacy query: %s" (ex-message e))
                      {:query query}
                      e)))))

;; TODO: Look into whether this function can be refactored away - it's called from several places but I (Braden) think
;; legacy refs shouldn't make it out of `lib.js`.
(mu/defn legacy-ref->pMBQL :- ::lib.schema.ref/ref
  "Convert a legacy MBQL `:field`/`:aggregation`/`:expression` reference to pMBQL. Normalizes the reference if needed,
  and handles JS -> Clj conversion as needed."
  ([query legacy-ref]
   (legacy-ref->pMBQL query -1 legacy-ref))

  ([query        :- ::lib.schema/query
    stage-number :- :int
    legacy-ref   :- some?]
   (let [legacy-ref                  (->> #?(:clj legacy-ref :cljs (js->clj legacy-ref :keywordize-keys true))
                                          #_{:clj-kondo/ignore [:deprecated-var]}
                                          mbql.normalize/normalize-field-ref)
         {aggregations :aggregation} (lib.util/query-stage query stage-number)]
     (with-aggregation-list aggregations
       (try
         (->pMBQL legacy-ref)
         (catch #?(:clj Throwable :cljs :default) e
           (throw (ex-info (lib.util/format "Error converting legacy ref to pMBQL: %s" (ex-message e))
                           {:query                    query
                            :stage-number             stage-number
                            :legacy-ref               legacy-ref
                            :legacy-index->pMBQL-uuid *legacy-index->pMBQL-uuid*}
                           e))))))))

(defn- from-json [query-fragment]
  #?(:cljs (if (object? query-fragment)
             (js->clj query-fragment :keywordize-keys true)
             query-fragment)
     :clj  query-fragment))

(defn js-legacy-query->pMBQL
  "Given a JSON-formatted legacy MBQL query, transform it to pMBQL.

  If you have only the inner query map (`{:source-table 2 ...}` or similar), call [[js-legacy-inner-query->pMBQL]]
  instead."
  [query-map]
  (let [clj-map (from-json query-map)]
    (if (= (:lib/type clj-map) "mbql/query")
      (lib.normalize/normalize clj-map)
      (-> clj-map (u/assoc-default :type :query) mbql.normalize/normalize ->pMBQL))))

(defn js-legacy-inner-query->pMBQL
  "Given a JSON-formatted *inner* query, transform it to pMBQL.

  If you have a complete legacy query (`{:type :query, :query {...}}` or similar), call [[js-legacy-query->pMBQL]]
  instead."
  [inner-query]
  (js-legacy-query->pMBQL {:type  :query
                           :query (from-json inner-query)}))
