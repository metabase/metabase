(ns metabase.lib.schema.middleware-options
  (:require
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.util.malli.registry :as mr]))

(mr/def ::middleware-options
  "Additional options that can be used to toggle middleware on or off."
  [:map
   {:decode/normalize lib.schema.common/normalize-map}
   [:skip-results-metadata?
    {:optional true
     :description
     "Should we skip adding `results_metadata` to query results after running the query? Used by
     `metabase.query-processor.middleware.results-metadata`; default `false`. (Note: we may change the name of this
     column in the near future, to `result_metadata`, to fix inconsistencies in how we name things.)"}
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
    [:maybe :boolean]]])
