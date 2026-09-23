(ns metabase.jev.api
  "A DUMB pass-through to TypeSafe's System One model (Jev), for prototyping.

  The frontend cannot call Jev directly without shipping the API key to the browser, so this endpoint
  forwards a request from the FE to Jev using the server-side key (`JEV_KEY` in the process env) and
  returns Jev's answer verbatim. It is a thin proxy on purpose — the FE sends Jev's own
  `{state, questions, model?}` shape, we add auth + the key, and pass it through — so any FE caller can
  prototype whatever judgments it wants without a new backend change per experiment.

  This is prototype scaffolding, not a finished feature: no caching, no per-use typing, no cost limits.
  When a demo settles on a specific judgment, promote it to a typed endpoint that assembles its own
  `state` from Metabase data server-side (columns, fingerprints, sample rows) rather than trusting the
  client to send it."
  (:require
   [compojure.core :as compojure]
   [metabase.api.macros :as api.macros]
   [metabase.jev.apps.dashboard-focus :as jev.dashboard-focus]
   [metabase.jev.apps.explorations :as jev.explorations]
   [metabase.jev.apps.filters :as jev.filters]
   [metabase.jev.apps.joins :as jev.joins]
   [metabase.jev.apps.saving :as jev.saving]
   [metabase.jev.apps.search :as jev.search]
   [metabase.jev.apps.tables :as jev.tables]
   [metabase.jev.apps.usage :as jev.usage]
   [metabase.jev.apps.viz :as jev.viz]
   [metabase.jev.client :as jev]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/" :- :any
  "Pass a Jev System One request through to Jev and return its answer.

  Body is Jev's own request shape: `{:state <string|map|vector>, :questions {id question}, :model? \"…\"}`
  where each question is `{:type \"choice\"|\"noul\"|\"score\" :instructions … :criteria …}`. Returns
  Jev's response (`{:model … :answers {id answer} :usage …}`) on success, or `{:error …}` with Jev's
  status on failure. Any authenticated user may call it — this is prototype scaffolding."
  [_route-params
   _query-params
   ;; Dumb pass-through: we forward the body to Jev verbatim, so accept an arbitrary object and let Jev
   ;; validate its own `{:state :questions :model?}` shape. The deliberately-open marker satisfies the
   ;; defendpoint "close your schemas" rule for a body whose keys really aren't ours to declare.
   body :- [:map {:closed false, ::mr/deliberately-open true}]]
  (let [{:keys [status body]} (jev/pass-through body)]
    (if (= 200 status)
      body
      {:error (str "Jev returned HTTP " status) :status status :body body})))

(def ^{:arglists '([request respond raise])} routes
  "`/api/jev/` routes: the dumb pass-through (this ns) plus the typed table-suggestions routes
  ([[metabase.jev.apps.tables]]). All Jev prototype scaffolding lives under `/api/jev`."
  (compojure/routes jev.tables/routes
                    jev.explorations/routes
                    jev.joins/routes
                    jev.usage/routes
                    jev.viz/routes
                    jev.dashboard-focus/routes
                    jev.filters/routes
                    jev.search/routes
                    jev.saving/routes
                    (api.macros/ns-handler *ns*)))
