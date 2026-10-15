(ns metabase-enterprise.library-branching.db
  "App DB queries of library branching."
  (:require
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::query
  [:map {::mr/deliberately-open true, :description "a HoneySQL select query"}])

(mr/def ::row
  [:map {::mr/deliberately-open true, :description "a row of a query, column name to value"}])

(mu/defn rows :- [:sequential ::row]
  "The rows that HoneySQL `query` selects, in the current transaction."
  [query :- ::query]
  (t2/query query))

(mu/defn row-count :- :int
  "The number of rows that HoneySQL `query` selects, in the current transaction, with one statement. `query` has the
  metadata `:allow-subquery`."
  [query :- ::query]
  (:n (t2/query-one {:select [[:%count.* :n]] :from [[query :q]]})))
