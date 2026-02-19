(ns metabase.query-processor.util.transformations.nest-breakouts
  "TODO (Cam 8/7/25) -- this is a pure-MBQL-5 high-level query transformation, and almost certainly belongs in Lib
  rather than in QP -- we should move it there. (This also applies to [[metabase.query-processor.util.nest-query]])."
  (:refer-clojure :exclude [mapv select-keys some not-empty])
  (:require
   [flatland.ordered.set :as ordered-set]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [mapv select-keys some not-empty]]))

(defn- stage-has-window-aggregation? [stage]
  (lib.util.match/match-lite (:aggregation stage)
    [#{:cum-sum :cum-count :offset} & _] true))

(defn- stage-has-breakout? [stage]
  (seq (:breakout stage)))

(mu/defn- fields-used-in-breakouts-aggregations-or-expressions :- [:set [:or :mbql.clause/field :mbql.clause/expression]]
  [stage :- ::lib.schema/stage]
  ;; use an ordered set so we preserve the order we saw things when we walked the query so the fields we return are
  ;; determinate. Otherwise tests using this are liable to be flaky because results can change because test metadata has
  ;; randomly generated IDs
  (into (ordered-set/ordered-set)
        (m/distinct-by (fn [[tag opts id-or-name]]
                         [tag
                          (select-keys opts [:join-alias :temporal-unit :bucketing])
                          id-or-name]))
        (lib.util.match/match-many (concat (:breakout stage) (:aggregation stage) (:expressions stage))
          [#{:field :expression} & _] &match)))

(mu/defn- new-first-stage :- ::lib.schema/stage
  "Remove breakouts, aggregations, order bys, and limit. Add `:fields` to return the things needed by the second stage."
  [stage :- ::lib.schema/stage]
  (-> stage
      (dissoc :breakout :aggregation :order-by :limit :lib/stage-metadata)
      (assoc :fields (mapv
                      lib.util/fresh-uuids
                      (fields-used-in-breakouts-aggregations-or-expressions stage)))))

(defn- update-temporal-bucket
  "For temporal columns: set temporal type to `:default` to
  prevent [[metabase.query-processor.middleware.auto-bucket-datetimes]] from trying to mess with it.

  For other columns: remove temporal type, it should be nil anyway but remove it to be safe."
  [col]
  (lib/with-temporal-bucket col (if (isa? ((some-fn :effective-type :base-type) col) :type/Temporal)
                                  :default
                                  nil)))

(mu/defn- update-second-stage-refs :- ::lib.schema/stage
  [stage            :- ::lib.schema/stage
   first-stage-cols :- [:sequential ::lib.schema.metadata/column]]
  (lib.util.match/replace stage
    #{:field :expression}
    (if-let [col (when-not (some #{:expressions} &parents)
                   (lib.equality/find-matching-column &match first-stage-cols))]
      (-> col
          lib/update-keys-for-col-from-previous-stage
          update-temporal-bucket
          lib/ref
          (cond-> (:lib/external-remap col) (lib/update-options assoc ::externally-remapped-field true)))
      (lib.util/fresh-uuids &match))))

(def ^:private granularity
  {:time-unbucketed 0
   :minute          1
   :minute-of-hour  2
   :hour            3
   :hour-of-day     4
   :day             5
   :date-unbucketed 5
   :day-of-week     6
   :day-of-month    7
   :day-of-year     8
   :week            9
   :week-of-year    10
   :month           11
   :month-of-year   12
   :quarter         13
   :quarter-of-year 14
   :year            15
   :year-of-era     16})

(defn- original-temporal-unit
  [temporal-attributes]
  (let [temporal-unit (:temporal-unit temporal-attributes)]
    (if (and (some? temporal-unit) (not= temporal-unit :default))
      temporal-unit
      (or (:original-temporal-unit temporal-attributes)
          (:inherited-temporal-unit temporal-attributes)
          temporal-unit))))

(defn- column-granularity
  [temporal-attributes]
  (let [effective-type ((some-fn :effective-type :base-type) temporal-attributes)
        temporal-unit (original-temporal-unit temporal-attributes)]
    (when temporal-unit
      (-> (if (or (nil? temporal-unit) (= temporal-unit :default))
            (cond
              (isa? effective-type :type/DateTime) :time-unbucketed
              (isa? effective-type :type/Date)     :date-unbucketed
              (isa? effective-type :type/Time)     :time-unbucketed
              :else                                nil)
            temporal-unit)
          granularity))))

(defn finest-temporal-breakout-index
  "Returns the index of leftmost breakout among the breakouts with the finest temporal granularity."
  [breakouts option-index]
  (loop [bs (seq breakouts)
         i 0
         min-granularity (inc (apply max (vals granularity)))
         finest-index nil]
    (if-not bs
      finest-index
      (let [b (first bs)
            granularity (-> b (get option-index) column-granularity)]
        (if (and granularity (< granularity min-granularity))
          (recur (next bs) (inc i) granularity     i)
          (recur (next bs) (inc i) min-granularity finest-index))))))

(defn- add-implicit-breakout-order-bys
  [stage]
  (if-let [breakouts (not-empty (:breakout stage))]
    (let [finest-temp-breakout (finest-temporal-breakout-index breakouts 1)
          breakout-exprs (if finest-temp-breakout
                           (concat (m/remove-nth finest-temp-breakout breakouts)
                                   [(nth breakouts finest-temp-breakout)])
                           breakouts)
          explicit-order-bys (vec (:order-by stage))
          explicit-order-by-exprs (set (for [[_dir _opts col-ref] explicit-order-bys]
                                         (lib.schema.util/remove-lib-uuids col-ref)))
          order-bys (into explicit-order-bys
                          (comp (map lib.schema.util/remove-lib-uuids)
                                (remove explicit-order-by-exprs)
                                (map (fn [expr]
                                       (lib/ensure-uuid [:asc (lib/ensure-uuid expr)]))))
                          breakout-exprs)]
      (assoc stage :order-by order-bys))
    stage))

(mu/defn- new-second-stage :- ::lib.schema/stage
  "All references need to be updated to be prior-stage references using the desired alias from the previous stage.
  Remove expressions, joins, and source(s)."
  [query       :- ::lib.schema/query
   path        :- ::lib.walk/stage-path
   stage       :- ::lib.schema/stage
   first-stage :- ::lib.schema/stage]
  (let [query            (assoc-in query path first-stage)
        first-stage-cols (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)]
    (-> stage
        (dissoc :joins :source-table :source-card :lib/stage-metadata :filters)
        (update-second-stage-refs first-stage-cols)
        (dissoc :expressions)
        add-implicit-breakout-order-bys)))

(mu/defn- nest-breakouts-in-stage :- [:maybe [:sequential {:min 2, :max 2} ::lib.schema/stage]]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path
   stage :- ::lib.schema/stage]
  (let [first-stage (new-first-stage stage)]
    [first-stage
     (new-second-stage query path stage first-stage)]))

(mu/defn nest-breakouts-in-stages-with-window-aggregation :- ::lib.schema/query
  "Some picky databases like BigQuery don't let you use anything inside `ORDER BY` in `OVER` expressions except for
  plain column identifiers that also appear in the `GROUP BY` clause... no inline temporal bucketing or things like
  that.

  This query transformation takes queries with cumulative aggregations and breakouts in the same stage and then adds a
  new prior stage that does all of the breakout-column calculations so the original stage can just use raw column
  identifiers. See #40982 for more info."
  {:added "0.50.0"}
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [query path stage]
     (when (and (stage-has-window-aggregation? stage)
                (stage-has-breakout? stage))
       (nest-breakouts-in-stage query path stage)))))
