(ns metabase-enterprise.data-sensitivity.api.proposals
  "`/api/ee/data-sensitivity/proposals` routes: read the pending AI proposals of a database, its tables or its fields,
  and accept or reject them. See [[metabase-enterprise.data-sensitivity.review]]. Every endpoint requires a
  superuser."
  (:require
   [medley.core :as m]
   [metabase-enterprise.data-sensitivity.db :as db]
   [metabase-enterprise.data-sensitivity.review :as review]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private ScopeParams
  [:map {:closed true}
   [:database-id {:optional true} [:maybe ms/PositiveInt]]
   [:schema      {:optional true} [:maybe ms/NonBlankString]]
   [:table-id    {:optional true} [:maybe ms/PositiveInt]]])

(defn- scope
  "The scope that the query params give. A scope needs `database-id` or `table-id`, and `schema` needs
  `database-id`. An unknown database or table is a 404."
  [{:keys [database-id schema table-id]}]
  (api/check-400 (or database-id table-id) (tru "Give database-id or table-id."))
  (api/check-400 (or (nil? schema) database-id) (tru "schema needs database-id."))
  (when database-id
    (api/check-404 (db/database database-id)))
  (when table-id
    (api/check-404 (db/active-table table-id)))
  (m/assoc-some {}
                :database_id database-id
                :schema      schema
                :table_ids   (some-> table-id vector)))

(api.macros/defendpoint :get "/proposals/tables" :- [:sequential ::review/table-counts]
  "One entry per table of the database `database-id` (in `schema` when given), or of the table `table-id`, that has
  pending AI proposals: their number, and the number of them that would replace a value a person set."
  [_route-params
   params :- ScopeParams]
  (api/check-superuser)
  (review/table-counts (scope params)))

(api.macros/defendpoint :get "/proposals" :- [:sequential ::review/proposal]
  "The pending AI proposals of the database `database-id` (in `schema` when given), or of the table `table-id`, in
  table and field order, with their reasoning. `current_value` and `source` are the value readers see now and its
  layer."
  [_route-params
   params :- ScopeParams]
  (api/check-superuser)
  (review/pending-proposals (scope params)))

(api.macros/defendpoint :post "/proposals/apply" :- ::review/apply-result
  "Apply a review in one request: write the proposals in `accept` and `edits`, or with `reject_all` delete every
  pending proposal of the database `database_id`. `edits` maps a proposal id to a value that replaces the proposed
  value and accepts the proposal; the value follows the rules of the attribute (a data-sensitivity category, a
  semantic type that fits the field and is not a key type, or a non-blank plain-text description of at most 200
  characters, without links, HTML tags or backticks), else the request is a 400 and nothing is written. An edited
  value is written as the person's value, any other as an AI value, and an unedited proposal over a value a person
  set clears that value. `proposed_values` maps a proposal id to the proposed value that the client saw: a proposal
  that a run changed or deleted since is not written, and is listed in `failures` as `changed`. Each table is one
  transaction; a written proposal is deleted. A proposal that cannot be written stays pending and is listed in
  `failures`."
  [_route-params
   _query-params
   body :- [:maybe ::review/apply-request]]
  (api/check-superuser)
  (review/apply! (or body {}) api/*current-user-id*))

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the AI proposal API."
  (api.macros/ns-handler *ns* +auth))
