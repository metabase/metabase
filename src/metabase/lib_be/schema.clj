(ns metabase.lib-be.schema
  "Schemas for queries as they cross a boundary into the backend -- an API request param, or a row read back out of
  the app DB. Both may still be legacy MBQL, so both normalize to MBQL 5 on the way in."
  (:refer-clojure :exclude [empty?])
  (:require
   [metabase.lib-be.models.transforms :as lib-be.transforms]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [empty?]]))

(set! *warn-on-reflection* true)

(mr/def ::empty-query
  "An empty query, allowed for Card.dataset_query for historic purposes."
  [:= {} {}])

(defn- normalize-query
  "Normalize `query` to MBQL 5, rejecting anything that is not a map with `message`.

  A non-map has to be rejected here rather than passed along: [[lib-be.transforms/normalize-query]] takes
  `[:maybe :map]` and throws, which surfaces as a 500; and passing one through is worse still, because normalizing a
  non-map yields nil, so a `[:maybe ...]` param would quietly accept garbage as \"no query at all\".

  Normalization is strict: a query that cannot be normalized is a 400 carrying the specific error (\"Query must
  include :database\", ...) rather than the non-strict degradation to `{}`, which would silently satisfy any schema
  with an empty-query branch."
  [query message]
  (if (map? query)
    (try
      (-> (lib-be.transforms/normalize-query nil query {:strict? true})
          lib/prepare-after-deserialization)
      (catch Exception e
        (throw (ex-info (ex-message e)
                        {:status-code (or (:status-code (ex-data e)) 400)}))))
    (throw (ex-info message {:status-code 400}))))

(mr/def ::maybe-legacy-query
  "A query that may arrive as legacy MBQL -- normalization converts it on the way in, so what this validates is always
  MBQL 5. Use this for anything incoming, such as an API request param. An empty query is not valid."
  [:schema
   {:description      (deferred-tru "value must be a valid MBQL query.")
    :decode/normalize #(normalize-query % (tru "value must be a valid MBQL query."))}
   [:ref ::lib.schema/query]])

(mr/def ::internal-query
  "A legacy internal audit query, e.g. `{:type :internal, :fn ...}`. These are not MBQL; the audit-app middleware
  validates the `:fn` and `:args` against the queries it defines."
  [:map
   [:type   [:= {:decode/normalize keyword} :internal]]
   [:fn     :string]
   [:args   {:optional true} [:maybe [:sequential :any]]]
   [:limit  {:optional true} [:maybe :int]]
   [:offset {:optional true} [:maybe :int]]])

(mr/def ::maybe-legacy-or-internal-query
  "Like [[::maybe-legacy-query]], but also allows internal audit queries. This is what query-execution endpoints like
  `POST /api/dataset` accept."
  [:multi {:dispatch    (fn [query] (and (map? query) (= (lib.util/normalized-query-type query) :internal)))
           :description (deferred-tru "value must be a valid MBQL query, or an internal audit query.")}
   [true  ::internal-query]
   [false ::maybe-legacy-query]])

(mr/def ::maybe-legacy-or-empty-query
  "Like [[::maybe-legacy-query]], but also allows an empty query. Cards are for some wacko reason allowed to be saved
  with empty queries (`{}`), but not `NULL` ones, because the column is non-null -- `:dataset_query {}` is even the
  `with-temp` default. So this is what already-saved things validate against; something being created has no reason to
  have an empty query."
  [:multi {:dispatch    (fn [query] (boolean (and (map? query) (empty? query))))
           :description (deferred-tru "value must be a valid MBQL query, or an empty query.")}
   [true  ::empty-query]
   [false ::maybe-legacy-query]])
