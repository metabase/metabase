(ns metabase.lib.schema.middleware-options
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::middleware-options
  "Additional options that can be used to toggle middleware on or off."
  [:map
   {:decode/normalize lib.schema.common/normalize-map
    :decode/api       lib.schema.common/remove-internal-keys
    :encode/serialize lib.schema.common/remove-internal-keys :closed true}
   [:skip-results-metadata?
    {:optional true
     :description
     "Should we skip adding `results_metadata` to query results after running the query? Used by
     `metabase.query-processor.middleware.results-metadata`; default `false`. (Note: we may change the name of this
     column in the near future, to `result_metadata`, to fix inconsistencies in how we name things.)"}
    :boolean]
   [:skip-result-metadata-persistence?
    {:optional true
     :description
     "Should we skip persisting `result_metadata` to a saved Card while still returning it in query results? Used by
       `metabase.query-processor.middleware.results-metadata`; default `false`. Has no effect when
       `skip-results-metadata?` is true."}
    :boolean]
   [:format-rows?
    {:optional true
     :description
     "Should we skip converting datetime types to ISO-8601 strings with appropriate timezone when post-processing
     results? Used by `metabase.query-processor.middleware.format-rows`default `false`."}
    :boolean]
   [:disable-mbql->native?
    {:optional true
     :description
     "Disable the MBQL->native middleware. If you do this, the query will not work at all, so there are no cases where
  you should set this yourself. This is only used by the `metabase.query-processor.preprocess/preprocess` function to
  get the fully pre-processed query without attempting to convert it to native."}
    :boolean]
   [:disable-max-results?
    {:optional true
     :description
     "Disable applying a default limit on the query results. Handled in the `add-default-limit` middleware. If true,
  this will override the `:max-results` and `:max-results-bare-rows` values in `Constraints`."}
    :boolean]
   [:userland-query?
    {:optional true
     :description
     "Userland queries are ones ran as a result of an API call, Pulse, or the like. Special handling is done in
  certain userland-only middleware for such queries -- results are returned in a slightly different format, and
  QueryExecution entries are normally saved, unless you pass `:no-save` as the option."}
    [:maybe :boolean]]
   [:add-default-userland-constraints?
    {:optional true
     :description
     "Whether to add some default `max-results` and `max-results-bare-rows` constraints. By default, none are added,
  although the functions that ultimately power most API endpoints tend to set this to `true`. See
  `add-constraints` middleware for more details."}
    [:maybe :boolean]]
   [:process-viz-settings?
    {:optional true
     :description
     "Whether to process a question's visualization settings and include them in the result metadata so that they can
  incorporated into an export. Used by `metabase.query-processor.middleware.visualization-settings`; default
  `false`."}
    [:maybe :boolean]]
   [:js-int-to-string?
    {:optional true
     :description
     "Whether to convert bigint values in results to strings so that they can be parsed losslessly by JavaScript
  clients. Used by `metabase.query-processor.middleware.large-int`; default `false`."}
    [:maybe :boolean]]
   [:ignore-cached-results?
    {:optional true
     :description
     "Whether to ignore any cached results and re-run the query. Used by the query results cache middleware; default
  `false`."}
    [:maybe :boolean]]
   [:disable-remaps?
    {:optional true
     :description
     "Whether to skip the remapped (human-readable) columns that `metabase.query-processor.middleware.add-remaps`
  normally splices in. Set by callers that want the query's own columns and nothing else -- calculating a Card's
  result metadata, or fetching field values for a filter widget; default `false`."}
    [:maybe :boolean]]
   [:csv-include-bom?
    {:optional true
     :description
     "Whether a CSV download should start with a UTF-8 byte-order mark, which Excel needs to read the file as UTF-8.
  Set by `metabase.query-processor.api` from the download's options and read by
  `metabase.query-processor.middleware.format-rows` and the CSV writer; default `true`."}
    [:maybe :boolean]]
   [:pivot?
    {:optional true
     :description
     "Whether the results should be laid out as a pivot table. Set by `metabase.query-processor.api` from the
  `format_rows`/pivot download options and read by `metabase.query-processor.middleware.pivot-export` and the
  streaming writers; default `false`."}
    [:maybe :boolean]]
   [:pivot-options
    {:optional true
     :description
     "Which of the query's breakouts and aggregations are the pivot table's rows, columns and measures, and whether it
  shows totals. Attached by `metabase.query-processor.pivot` from the question's visualization settings (or from the
  matching top-level query keys) so the export middleware and streaming writers can lay the results out; not something
  a client sets itself."}
    [:maybe
     [:map
      {:closed true}
      [:pivot-rows         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
      [:pivot-cols         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
      [:pivot-measures     {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
      [:show-row-totals    {:optional true} [:maybe :boolean]]
      [:show-column-totals {:optional true} [:maybe :boolean]]
      [:column-sort-order  {:optional true} [:maybe [:map-of [:maybe [:int {:min 0}]] [:maybe :keyword]]]]]]]])
