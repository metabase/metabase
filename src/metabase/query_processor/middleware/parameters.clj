(ns metabase.query-processor.middleware.parameters
  "Middleware for substituting parameters in queries."
  (:require
   [clojure.data :as data]
   [clojure.set :as set]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.template-tag :as lib.schema.template-tag]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.middleware.parameters.mbql :as qp.mbql]
   [metabase.query-processor.middleware.parameters.native :as qp.native]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(mu/defn- expand-stage :- ::lib.schema/stage
  "Expand `:parameters` in one stage map that contains them."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (if-not ((some-fn :parameters :template-tags) stage)
    stage
    (let [f        (case (:lib/type stage)
                     :mbql.stage/mbql   qp.mbql/expand
                     :mbql.stage/native (fn [query _path stage]
                                          (qp.native/expand-stage query stage)))
          expanded (f query path stage)]
      (dissoc expanded :parameters :template-tags))))

(mu/defn- expand-all :- ::lib.schema/query
  "Expand all `:parameters` anywhere in the query."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query expand-stage))

;;; if parameters specify `:stage-number`, it means the original stage number before we started preprocessing the
;;; query (i.e., before we expanded source cards and what not)

(mu/defn- num-stages-prepended-by-preprocessing :- ::lib.schema.common/int-greater-than-or-equal-to-zero
  "Parameters can specify the `:stage-number` they should be applied to, but this is relative to the stage number of the
  query as it was originally passed in. The preprocessing middleware that expands source cards can introduce additional
  stages at the beginning of the query, so to get the actual stage number a parameter should affect we have to offset it
  by the number of stages added by preprocessing."
  [{:keys [stages], :as _query} :- ::lib.schema/query]
  (count (take-while :qp/stage-is-from-source-card stages)))

(mu/defn- parameter->stage-number :- :int
  "The stage number that this parameter should be applied to. This is derived from the `:stage-number` specified in the
  parameter `:target`, defaulting to `0`. Note that this `:stage-number` is relative to the stages in the query BEFORE
  stages were appended by preprocessing, so if a parameter specifies `:stage-number` 1 and the the first stage (stage 0)
  has a `:source-card` that gets expanded to three replacement stages (i.e., 2 additional stages prepended to `:stages`
  before the original first stage) then the actual stage number we need to apply the parameter is `3` (1 offset by
  the [[num-stages-prepended-by-preprocessing]])."
  [query     :- ::lib.schema/query
   parameter :- ::lib.schema.parameter/parameter]
  (let [stage-number (or (-> parameter
                             :target
                             lib/->pMBQL
                             lib/options
                             :stage-number)
                         0)]
    (if (not (neg? stage-number))
      ;; for a non-negative stage number add the offset to it as mentioned above
      (+ stage-number (num-stages-prepended-by-preprocessing query))
      ;; for a NEGATIVE stage number we can leave it NEGATIVE because it applies to a stage relative to the end, and all
      ;; the `:source-card` stages get added to the front, e.g. `-1` applies to the same last stage and `-2` applies to
      ;; the same second-to-last stage either way.
      stage-number)))

(defn- move-top-level-params-to-stage* [query parameters]
  (reduce
   (fn [query parameter]
     (let [param-stage-number (parameter->stage-number query parameter)]
       (if (>= param-stage-number (count (:stages query)))
         (do
           (log/errorf "Query does not have a stage %d, ignoring parameter %s"
                       param-stage-number
                       (pr-str parameter))
           query)
         (lib/update-query-stage query param-stage-number
                                 update :parameters
                                 (fn [parameters]
                                   (conj (vec parameters) parameter))))))
   query
   parameters))

(mu/defn- move-top-level-params-to-stage :- ::lib.schema/query
  "Move any top-level parameters to the stage they affect."
  [{:keys [info parameters], :as query} :- ::lib.schema/query]
  ;; TODO (Cam 8/8/25) -- as far as I can tell the only reason why we keep parameters around is that `:user-parameters`
  ;; is used in one single place, by [[metabase.driver.redshift/field->parameter-value]] for some nefarious purposes.
  ;; Seems icky to have a driver be digging into the query like that. Maybe we can fix that usage and remove this.
  (cond-> (set/rename-keys query {:parameters :user-parameters})
    ;; TODO: Native models should be within scope of dashboard filters, by applying the filter on an outer stage.
    ;; That doesn't work, so the logic below requires MBQL queries only to fix the regression.
    ;; Native models don't actual get filtered even when linked to dashboard filters, but that's not a regression.
    ;; This can be fixed properly once this middleware is powered by MLv2. See #40011.
    (and (seq parameters)
         (:metadata/model-metadata info)
         (not (lib/native-stage? (lib/query-stage query -1))))
    lib/append-stage

    (seq parameters)
    (move-top-level-params-to-stage* parameters)))

(mu/defn- expand-parameters :- ::lib.schema/query
  "If any parameters were supplied then substitute them into the query."
  [query :- ::lib.schema/query]
  (u/prog1 (-> query
               move-top-level-params-to-stage
               expand-all)
    (when (not= <> query)
      (when-let [diff (second (data/diff query <>))]
        (log/tracef "\n\nSubstituted params:\n%s\n" (u/pprint-to-str 'cyan diff))))))

(mu/defn- assoc-database-id-in-snippet-tag :- ::lib.schema.template-tag/template-tag-map
  [template-tags :- ::lib.schema.template-tag/template-tag-map
   database-id   :- ::lib.schema.id/database]
  (update-vals
   template-tags
   (fn [v]
     (cond-> v
       (= (:type v) :snippet) (assoc :database database-id)))))

(mu/defn- hoist-database-for-snippet-tags :- ::lib.schema/query
  "Assocs the `:database` ID from `query` in all snippet template tags."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages
   query
   (fn [_query _path stage]
     (when (lib/native-stage? stage)
       (u/update-if-exists stage :template-tags assoc-database-id-in-snippet-tag (:database query))))))

(mu/defn substitute-parameters :- ::lib.schema/query
  "Substitute Dashboard or Card-supplied parameters in a query, replacing the param placeholders with appropriate values
  and/or modifying the query as appropriate. This looks for maps that have the key `:parameters` and/or
  `:template-tags` and removes those keys, splicing appropriate conditions into the queries they affect.

  A SQL query with a param like `{{param}}` will have that part of the query replaced with an appropriate snippet as
  well as any prepared statement args needed. MBQL queries will have additional filter clauses added. (Or in a special
  case, the temporal bucketing on a breakout altered by a `:temporal-unit` parameter.)"
  [query :- ::lib.schema/query]
  (-> query
      hoist-database-for-snippet-tags
      expand-parameters))
