(ns metabase.query-processor.util.transformations.nest-breakouts
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.util.malli :as mu]))

(defn- stage-has-cumulative-aggregation? [stage]
  (lib.util.match/match (:aggregation stage)
    #{:cum-sum :cum-count}))

(defn- stage-has-breakout? [stage]
  (seq (:breakout stage)))

(mu/defn ^:private fields-used-in-breakouts-aggregations-or-expressions :- [:set [:or :mbql.clause/field :mbql.clause/expression]]
  [stage :- ::lib.schema/stage]
  (into #{}
        (m/distinct-by (fn [[tag opts id-or-name]]
                         [tag
                          (select-keys opts [:join-alias :temporal-unit :bucketing])
                          id-or-name]))
        (lib.util.match/match (concat (:breakout stage) (:aggregation stage) (:expressions stage))
          #{:field :expression})))

(mu/defn ^:private new-first-stage :- ::lib.schema/stage
  "Remove breakouts, aggregations, order bys, and limit. Add `:fields` to return the things needed by the second stage."
  [stage :- ::lib.schema/stage]
  (-> stage
      (dissoc :breakout :aggregation :order-by :limit :lib/stage-metadata)
      (assoc :fields (mapv
                      lib.util/fresh-uuids
                      (fields-used-in-breakouts-aggregations-or-expressions stage)))))

(mu/defn ^:private update-metadata-from-previous-stage-to-produce-correct-ref-in-current-stage :- ::lib.schema.metadata/column
  "Force a `[:field {} <name>]` ref."
  [col :- ::lib.schema.metadata/column]
  (-> col
      (assoc :lib/source              :source/previous-stage
             :lib/source-column-alias (:lib/desired-column-alias col))
      (lib/with-temporal-bucket (if (isa? ((some-fn :effective-type :base-type) col) :type/Temporal)
                                  ;; for temporal columns: set temporal type to `:default` to
                                  ;; prevent [[metabase.query-processor.middleware.auto-bucket-datetimes]] from
                                  ;; trying to mess with it.
                                  :default
                                  ;; for other columns: remove temporal type, it should be nil anyway but remove it to
                                  ;; be safe.
                                  nil))
      (lib/with-join-alias nil)
      (lib/with-binning nil)))

(mu/defn ^:private update-second-stage-refs :- ::lib.schema/stage
  [stage            :- ::lib.schema/stage
   first-stage-cols :- [:sequential ::lib.schema.metadata/column]]
  (lib.util.match/replace stage
    #{:field :expression}
    (let [col (lib.equality/find-matching-column &match first-stage-cols)]
      (-> col
          update-metadata-from-previous-stage-to-produce-correct-ref-in-current-stage
          lib/ref))))

(mu/defn ^:private new-second-stage :- ::lib.schema/stage
  "All references need to be updated to be prior-stage references using the desired alias from the previous stage.
  Remove expressions, joins, and source(s)."
  [query       :- ::lib.schema/query
   path        :- ::lib.walk/stage-path
   stage       :- ::lib.schema/stage
   first-stage :- ::lib.schema/stage]
  (let [query            (assoc-in query path first-stage)
        first-stage-cols (lib.walk/apply-f-for-stage-at-path lib/returned-columns query path)]
    (-> stage
        (dissoc :expressions :joins :source-table :source-card :sources :lib/stage-metadata)
        (update-second-stage-refs first-stage-cols))))

(mu/defn ^:private nest-breakouts-in-stage :- [:maybe [:sequential {:min 2, :max 2} ::lib.schema/stage]]
  [query :- ::lib.schema/query
   path  :- ::lib.walk/stage-path
   stage :- ::lib.schema/stage]
  (let [first-stage (new-first-stage stage)]
    [first-stage
     (new-second-stage query path stage first-stage)]))

(mu/defn nest-breakouts-in-stages-with-cumulative-aggregation :- ::lib.schema/query
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [query path stage]
     (when (and (stage-has-cumulative-aggregation? stage)
                (stage-has-breakout? stage))
       (nest-breakouts-in-stage query path stage)))))
