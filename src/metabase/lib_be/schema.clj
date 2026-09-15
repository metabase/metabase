(ns metabase.lib-be.schema
  (:refer-clojure :exclude [empty?])
  (:require
   [metabase.lib-be.models.transforms :as lib-be.transforms]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.lib.schema.middleware-options :as lib.schema.middleware-options]
   [metabase.lib.util :as lib.util]
   [metabase.util.i18n :refer [deferred-tru tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
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
   [:or ::lib.schema/query ::lib.util/legacy-query]])

(mr/def ::internal-query.scope
  "Mirrors `metabase.actions.types/scope.normalized`. Duplicated (rather than referenced) so this namespace does not
  have to depend on the `actions` module."
  [:or
   [:map {:closed true} [:type :keyword] [:dashboard-id ms/PositiveInt]]
   [:map {:closed true} [:type :keyword] [:dashcard-id ms/PositiveInt]]
   [:map {:closed true} [:type :keyword] [:card-id ms/PositiveInt]]
   [:map {:closed true} [:type :keyword] [:model-id ms/PositiveInt]]
   [:map {:closed true} [:type :keyword] [:table-id ms/PositiveInt]]
   [:map {:closed true} [:type :keyword] [:webhook-id ms/PositiveInt]]
   [:map {:closed true} [:type :keyword] [:unknown [:enum :model-action]]]])

(mr/def ::internal-query
  "An internal (audit) query: either the QP's own `:fn`/`:args` invocation shape, or the action-descriptor shape
  stashed on a [[metabase.actions.audit/Base]] row's `:template` for a `:model.row/*` or similar action."
  [:map {:closed true}
   [:type       [:= {:decode/normalize keyword} :internal]]
   [:fn         {:optional true} :string]
   [:args       {:optional true} [:maybe [:sequential [:maybe [:or :string number? :boolean]]]]]
   [:limit      {:optional true} [:maybe :int]]
   [:offset     {:optional true} [:maybe :int]]
   [:middleware {:optional true} [:ref ::lib.schema.middleware-options/middleware-options]]
   [:info       {:optional true} [:maybe [:ref ::lib.schema.info/info]]]
   [:action     {:optional true} [:or :string :keyword]]
   [:database   {:optional true} [:maybe pos-int?]]
   [:scope      {:optional true} ::internal-query.scope]
   [:action-id  {:optional true} [:maybe pos-int?]]])

(mr/def ::maybe-legacy-or-internal-query
  [:multi {:dispatch    (fn [query] (and (map? query) (contains? #{:internal "internal"} (or (:type query) (get query "type")))))
           :description (deferred-tru "value must be a valid MBQL query, or an internal audit query.")}
   [true  ::internal-query]
   [false ::maybe-legacy-query]])

(mr/def ::maybe-legacy-or-empty-query
  [:multi {:dispatch    (fn [query] (boolean (and (map? query) (empty? query))))
           :description (deferred-tru "value must be a valid MBQL query, or an empty query.")}
   [true  ::empty-query]
   [false ::maybe-legacy-query]])
