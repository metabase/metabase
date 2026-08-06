(ns metabase.query-processor.schema
  (:require
   [malli.util :as mut]
   ;; legacy usage -- don't use Legacy MBQL utils in QP code going forward, prefer Lib. This is allowed for now
   ;; because the QP still returns legacy-style metadata (for now)
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.regex :as u.regex]))

(def ^:private query-keys
  "Every key a query may have at the top level, whether or not this schema constrains its value.

  The value schemas are deliberately shallow: the shape of each key, not its contents. Pointing them at the real
  schemas would be wrong, because a query here may not be normalized yet -- `:type` may still be `\"query\"` rather
  than `:query`. They must also not *coerce*, since a schema used for an API param is decoded and not just validated:
  `[:or :keyword :string]` would quietly rewrite `\"internal\"` to `:internal`, producing a half-normalized query that
  no longer matches its unnormalized form. [[ms/KeywordOrString]] leaves both alone."
  [:map
   [:database {:optional true} [:or
                                ::lib.schema.id/database
                                ::lib.schema.id/saved-questions-virtual-database]]
   ;; legacy MBQL, from [[metabase.legacy-mbql.schema/Query]]
   [:type        {:optional true} [:maybe ms/KeywordOrString]]
   [:native      {:optional true} [:maybe :map]]
   [:query       {:optional true} [:maybe :map]]
   [:parameters  {:optional true} [:maybe [:sequential :any]]]
   [:settings    {:optional true} [:maybe :map]]
   [:constraints {:optional true} [:maybe :map]]
   [:middleware  {:optional true} [:maybe :map]]
   [:info        {:optional true} [:maybe :map]]
   [:create-row  {:optional true} [:maybe :map]]
   [:update-row  {:optional true} [:maybe :map]]
   ;; MBQL 5, from [[metabase.lib.schema/query]]
   [:lib/type     {:optional true} [:maybe ms/KeywordOrString]]
   [:lib/metadata {:optional true} :any] ; a metadata provider object, not data
   [:stages       {:optional true} [:maybe [:sequential :any]]]
   ;; internal audit app queries: `:fn` and `:args` name the query to run, `:limit` and `:offset` page it. Those two
   ;; end up inlined into SQL, so they have to stay numbers.
   [:fn     {:optional true} [:maybe :string]]
   [:args   {:optional true} [:maybe [:sequential :any]]]
   [:limit  {:optional true} [:maybe :int]]
   [:offset {:optional true} [:maybe :int]]
   ;; set while running a query rather than by whoever submitted it, but named so a query that has been through the
   ;; QP once can be submitted again
   [:cache-strategy {:optional true} [:maybe :map]]
   [:viz-settings   {:optional true} [:maybe :map]]])

(def ^:private query-has-type
  "A query says which MBQL version it is."
  [:fn
   {:error/message "Query with a :type or :lib/type key"}
   (some-fn :type :lib/type)])

(def ^:private query-has-database
  "Every query names the database it runs against, except an internal one, which doesn't run against a database."
  [:fn
   {:error/message "Query should have :database unless it is :type :internal"}
   #(or
     (:database %)
     (= (keyword (:type %)) :internal))])

(mr/def ::any-query
  "Schema for a map that is in the general shape of either a legacy MBQL or MBQL 5 query. Query may not be normalized
  yet!

  This schema is not very strict because we need to handle different types of queries (legacy MBQL, MBQL 5,
  super-legacy MBQL, internal audit app queries, etc.) and it might not be normalized yet.

  For internal use, where a query may carry keys beyond those that can be set over HTTP. Use [[api-query]] for a
  query that arrived in a request."
  [:and query-keys query-has-type query-has-database])

(mr/def ::api-query
  "[[any-query]] with its top-level keys closed, for HTTP API endpoints that take a query as their request body: a
  param the query shape doesn't name is rejected rather than passed along."
  [:and (mut/update-properties query-keys assoc :closed true) query-has-type query-has-database])

;; TODO -- fill this out a bit.
(mr/def ::metadata :any)

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
