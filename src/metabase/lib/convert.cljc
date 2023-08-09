(ns metabase.lib.convert
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [clojure.string :as str]
   [malli.core :as mc]
   [malli.error :as me]
   [medley.core :as m]
   [metabase.lib.dispatch :as lib.dispatch]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.util :as lib.util]
   [metabase.util :as u]
   [metabase.util.log :as log]))

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
  (loop [almost-stage almost-stage
         removals []]
    (if-let [[error-type error-location] (->> (mc/explain ::lib.schema/stage.mbql almost-stage)
                                              :errors
                                              (filter (comp stage-keys first :in))
                                              (map (juxt :type :in))
                                              first)]
      (let [new-stage (clean-location almost-stage error-type error-location)]
        (log/warnf "Clean: Removing bad clause in %s due to error %s:\n%s"
                   (u/colorize :yellow (pr-str error-location))
                   (u/colorize :yellow (pr-str (or error-type
                                                   ;; if `error-type` is missing, which seems to happen sometimes,
                                                   ;; fall back to humanizing the entire error.
                                                   (me/humanize (mc/explain ::lib.schema/stage.mbql almost-stage)))))
                   (u/colorize :red (u/pprint-to-str (first (data/diff almost-stage new-stage)))))
        (if (= new-stage almost-stage)
          almost-stage
          (recur new-stage (conj removals [error-type error-location]))))
      almost-stage)))

(defn- clean-stage-ref-errors [almost-stage]
  (reduce (fn [almost-stage [loc _]]
              (clean-location almost-stage ::lib.schema/invalid-ref loc))
          almost-stage
          (lib.schema/ref-errors-for-stage almost-stage)))

(defn- clean-stage [almost-stage]
  (-> almost-stage
      clean-stage-schema-errors
      clean-stage-ref-errors))

(defn- clean [almost-query]
  (loop [almost-query almost-query
         stage-index 0]
    (let [current-stage (nth (:stages almost-query) stage-index)
          new-stage (clean-stage current-stage)]
      (if (= current-stage new-stage)
        (if (= stage-index (dec (count (:stages almost-query))))
          almost-query
          (recur almost-query (inc stage-index)))
        (recur (update almost-query :stages assoc stage-index new-stage) stage-index)))))

(defmulti ->pMBQL
  "Coerce something to pMBQL (the version of MBQL manipulated by Metabase Lib v2) if it's not already pMBQL."
  {:arglists '([x])}
  lib.dispatch/dispatch-value
  :hierarchy lib.hierarchy/hierarchy)

(defn- default-MBQL-clause->pMBQL [mbql-clause]
  (let [last-elem (peek mbql-clause)
        last-elem-option? (map? last-elem)
        [clause-type & args] (cond-> mbql-clause
                               last-elem-option? pop)
        options (if last-elem-option?
                  last-elem
                  {})]
    (lib.options/ensure-uuid (into [clause-type options] (map ->pMBQL) args))))

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
  (let [unique-name-fn (lib.util/unique-name-generator)]
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

(defmethod ->pMBQL :mbql.stage/mbql
  [stage]
  (let [aggregations (->pMBQL (:aggregation stage))
        expressions  (->> stage
                          :expressions
                          (mapv (fn [[k v]]
                                  (-> v
                                      ->pMBQL
                                      (lib.util/named-expression-clause k))))
                          not-empty)]
    (binding [*legacy-index->pMBQL-uuid* (into {}
                                               (map-indexed (fn [idx [_tag {ag-uuid :lib/uuid}]]
                                                              [idx ag-uuid]))
                                               aggregations)]
      (let [stage (-> stage
                      stage-source-card-id->pMBQL
                      (m/assoc-some :aggregation aggregations :expressions expressions))
            stage (reduce
                   (fn [stage k]
                     (if-not (get stage k)
                       stage
                       (update stage k ->pMBQL)))
                   stage
                   (disj stage-keys :aggregation :expressions))]
        (cond-> stage
          (:joins stage) (update :joins deduplicate-join-aliases))))))

(defmethod ->pMBQL :mbql/join
  [join]
  (let [join (-> join
                 (update :conditions ->pMBQL)
                 (update :stages ->pMBQL))]
    (cond-> join
      (:fields join) (update :fields (fn [fields]
                                       (if (seqable? fields)
                                         (mapv ->pMBQL fields)
                                         (keyword fields))))
      (not (:alias join)) (assoc :alias legacy-default-join-alias))))

(defmethod ->pMBQL :dispatch-type/sequential
  [xs]
  (mapv ->pMBQL xs))

(defmethod ->pMBQL :dispatch-type/map
  [m]
  (if (:type m)
    (-> (lib.util/pipeline m)
        (update :stages (fn [stages]
                          (mapv ->pMBQL stages)))
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
  ;; `:value` uses `:snake_case` keys in legacy MBQL for some insane reason (actually this was to match the shape of
  ;; the keys in Field metadata), at least for the three type keys enumerated below.
  ;; See [[metabase.mbql.schema/ValueTypeInfo]].
  (let [opts (set/rename-keys opts {:base_type     :base-type
                                    :semantic_type :semantic-type
                                    :database_type :database-type})
        ;; in pMBQL, `:effective-type` is a required key for `:value`. `:value` SHOULD have always had `:base-type`,
        ;; but on the off chance it did not, get the type from value so the schema doesn't fail entirely.
        opts (assoc opts :effective-type (or (:effective-type opts)
                                             (:base-type opts)
                                             (lib.schema.expression/type-of value)))]
    (lib.options/ensure-uuid [:value opts value])))

(defmethod ->pMBQL :case
  [[_tag pred-expr-pairs options]]
  (let [default (:default options)]
    (cond-> [:case (dissoc options :default) (mapv ->pMBQL pred-expr-pairs)]
      :always lib.options/ensure-uuid
      (some? default) (conj (->pMBQL default)))))

(defmethod ->pMBQL :expression
  [[tag value opts]]
  (lib.options/ensure-uuid [tag opts value]))

(defn- get-or-throw!
  [m k]
  (let [result (get m k ::not-found)]
    (if-not (= result ::not-found)
      result
      (throw (ex-info (str "Unable to find " (pr-str k) " in map.")
                      {:m m
                       :k k})))))

(defmethod ->pMBQL :aggregation
  [[tag value opts]]
  (lib.options/ensure-uuid [tag opts (get-or-throw! *legacy-index->pMBQL-uuid* value)]))

(defmethod ->pMBQL :aggregation-options
  [[_tag aggregation options]]
  (let [[tag opts & args] (->pMBQL aggregation)]
    (into [tag (merge opts options)] args)))

(defn legacy-query-from-inner-query
  "Convert a legacy 'inner query' to a full legacy 'outer query' so you can pass it to stuff
  like [[metabase.mbql.normalize/normalize]], and then probably to [[->pMBQL]]."
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

(defn- disqualify
  "Remove any keys starting with the `:lib/` namespace from map `m`.

  No args = return transducer to remove `:lib/` keys from a map. One arg = update a map `m`."
  ([]
   (remove (fn [[k _v]]
             (and (qualified-keyword? k)
                  (= (namespace k) "lib")))))
  ([m]
   (into {} (disqualify) m)))

(defn- options->legacy-MBQL
  "Convert an options map in an MBQL clause to the equivalent shape for legacy MBQL. Remove `:lib/*` keys and
  `:effective-type`, which is not used in options maps in legacy MBQL."
  [m]
  (not-empty
   (into {}
         (comp (disqualify)
               (remove (fn [[k _v]]
                         (= k :effective-type))))
         m)))

(defn- aggregation->legacy-MBQL [[tag options & args]]
  (let [inner (into [tag] (map ->legacy-MBQL) args)
        ;; the default value of the :case expression is in the options
        ;; in legacy MBQL
        inner (if (and (= tag :case) (next args))
                (conj (pop inner) {:default (peek inner)})
                inner)]
    (if-let [aggregation-opts (not-empty (options->legacy-MBQL options))]
      [:aggregation-options inner aggregation-opts]
      inner)))

(defn- clause-with-options->legacy-MBQL [[k options & args]]
  (if (map? options)
    (into [k] (concat (map ->legacy-MBQL args)
                      (when-let [options (options->legacy-MBQL options)]
                        [options])))
    (into [k] (map ->legacy-MBQL (cons options args)))))

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

(doseq [tag [:count :avg :count-where :distinct
             :max :median :min :percentile
             :share :stddev :sum :sum-where]]
  (lib.hierarchy/derive tag ::aggregation))

(doseq [tag [:+ :- :* :/
             :case :coalesce
             :abs :log :exp :sqrt :ceil :floor :round :power :interval
             :relative-datetime :time :absolute-datetime :now :convert-timezone
             :get-week :get-year :get-month :get-day :get-hour
             :get-minute :get-second :get-quarter
             :datetime-add :datetime-subtract
             :concat :substring :replace :regexextract :regex-match-first
             :length :trim :ltrim :rtrim :upper :lower]]
  (lib.hierarchy/derive tag ::expression))

(defmethod ->legacy-MBQL ::aggregation-or-expression
  [input]
  (aggregation->legacy-MBQL input))

(defn- stage-metadata->legacy-metadata [stage-metadata]
  (into []
        (comp (map #(update-keys % u/->snake_case_en))
              (map ->legacy-MBQL))
        (:columns stage-metadata)))

(defn- chain-stages [{:keys [stages]}]
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
      ;; If this is a native query, inner query will be used like: `{:type :native :native #_inner-query {:query ...}}`
      (:native inner-query) (set/rename-keys {:native :query}))))

(defmethod ->legacy-MBQL :dispatch-type/map [m]
  (into {}
        (comp (disqualify)
              (map (fn [[k v]]
                     [k (->legacy-MBQL v)])))
        m))

(defmethod ->legacy-MBQL :aggregation [[_ opts agg-uuid :as ag]]
  (if (map? opts)
    (let [opts (options->legacy-MBQL opts)]
      (cond-> [:aggregation (get-or-throw! *pMBQL-uuid->legacy-index* agg-uuid)]
        opts (conj opts)))
    ;; Our conversion is a bit too aggressive and we're hitting legacy refs like [:aggregation 0] inside source_metadata that are only used for legacy and thus can be ignored
    ag))

(defmethod ->legacy-MBQL :dispatch-type/sequential [xs]
  (mapv ->legacy-MBQL xs))

(defmethod ->legacy-MBQL :field [[_ opts id]]
  ;; Fields are not like the normal clauses - they need that options field even if it's null.
  ;; TODO: Sometimes the given field is in the legacy order - that seems wrong.
  (let [[opts id] (if (or (nil? opts) (map? opts))
                    [opts id]
                    [id opts])]
    [:field
     (->legacy-MBQL id)
     (options->legacy-MBQL opts)]))

(defmethod ->legacy-MBQL :value
  [[_tag opts value]]
  (let [opts (-> opts
                 ;; as mentioned above, `:value` in legacy MBQL expects `snake_case` keys for type info keys.
                 (set/rename-keys  {:base-type     :base_type
                                    :semantic-type :semantic_type
                                    :database-type :database_type})
                 options->legacy-MBQL)]
    ;; in legacy MBQL, `:value` has to be three args; `opts` has to be present, but it should can be `nil` if it is
    ;; empty.
    [:value value opts]))

(defn- update-list->legacy-boolean-expression
  [m pMBQL-key legacy-key]
  (cond-> m
    (= (count (get m pMBQL-key)) 1) (m/update-existing pMBQL-key (comp ->legacy-MBQL first))
    (> (count (get m pMBQL-key)) 1) (m/update-existing pMBQL-key #(into [:and] (map ->legacy-MBQL) %))
    :always (set/rename-keys {pMBQL-key legacy-key})))

(defmethod ->legacy-MBQL :mbql/join [join]
  (let [base (cond-> (disqualify join)
               (str/starts-with? (:alias join) legacy-default-join-alias) (dissoc :alias))]
    (merge (-> base
               (dissoc :stages :conditions)
               (update-vals ->legacy-MBQL))
           (-> base
               (select-keys [:conditions])
               (update-list->legacy-boolean-expression :conditions :condition))
           (chain-stages base))))

(defn- source-card->legacy-source-table
  "If a pMBQL query stage has `:source-card` convert it to legacy-style `:source-table \"card__<id>\"`."
  [stage]
  (if-let [source-card-id (:source-card stage)]
    (-> stage
        (dissoc :source-card)
        (assoc :source-table (str "card__" source-card-id)))
    stage))

(defmethod ->legacy-MBQL :mbql.stage/mbql
  [stage]
  (binding [*pMBQL-uuid->legacy-index* (into {}
                                             (map-indexed (fn [idx [_tag {ag-uuid :lib/uuid}]]
                                                            [ag-uuid idx]))
                                             (:aggregation stage))]
    (reduce #(m/update-existing %1 %2 ->legacy-MBQL)
            (-> stage
                disqualify
                source-card->legacy-source-table
                (m/update-existing :aggregation #(mapv aggregation->legacy-MBQL %))
                (m/update-existing :expressions (fn [expressions]
                                                  (into {}
                                                        (for [expression expressions
                                                              :let [legacy-clause (->legacy-MBQL expression)]]
                                                          [(lib.util/expression-name expression)
                                                           ;; We wrap literals in :value ->pMBQL
                                                           ;; so unwrap this direction
                                                           (if (= :value (first legacy-clause))
                                                             (second legacy-clause)
                                                             legacy-clause)]))))
                (update-list->legacy-boolean-expression :filters :filter))
            (disj stage-keys :aggregation :filters :expressions))))

(defmethod ->legacy-MBQL :mbql.stage/native [stage]
  (-> stage
      disqualify
      (update-vals ->legacy-MBQL)))

(defmethod ->legacy-MBQL :mbql/query [query]
  (let [base        (disqualify query)
        parameters  (:parameters base)
        inner-query (chain-stages base)
        query-type  (if (-> query :stages last :lib/type (= :mbql.stage/native))
                      :native
                      :query)]
    (merge (-> base
               (dissoc :stages :parameters)
               (update-vals ->legacy-MBQL))
           (cond-> {:type query-type query-type inner-query}
             (seq parameters) (assoc :parameters parameters)))))
