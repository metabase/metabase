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

  This schema is not very strict because we need to handle different types of queries (legacy MBQL, pMBQL,
  super-legacy MBQL, internal audit app queries, etc.) and it might not be normalized yet."
  [:and
   [:map
    [:database {:optional true} [:or
                                 ::lib.schema.id/database
                                 ::lib.schema.id/saved-questions-virtual-database]]]
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
