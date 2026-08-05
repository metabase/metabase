(ns metabase.query-processor.schema
  (:require
   ;; legacy usage -- don't use Legacy MBQL utils in QP code going forward, prefer Lib. This is allowed for now
   ;; because the QP still returns legacy-style metadata (for now)
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [metabase.legacy-mbql.schema :as mbql.s]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.regex :as u.regex]))

(mr/def ::any-query
  "Schema for a map that is in the general shape of either a legacy MBQL or MBQL 5 query. Query may not be normalized
  yet!

  This schema is not very strict because we need to handle different types of queries (legacy MBQL, MBQL 5,
  super-legacy MBQL, internal audit app queries, etc.) and it might not be normalized yet. It does still name every
  key a query may have at the top level: an API endpoint taking a query as its body drops params this schema doesn't
  name (see [[metabase.api.macros/permitted-param-keys]]), so a key missing from here never reaches the handler.
  `metabase.query-processor.schema-test/query-top-level-keys-test` checks these against the schemas the first two
  groups come from.

  The value schemas are deliberately shallow -- the shape of each key, not its contents. Referring to the real
  schemas would be wrong here: this runs before normalization, so `:type` may still be `\"query\"` rather than
  `:query`, and the deep schemas describe a query that has already been normalized. Whatever this misses is caught
  when the query reaches the schema for its actual MBQL version."
  [:and
   [:map
    [:database {:optional true} [:or
                                 ::lib.schema.id/database
                                 ::lib.schema.id/saved-questions-virtual-database]]
    ;; legacy MBQL, from [[metabase.legacy-mbql.schema/Query]]
    [:type        {:optional true} [:maybe [:or :keyword :string]]]
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
    [:lib/type     {:optional true} [:maybe [:or :keyword :string]]]
    [:lib/metadata {:optional true} :any] ; a metadata provider object, not data
    [:stages       {:optional true} [:maybe [:sequential :any]]]
    ;; internal audit app queries, from
    ;; [[metabase-enterprise.audit-app.query-processor.middleware.handle-audit-queries/InternalQuery]]. That
    ;; middleware also binds every *other* top-level key to `*additional-query-params*`, which is how audit app does
    ;; its paging -- `:limit` and `:offset` are the keys it uses today, so a new one has to be named here too. Those
    ;; two are inlined straight into SQL by `metabase-enterprise.audit-app.pages.common`, so keep them numbers.
    [:fn     {:optional true} [:maybe :string]]
    [:args   {:optional true} [:maybe [:sequential :any]]]
    [:limit  {:optional true} [:maybe :int]]
    [:offset {:optional true} [:maybe :int]]
    ;; set by the QP itself rather than by a client, but named so that a query that has been through the QP once can
    ;; be sent back
    [:cache-strategy {:optional true} [:maybe :map]]
    [:viz-settings   {:optional true} [:maybe :map]]]
   [:fn
    {:error/message "Query with a :type or :lib/type key"}
    (some-fn :type :lib/type)]
   [:fn
    {:error/message "Query should have :database unless it is :type :internal"}
    #(or
      (:database %)
      (= (keyword (:type %)) :internal))]])

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
