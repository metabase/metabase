(ns metabase.query-processor.middleware.binning
  "Middleware that handles `:binning` strategy in `:field` clauses. This adds extra info to the `:binning` options maps
  that contain the information Query Processors will need in order to perform binning."
  (:refer-clojure :exclude [get-in])
  (:require
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.match :as match]
   [metabase.util.performance :refer [get-in]]))

(mu/defn- extract-bounds :- [:map [:min-value number?] [:max-value number?]]
  "Given query criteria, find a min/max value for the binning strategy using the greatest user specified min value and
  the smallest user specified max value. When a user specified min or max is not found, use the global min/max for the
  given field."
  [field-id-or-name          :- [:maybe [:or ::lib.schema.id/field :string]]
   fingerprint               :- [:maybe ::lib.schema.metadata.fingerprint/fingerprint]
   field-id-or-name->filters :- ::lib.binning.util/field-id-or-name->filters]
  (or (lib.binning.util/extract-bounds field-id-or-name fingerprint field-id-or-name->filters)
      (throw (ex-info (tru "Unable to bin Field without a min/max value (missing or incomplete fingerprint)")
                      {:type             qp.error-type/invalid-query
                       :field-id-or-name field-id-or-name
                       :fingerprint      fingerprint}))))

(mu/defn- update-binned-field :- :mbql.clause/field
  "Given a `binning-strategy` clause, resolve the binning strategy (either provided or found if default is specified)
  and calculate the number of bins and bin width for this field. `field-id->filters` contains related criteria that
  could narrow the domain for the field. This info is saved as part of each `binning-strategy` clause."
  [query                                                        :- ::lib.schema/query
   path                                                         :- ::lib.walk/path
   field-id-or-name->filters                                    :- ::lib.binning.util/field-id-or-name->filters
   [_tag {:keys [binning], :as _opts} id-or-name :as field-ref] :- :mbql.clause/field]
  (let [metadata                                   (lib.walk/apply-f-for-stage-at-path lib/metadata query path field-ref)
        {:keys [min-value max-value], :as min-max} (extract-bounds id-or-name
                                                                   (:fingerprint metadata)
                                                                   field-id-or-name->filters)
        [new-strategy resolved-options]            (lib.binning.util/resolve-options query
                                                                                     (:strategy binning)
                                                                                     (get binning (:strategy binning))
                                                                                     metadata
                                                                                     min-value max-value)
        resolved-options                           (merge min-max resolved-options)
        ;; Bail out and use unmodified version if we can't converge on a nice version.
        new-options (or (lib.binning.util/nicer-breakout new-strategy resolved-options)
                        resolved-options)]
    (lib/update-options field-ref update :binning merge {:strategy new-strategy} new-options)))

(defn- propagate-original-binning [query path clause]
  (let [col (lib.walk/apply-f-for-stage-at-path lib/metadata query path (lib/update-options clause dissoc :lib/original-binning))]
    (lib/update-options clause u/assoc-dissoc :lib/original-binning (:lib/original-binning col))))

(mu/defn update-binning-strategy :- ::lib.schema/query
  "When a binned field is found, it might need to be updated if a relevant query criteria affects the min/max value of
  the binned field. This middleware looks for that criteria, then updates the related min/max values and calculates
  the bin-width based on the criteria values (or global min/max information)."
  [query :- ::lib.schema/query]
  (let [path->field-id-or-name->filters (memoize
                                         (fn [path]
                                           (let [stage (get-in query path)]
                                             (lib.binning.util/filters->field-map (:filters stage)))))]
    (lib.walk/walk-clauses
     query
     (fn [query path-type path clause]
       (when (= path-type :lib.walk/stage)
         (match/match-one clause
           ;; first update all the `:binning` options
           [:field {:binning &truthy} _id-or-name]
           (update-binned-field query path (path->field-id-or-name->filters path) clause)

           ;; then do another pass and update `:lib/original-binning` options
           [:field {:lib/original-binning &truthy} _id-or-name]
           (propagate-original-binning query path clause)

           _ nil))))))
