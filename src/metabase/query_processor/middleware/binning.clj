(ns metabase.query-processor.middleware.binning
  "Middleware that handles `:binning` strategy in `:field` clauses. This adds extra info to the `:binning` options maps
  that contain the information Query Processors will need in order to perform binning."
  (:require
   [metabase.lib.binning.util :as lib.binning.util]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.expression :as lib.schema.expression]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata.fingerprint :as lib.schema.metadata.fingerprint]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.lib.walk :as lib.walk]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mr/def ::field-id-or-name->filters
  [:map-of [:or ::lib.schema.id/field :string] ::lib.schema/filters])

(mu/defn- filters->field-map :- ::field-id-or-name->filters
  "Find any comparison or `:between` filter and return a map of referenced Field ID or Name -> all the clauses the reference
  it."
  [filters :- [:maybe [:sequential ::lib.schema.expression/boolean]]]
  (reduce
   (partial merge-with concat)
   {}
   (for [subclause        (lib.util.match/match filters #{:between :< :<= :> :>=})
         field-id-or-name (lib.util.match/match subclause [:field _opts field-id-or-name] field-id-or-name)]
     {field-id-or-name [subclause]})))

(mu/defn- extract-bounds :- [:map [:min-value number?] [:max-value number?]]
  "Given query criteria, find a min/max value for the binning strategy using the greatest user specified min value and
  the smallest user specified max value. When a user specified min or max is not found, use the global min/max for the
  given field."
  [field-id-or-name          :- [:maybe [:or ::lib.schema.id/field :string]]
   fingerprint               :- [:maybe ::lib.schema.metadata.fingerprint/fingerprint]
   field-id-or-name->filters :- ::field-id-or-name->filters]
  (let [{global-min :min, global-max :max} (get-in fingerprint [:type :type/Number])
        filter-clauses                     (get field-id-or-name->filters field-id-or-name)
        ;; [:between <field> <min> <max>] or [:< <field> <x>]
        user-maxes                         (lib.util.match/match filter-clauses
                                             [(_tag :guard #{:< :<= :between}) _opts & args] (last args))
        user-mins                          (lib.util.match/match filter-clauses
                                             [(_tag :guard #{:> :>= :between}) _opts _field min-val & _]
                                             min-val)
        min-value                          (or (when (seq user-mins)
                                                 (apply max user-mins))
                                               global-min)
        max-value                          (or (when (seq user-maxes)
                                                 (apply min user-maxes))
                                               global-max)]
    (when-not (and min-value max-value)
      (throw (ex-info (tru "Unable to bin Field without a min/max value (missing or incomplete fingerprint)")
                      {:type             qp.error-type/invalid-query
                       :field-id-or-name field-id-or-name
                       :fingerprint      fingerprint})))
    {:min-value min-value, :max-value max-value}))

(mu/defn- update-binned-field :- :mbql.clause/field
  "Given a `binning-strategy` clause, resolve the binning strategy (either provided or found if default is specified)
  and calculate the number of bins and bin width for this field. `field-id->filters` contains related criteria that
  could narrow the domain for the field. This info is saved as part of each `binning-strategy` clause."
  [query                                                        :- ::lib.schema/query
   path                                                         :- ::lib.walk/path
   field-id-or-name->filters                                    :- ::field-id-or-name->filters
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
        ;; Bail out and use unmodifed version if we can't converge on a nice version.
        new-options (or (lib.binning.util/nicer-breakout new-strategy resolved-options)
                        resolved-options)]
    (lib/update-options field-ref update :binning merge {:strategy new-strategy} new-options)))

(mu/defn- update-binning-strategy-in-stage
  "Update `:field` clauses with `:binning` strategy options in an `inner` [MBQL] query."
  [query :- ::lib.schema/query
   path  :- ::lib.walk/path
   stage :- ::lib.schema/stage]
  (let [field-id-or-name->filters (filters->field-map (:filters stage))]
    (lib.util.match/replace stage
      ;; don't recurse into joins (let `lib.walk` handle this for us) or into stage metadata.
      (_ :guard (constantly (some (partial contains? (set &parents))
                                  [:joins :lib/stage-metadata])))
      &match

      [:field (_opts :guard :binning) _id-or-name]
      (try
        (update-binned-field query path field-id-or-name->filters &match)
        (catch Throwable e
          (throw (ex-info (ex-message e) {:clause &match} e)))))))

(mu/defn update-binning-strategy :- ::lib.schema/query
  "When a binned field is found, it might need to be updated if a relevant query criteria affects the min/max value of
  the binned field. This middleware looks for that criteria, then updates the related min/max values and calculates
  the bin-width based on the criteria values (or global min/max information)."
  [query :- ::lib.schema/query]
  (lib.walk/walk-stages query update-binning-strategy-in-stage))
