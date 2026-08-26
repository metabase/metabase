(ns metabase.lib-be.schema
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
  [:= {} {}])

(defn- normalize-query
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
  [:schema
   {:description      (deferred-tru "value must be a valid MBQL query.")
    :decode/normalize #(normalize-query % (tru "value must be a valid MBQL query."))}
   [:ref ::lib.schema/query]])

(mr/def ::internal-query
  [:map
   [:type   [:= {:decode/normalize keyword} :internal]]
   [:fn     :string]
   [:args   {:optional true} [:maybe [:sequential :any]]]
   [:limit  {:optional true} [:maybe :int]]
   [:offset {:optional true} [:maybe :int]]])

(mr/def ::maybe-legacy-or-internal-query
  [:multi {:dispatch    (fn [query] (and (map? query) (= (lib.util/normalized-query-type query) :internal)))
           :description (deferred-tru "value must be a valid MBQL query, or an internal audit query.")}
   [true  ::internal-query]
   [false ::maybe-legacy-query]])

(mr/def ::maybe-legacy-or-empty-query
  [:multi {:dispatch    (fn [query] (boolean (and (map? query) (empty? query))))
           :description (deferred-tru "value must be a valid MBQL query, or an empty query.")}
   [true  ::empty-query]
   [false ::maybe-legacy-query]])
