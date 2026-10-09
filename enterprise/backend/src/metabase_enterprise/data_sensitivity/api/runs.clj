(ns metabase-enterprise.data-sensitivity.api.runs
  "`/api/ee/data-sensitivity/runs` routes: start, read, cancel and retry background metadata generation runs. See
  [[metabase-enterprise.data-sensitivity.runner]]. Every endpoint requires a superuser."
  (:require
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.models.metadata-generation-run :as run]
   [metabase-enterprise.data-sensitivity.review :as review]
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

(api.macros/defendpoint :get "/runs/estimate" :- ::runner/estimate
  "The size of the run that `POST /runs` would start with the same parameters: tables, fields, and about how many
  tokens and USD it uses, from bench ratios. Query params are kebab-case: `database-id`, `table-ids`. `unavailable_reason` is why a start would fail now, or nil."
  [_route-params
   {:keys [database-id schemas table-ids attributes]}
   :- [:map {:closed true}
       [:database-id ms/PositiveInt]
       [:schemas     {:optional true} [:maybe (ms/QueryVectorOf ms/NonBlankString)]]
       [:table-ids   {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
       [:attributes  {:optional true} [:maybe (ms/QueryVectorOf ::run/attribute)]]]]
  (api/check-superuser)
  (let [database (api/check-404 (db/database database-id))]
    (runner/estimate database (cond-> {}
                                (seq schemas)    (assoc :schemas schemas)
                                (seq table-ids)  (assoc :table_ids table-ids)
                                (seq attributes) (assoc :attributes attributes)))))

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

(api.macros/defendpoint :get "/runs/:id/tables" :- [:sequential ::review/run-table]
  "The tables that have suggestions in the run, with the number of suggestions by status and the number of pending
  suggestions that would replace a value a person set."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (db/run id))
  (review/run-tables id))

(api.macros/defendpoint :get "/runs/:id/tables/:table-id/suggestions" :- [:sequential ::review/suggestion]
  "The suggestions of the run for one table, in field order. `current_value` and `source` are the effective value and
  its layer when the run read the field."
  [{:keys [id table-id]} :- [:map {:closed true}
                             [:id       ms/PositiveInt]
                             [:table-id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (db/run id))
  (db/table-suggestions id table-id))

(api.macros/defendpoint :post "/runs/:id/decisions" :- [:map [:updated ms/IntGreaterThanOrEqualToZero]]
  "Accept, unaccept or reject suggestions of the run: those in `suggestion_ids`, those of the tables in `table_ids`, or
  `all`. Give exactly one. Unaccept moves accepted and rejected suggestions back to pending. Accept or unaccept by
  table or for the whole run leaves out suggestions that would replace a value a person set, unless
  `include_human_set` is true. Stale and applied suggestions do not change. Writes no field metadata."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   body :- ::review/decision-request]
  (api/check-superuser)
  (api/check-404 (db/run id))
  (review/decide! id body api/*current-user-id*))

(api.macros/defendpoint :post "/runs/:id/apply" :- ::review/apply-result
  "Write the accepted suggestions of the run as accepted AI values, for the tables in `table_ids`, else for every table.
  Each table is one transaction. A suggestion over a value a person set clears that value. A suggestion whose field
  changed after the run is marked `stale` and skipped. A suggestion that cannot be written stays accepted and is
  listed in `failures`."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query-params
   body :- [:maybe ::review/apply-request]]
  (api/check-superuser)
  (api/check-404 (db/run id))
  (review/apply! id (or body {}) api/*current-user-id*))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the metadata generation run API."
  (api.macros/ns-handler *ns* +auth))
