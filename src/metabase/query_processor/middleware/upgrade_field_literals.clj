(ns metabase.query-processor.middleware.upgrade-field-literals
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.util :as lib.util]
   [metabase.mbql.schema :as mbql.s]
   [metabase.mbql.util :as mbql.u]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(defn- warn-once
  "Log only one warning per QP run (regardless of message)."
  [& lines]
  (let [message (str \newline (str/join "\n\n" lines))]
    ;; Make sure QP store is available since we use caching below (it may not be in some unit tests)
    (when (qp.store/initialized?)
      ;; by caching the block below, the warning will only get trigger a maximum of one time per query run. We don't need
      ;; to blow up the logs with a million warnings.
      (qp.store/cached ::bad-clause-warning
        (log/warn (u/colorize :red message))))
    (log/debug (u/colorize :yellow message)))
  nil)

;;; For the purposes of this middleware, "initial stage" means the first stage of a query that has a `:source-table`,
;;; and "subsequent stage" means any stage after the first, or the first stage if it has a `:source-card` (since
;;; effectively that stage is not the first stage of the query)

(def ^:private InitialMBQLStage
  ::lib.schema/stage.mbql.with-source-table)

(def ^:private SubsequentMBQLStage
  [:or
   ::lib.schema/stage.mbql.without-source
   ::lib.schema/stage.mbql.with-source-card])

(mu/defn ^:private resolve-nominal-ref :- [:maybe lib.metadata/ColumnMetadata]
  [visible-cols                            :- [:maybe [:sequential lib.metadata/ColumnMetadata]]
   [_field _opts field-name :as field-ref] :- ::lib.schema.ref/field.literal]
  (or (some (fn [f]
              (m/find-first f visible-cols))
            [#(= (:lib/desired-column-alias %) field-name)
             #(= (:name %) field-name)
             #(= (u/lower-case-en (:lib/desired-column-alias %)) (u/lower-case-en field-name))
             #(= (u/lower-case-en (:name %)) (u/lower-case-en field-name))])
      (do
        (warn-once "Warning: clause refers to a Field that may not be present in the source query:"
                   (pr-str field-ref)
                   "Query may not work as expected. Found:"
                   (pr-str (into #{}
                                 (mapcat (juxt :lib/desired-column-alias :name))
                                 visible-cols)))
        nil)))

(mu/defn ^:private upgrade-nominal-ref :- :mbql.clause/field
  "Attempt to upgrade a nominal `:field` ref to an integer ID one."
  [visible-cols
   field-ref :- ::lib.schema.ref/field.literal]
  (or (when-let [column-metadata (resolve-nominal-ref visible-cols field-ref)]
        (u/prog1 (lib/ref column-metadata)
          (warn-once "Warning: found nominal :field ref in the initial stage of the query:"
                     (pr-str field-ref)
                     "Correcting this to:"
                     (pr-str <>))))
      field-ref))

(mu/defn ^:private fix-refs-in-initial-stage :- InitialMBQLStage
  "All refs in the initial stage should be integer ID refs; attempt to fix any nominal refs."
  [query        :- ::lib.schema/query
   stage-number :- :int
   stage        :- InitialMBQLStage]
  (let [metadata (delay
                   (lib.metadata.calculation/visible-columns query stage-number (lib.util/query-stage query stage-number)))]
    (mbql.u/replace stage
      [:field opts (field-name :guard string?)]
      (upgrade-nominal-ref @metadata &match))))

(mu/defn ^:private fix-bad-nominal-ref :- ::lib.schema.ref/field.literal
  "Fix a nominal `:field` ref whose literal field name does not actually match the name of anything returned by the
  previous stage."
  [visible-cols
   field-ref :- ::lib.schema.ref/field.literal]
  (or (when-let [column-metadata (resolve-nominal-ref visible-cols field-ref)]
        (u/prog1 (lib/ref column-metadata)
          (warn-once "Warning: clause does not match a column in the source query:"
                     (pr-str field-ref)
                     "Correcting this to:"
                     (pr-str <>))))
      field-ref))

(mu/defn ^:private downgrade-id-ref :- ::lib.schema.ref/field.literal
  "Downgrade a `:field` ID reference to a nominal `:field` reference for stages of the query where we should be using
  nominal references."
  [query
   stage-number
   field-ref :- ::lib.schema.ref/field.id]
  (or (when-let [column-metadata (lib.metadata.calculation/metadata query stage-number field-ref)]
        (u/prog1 (lib/ref (-> column-metadata
                              (assoc :lib/source :source/previous-stage)
                              (dissoc :source-field)))
          (warn-once (format "Warning: found :field ID ref in a subsequent stage (%d) of the query:" stage-number)
                     (pr-str field-ref)
                     "Correcting this to:"
                     (pr-str <>))))
      field-ref))

(mu/defn ^:private fix-refs-in-subsequent-stage :- SubsequentMBQLStage
  [query        :- ::lib.schema/query
   stage-number :- :int
   stage        :- SubsequentMBQLStage]
  (let [visible-cols      (delay (if-let [source-card-id (:source-card stage)]
                                   (lib.metadata.calculation/returned-columns (lib.metadata/card query source-card-id))
                                   (for [col (lib.metadata.calculation/returned-columns query
                                                                                        (lib.util/previous-stage-number query stage-number)
                                                                                        (lib.util/previous-stage query stage-number))]
                                     (assoc col :lib/source :source/previous-stage))))
        valid-field-names (delay (into #{} (map :lib/desired-column-alias) @visible-cols))]
    (mbql.u/replace stage
      [:field _opts (_field-name :guard #(and (string? %)
                                              (not (@valid-field-names %))))]
      (fix-bad-nominal-ref @visible-cols &match)

      [:field (_opts :guard (complement :source-field)) (_id :guard integer?)]
      (downgrade-id-ref query stage-number &match))))

(mu/defn ^:private upgrade-field-literals-in-mbql-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int
   stage        :- ::lib.schema/stage]
  (let [f (if (and (lib.util/first-stage? query stage-number)
                   (:source-table stage))
            fix-refs-in-initial-stage
            fix-refs-in-subsequent-stage)]
    (merge
     (f query stage-number (dissoc stage :joins :lib/stage-metadata))
     (select-keys stage [:joins :lib/stage-metadata]))))

(mu/defn ^:private upgrade-field-literals-in-stage :- ::lib.schema/stage
  [query        :- ::lib.schema/query
   stage-number :- :int
   stage]
  (case (:lib/type stage)
    :mbql.stage/native stage
    :mbql.stage/mbql   (upgrade-field-literals-in-mbql-stage query stage-number stage)))

(mu/defn upgrade-field-literals :- mbql.s/Query
  "Look for usage of `:field` (name) forms where `field` (ID) would have been the correct thing to use, and fix it, so
  the resulting query doesn't end up being broken."
  ([query]
   (upgrade-field-literals query (qp.store/metadata-provider)))

  ([query             :- mbql.s/Query
    metadata-provider :- lib.metadata/MetadataProvider]
   (-> (lib/query metadata-provider query)
       (lib.util/update-stages-and-join-stages upgrade-field-literals-in-stage)
       lib.convert/->legacy-MBQL)))
