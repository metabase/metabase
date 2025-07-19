(ns metabase.query-processor.schema
  (:require
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.regex :as u.regex]))

;; this schema is not very strict because we need to handle different types of queries (legacy MBQL, pMBQL, super-legacy
;; MBQL, internal audit app queries, etc.) and it might not be normalized yet.
(mr/def ::query
  [:and
   :map
   [:fn
    {:error/message "Query with a :type or :lib/type key"}
    (some-fn :type :lib/type)]])

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
   [:cat ::query ::rff]
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
                :api/regex   export-formats-regex}]
        export-formats))
