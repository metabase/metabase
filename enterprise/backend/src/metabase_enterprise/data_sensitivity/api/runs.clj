(ns metabase-enterprise.data-sensitivity.api.runs
  "`/api/ee/data-sensitivity/runs` routes: start, read, cancel and retry background metadata generation runs. See
  [[metabase-enterprise.data-sensitivity.runner]]. Every endpoint requires a superuser."
  (:require
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase-enterprise.data-sensitivity.runner :as runner]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/runs" :- ::run/metadata-generation-run
  "Start a background metadata generation run over the active tables of a database: all of them, those in `schemas`,
  or `table_ids`. `attributes` defaults to data sensitivity and semantic type. The run writes suggestions only. A
  database has at most one active run: a second start is a 409. Poll `GET /runs/:id` for progress."
  [_route-params
   _query-params
   {:keys [database_id] :as body} :- [:merge
                                      [:map {:closed true} [:database_id ms/PositiveInt]]
                                      ::runner/start-request]]
  (api/check-superuser)
  (let [database (api/check-404 (db/database database_id))]
    (runner/start-run! database (dissoc body :database_id) api/*current-user-id*)))

(api.macros/defendpoint :get "/runs" :- [:sequential ::run/metadata-generation-run]
  "The 20 newest metadata generation runs of a database, newest first."
  [_route-params
   {database-id :database-id} :- [:map {:closed true} [:database-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (db/database database-id))
  (db/latest-runs database-id))

(api.macros/defendpoint :get "/runs/:id" :- ::run/metadata-generation-run
  "A metadata generation run: status, table progress, per-table errors and token usage."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (db/run id)))

(api.macros/defendpoint :post "/runs/:id/cancel" :- ::run/metadata-generation-run
  "Cancel a pending or running run. The run is `canceling` until its worker stops, at most one chunk call later, and
  then `canceled`. A run that has ended is a 409."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (runner/cancel-run! id)))

(api.macros/defendpoint :post "/runs/:id/retry-failed" :- ::run/metadata-generation-run
  "Start a new run over the tables that failed or were not processed in the ended run `id`, with the same
  attributes."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-superuser)
  (let [run      (api/check-404 (db/run id))
        database (api/check-404 (db/database (:database_id run)))]
    (runner/retry-failed! database run api/*current-user-id*)))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the metadata generation run API."
  (api.macros/ns-handler *ns* +auth))
