(ns metabase.query-processor.schema
  (:require
   ;; legacy usage -- don't use Legacy MBQL utils in QP code going forward, prefer Lib. This is allowed for now
   ;; because the QP still returns legacy-style metadata (for now)
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.regex :as u.regex]))

(mr/def ::any-query
  "Schema for a map that is in the general shape of either a legacy MBQL or MBQL 5 query. Query may not be normalized
  yet!

  This schema is not very strict because we need to handle different types of queries (legacy MBQL, MBQL 5,
  super-legacy MBQL, internal audit app queries, etc.) and it might not be normalized yet."
  [:or
   :metabase.lib.util/legacy-query
   ::lib.schema/query
   ::lib-be.schema/internal-query])

(mr/def ::metadata
  "The map threaded through the post-processing `rff`/`rf` chain: an accumulator of query result metadata that grows
  as it passes through QP middleware, and is eventually merged into the final result's `:data` key. See
  [[metabase.query-processor.postprocess/middleware]] and [[metabase.query-processor.execute/middleware]] for the
  middleware that add to it."
  [:map {:closed true}
   [:cols                    {:optional true} ::result-metadata.columns]
   [:native_form             {:optional true} :metabase.query-processor.compile/compiled]
   [:dataset                 {:optional true} :boolean]
   [:model                   {:optional true} :boolean]
   [:viz-settings            {:optional true} :metabase.lib.schema.common/visualization-settings]
   [:format-rows?            {:optional true} :boolean]
   [:csv-include-bom?        {:optional true} :boolean]
   [:results_timezone        {:optional true} [:maybe :string]]
   [:requested_timezone      {:optional true} [:maybe :string]]
   [:cache-version           {:optional true} :int]
   [:last-ran                {:optional true} (lib.schema.common/instance-of-class java.time.temporal.Temporal)]
   [:pivot-export-options    {:optional true} [:map {:closed true}
                                               [:pivot-rows         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
                                               [:pivot-cols         {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
                                               [:pivot-measures     {:optional true} [:maybe [:sequential [:int {:min 0}]]]]
                                               [:show-row-totals    {:optional true} :boolean]
                                               [:show-column-totals {:optional true} :boolean]
                                               [:column-sort-order  {:optional true} [:maybe [:multi {:dispatch map?}
                                                                                              [true  [:map-of [:maybe [:int {:min 0}]] [:maybe :keyword]]]
                                                                                              [false [:fn {:error/message "map"} map?]]]]]]]
   [:pivot?                  {:optional true} :boolean]
   [:is_sandboxed            {:optional true} :boolean]
   [:download_perms          {:optional true} :string]])

(mr/def ::accumulator
  "One of the concrete shapes threaded as a reducing function's running accumulator: an empty seed vector, or the
  standard in-progress result map produced by [[metabase.query-processor.reducible/default-rff]] before `:row_count`
  and the final rows are added."
  [:or
   [:= []]
   [:map {:closed true}
    [:data ::metadata]]])

(mr/def ::rf
  "Schema for a reducing function."
  [:function
   [:=> [:cat]           :any]
   [:=> [:cat :any]      :any]
   [:=> [:cat :any :any] :any]])

(mr/def ::rff
  [:and
   ;; apparently the `:function` schema below just checks for an [[ifn?]], which is not quite what we want, since a map
   ;; is an `ifn?`. Thus we will check both regular [[fn?]] and the `:function` schema.
   fn?
   [:=>
    [:cat ::metadata]
    ::rf]])

(mr/def ::xform
  "Schema for a transducer (function that takes a reducing function and returns another reducing function)."
  [:=> [:cat ::rf] ::rf])

(mr/def ::qp
  [:=>
   [:cat ::any-query ::rff]
   :some])

(def export-formats
  "Set of valid streaming response formats. Currently, `:json`, `:csv`, `:xlsx`, and `:api` (normal JSON API results
  with extra metadata)."
  #{:api :csv :json :xlsx})

(def export-formats-regex
  "Regex for `export-formats` for use in API routes."
  (u.regex/re-or (map u/qualified-name export-formats)))

(mr/def ::export-format
  "Schema for valid export formats for downloading query results."
  (into [:enum {:decode/json keyword
                ;; :api/regex   export-formats-regex
                }]
        export-formats))

(mr/def ::result-metadata.column
  "A single result metadata column as returned by the Query Processor."
  [:ref ::mbql.s/legacy-column-metadata])

(mr/def ::result-metadata.columns
  "A sequence of result metadata columns as returned by the Query Processor."
  [:sequential ::result-metadata.column])

;;; ------------------------------------------------ Query Results -------------------------------------------------

(mr/def ::query-result.data
  "Schema for the :data key of query results."
  [:map
   [:cols              [:sequential ::result-metadata.column]]
   [:rows              [:sequential [:sequential :any]]]
   [:native_form       {:optional true} :map]
   [:results_timezone  {:optional true} :string]
   [:results_metadata  {:optional true} [:map
                                         [:columns [:sequential ::result-metadata.column]]]]
   [:insights          {:optional true} [:sequential :map]]
   [:download_perms    {:optional true} :string]
   [:is_sandboxed      {:optional true} :boolean]
   [:format-rows?      {:optional true} :boolean]])

(mr/def ::query-result
  "Schema for query execution results returned by the Query Processor."
  [:map
   [:status                 [:enum :completed :failed]]
   [:row_count              :int]
   [:data                   {:optional true} ::query-result.data]
   [:running_time           {:optional true} :int]
   [:started_at             {:optional true} :string]
   [:database_id            {:optional true} ::lib.schema.id/database]
   [:json_query             {:optional true} :map]
   [:average_execution_time {:optional true} [:maybe :int]]
   [:context                {:optional true} :any]
   [:cached                 {:optional true} [:maybe :string]]
   [:error                  {:optional true} :string]
   [:error_type             {:optional true} :keyword]])
