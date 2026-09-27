(ns metabase.jev.apps.usage
  "Endpoints exposing the intent model to the UI. Prototype scaffolding under `metabase.jev.*`.

    GET  /api/jev/usage/table/:id/shapes  — collective starter chips: what people DO on this table
    POST /api/jev/usage/observe           — feed a query the user ran/built, so the model learns live

  The chips are value-free *shapes* (\"filter a date range on ordered_at\"), never literals, so they are
  safe under sandboxing/tenancy. Learning is watch-only and in-memory for now."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.jev.apps.intent :as intent]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :get "/usage/table/:id/shapes" :- :any
  "Collective, value-free starter chips for a table: what people typically filter/aggregate/group here."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/read-check :model/Table id)
  (intent/table-shape-chips id))

(api.macros/defendpoint :post "/usage/observe" :- :any
  "Record the value-free facets of an MBQL inner-query the caller just ran or built. Body is
  `{:query <legacy-MBQL inner-query map>}`. Returns `{:observed true}`."
  [_route-params
   _query-params
   {:keys [query]} :- [:map {:closed false, ::mr/deliberately-open true}
                       [:query [:map {:closed false, ::mr/deliberately-open true}]]]]
  (intent/observe-query! api/*current-user-id* query)
  {:observed true})

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/usage/…` routes."
  (api.macros/ns-handler *ns*))
